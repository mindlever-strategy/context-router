/**
 * Schema Migration Service
 * Manages data transformation between schema versions
 */

import { prisma } from '../db/client.js';
import type { Prisma } from '../generated/postgresql/client.js';

export interface SchemaTransform {
  type: 'add_field' | 'remove_field' | 'rename_field' | 'transform_field' | 'change_type';
  field: string;
  to?: string;              // For rename
  value?: unknown;          // For add_field
  fn?: string;             // For transform_field (stored procedure name)
  toType?: string;          // For change_type
}

export interface SchemaMigrationRequest {
  workspaceId: string;
  ownerId: string;
  schemaName: string;
  fromVersion: number;
  toVersion: number;
  transforms: SchemaTransform[];
  options?: {
    dryRun?: boolean;
    batchSize?: number;
  };
}

export interface SchemaMigrationResult {
  success: boolean;
  affectedWorkflows: string[];
  affectedStates: number;
  errors: Array<{
    workflowId: string;
    key: string;
    error: string;
  }>;
}

export interface SchemaDiffResult {
  addedFields: string[];
  removedFields: string[];
  changedFields: Array<{ field: string; from: unknown; to: unknown }>;
}

/**
 * Apply a single transform to a value
 */
function applyTransform(
  value: unknown,
  transform: SchemaTransform,
): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const obj = value as Record<string, unknown>;

  switch (transform.type) {
    case 'add_field':
      // Field will be added with default value
      // Return a new object with the field added
      return {
        ...obj,
        [transform.field]: transform.value ?? null,
      };

    case 'remove_field': {
      const { [transform.field]: _, ...rest } = obj;
      return rest;
    }

    case 'rename_field':
      if (transform.to) {
        const val = obj[transform.field];
        const { [transform.field]: __, ...rest } = obj;
        return { ...rest, [transform.to]: val };
      }
      return value;

    case 'transform_field':
      // For transform_field, the actual transformation would be applied
      // In production, this might call an LLM or stored procedure
      // For now, we just return the value unchanged
      return value;

    case 'change_type':
      // Type conversion
      if (obj[transform.field] === undefined) {
        return value;
      }
      switch (transform.toType) {
        case 'string':
          return { ...obj, [transform.field]: String(obj[transform.field]) };
        case 'number':
          return { ...obj, [transform.field]: Number(obj[transform.field]) };
        case 'boolean':
          return { ...obj, [transform.field]: Boolean(obj[transform.field]) };
        case 'array':
          return { ...obj, [transform.field]: Array(obj[transform.field]) };
        case 'object':
          return { ...obj, [transform.field]: Object(obj[transform.field]) };
        default:
          return value;
      }

    default:
      return value;
  }
}

/**
 * Migrate schema data from one version to another
 */
export async function migrateSchema(
  request: SchemaMigrationRequest,
): Promise<SchemaMigrationResult> {
  const {
    workspaceId,
    ownerId: _ownerId,
    schemaName,
    fromVersion,
    toVersion,
    transforms,
    options = {},
  } = request;

  const batchSize = options.batchSize ?? 100;
  const dryRun = options.dryRun ?? false;

  // Validate versions exist
  const [fromSchema, toSchema] = await Promise.all([
    prisma.schema.findFirst({
      where: { workspaceId, name: schemaName, version: fromVersion },
    }),
    prisma.schema.findFirst({
      where: { workspaceId, name: schemaName, version: toVersion },
    }),
  ]);

  if (!fromSchema) {
    throw new Error(`FROM_VERSION_NOT_FOUND: ${fromVersion}`);
  }
  if (!toSchema) {
    throw new Error(`TO_VERSION_NOT_FOUND: ${toVersion}`);
  }

  // Get all states in the workspace
  // In production, you'd want to track which schema each state uses
  const states = await prisma.state.findMany({
    where: { workspaceId },
    take: batchSize,
  });

  const errors: SchemaMigrationResult['errors'] = [];
  let affectedCount = 0;
  const affectedWorkflows = new Set<string>();

  for (const state of states) {
    try {
      let newValue = state.value as Record<string, unknown>;

      // Apply each transform in order
      for (const transform of transforms) {
        newValue = applyTransform(newValue, transform) as Record<string, unknown>;
      }

      if (!dryRun) {
        await prisma.state.update({
          where: { id: state.id },
          data: {
            value: newValue as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
      }

      affectedCount++;
      affectedWorkflows.add(state.workflowId);
    } catch (error) {
      errors.push({
        workflowId: state.workflowId,
        key: state.key,
        error: (error as Error).message,
      });
    }
  }

  // Log migration (in production, this would go to a schema_migrations table)
  if (!dryRun && affectedCount > 0) {
    console.log(
      `[SchemaMigration] Migrated ${schemaName} from v${fromVersion} to v${toVersion}: ${affectedCount} states affected`,
    );
  }

  return {
    success: errors.length === 0,
    affectedWorkflows: [...affectedWorkflows],
    affectedStates: affectedCount,
    errors,
  };
}

/**
 * Compare two schema versions and return the differences
 */
export async function getSchemaDiff(
  workspaceId: string,
  schemaName: string,
  versionA: number,
  versionB: number,
): Promise<SchemaDiffResult> {
  const [schemaA, schemaB] = await Promise.all([
    prisma.schema.findFirst({
      where: { workspaceId, name: schemaName, version: versionA },
    }),
    prisma.schema.findFirst({
      where: { workspaceId, name: schemaName, version: versionB },
    }),
  ]);

  if (!schemaA || !schemaB) {
    throw new Error('SCHEMA_VERSION_NOT_FOUND');
  }

  const fieldsA = (schemaA.fields ?? {}) as Record<string, unknown>;
  const fieldsB = (schemaB.fields ?? {}) as Record<string, unknown>;

  const keysA = new Set(Object.keys(fieldsA));
  const keysB = new Set(Object.keys(fieldsB));

  const addedFields = [...keysB].filter((k) => !keysA.has(k));
  const removedFields = [...keysA].filter((k) => !keysB.has(k));
  const changedFields = [...keysA]
    .filter((k) => keysB.has(k) && JSON.stringify(fieldsA[k]) !== JSON.stringify(fieldsB[k]))
    .map((field) => ({
      field,
      from: fieldsA[field],
      to: fieldsB[field],
    }));

  return {
    addedFields,
    removedFields,
    changedFields,
  };
}

/**
 * Preview a migration without applying it
 */
export async function previewSchemaMigration(
  request: SchemaMigrationRequest,
): Promise<{
  wouldChange: number;
  sampleChanges: Array<{
    key: string;
    workflowId: string;
    change: string;
  }>;
}> {
  // Set dry run to true
  const result = await migrateSchema({
    ...request,
    options: { ...request.options, dryRun: true },
  });

  // Get sample of changes
  const sampleStates = await prisma.state.findMany({
    where: { workspaceId: request.workspaceId },
    take: 5,
  });

  const sampleChanges = sampleStates.map((state) => {
    const transforms = request.transforms.map((t) => {
      switch (t.type) {
        case 'add_field':
          return `add ${t.field} = ${JSON.stringify(t.value)}`;
        case 'remove_field':
          return `remove ${t.field}`;
        case 'rename_field':
          return `rename ${t.field} -> ${t.to}`;
        case 'change_type':
          return `change ${t.field} type to ${t.toType}`;
        default:
          return `${t.type} ${t.field}`;
      }
    });
    return {
      key: state.key,
      workflowId: state.workflowId,
      change: transforms.join(', '),
    };
  });

  return {
    wouldChange: result.affectedStates,
    sampleChanges,
  };
}
