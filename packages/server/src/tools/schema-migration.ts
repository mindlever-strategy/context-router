/**
 * Schema Migration MCP Tools
 * Migrate state data between schema versions and compare schemas
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { migrateSchema, getSchemaDiff, previewSchemaMigration } from '../services/schema-migration.js';
import { recordSchemaMigration } from '../telemetry/metrics.js';
import {
  defineTool,
  string,
  ToolOperationError,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

const transformSchema = z.object({
  type: z.enum(['add_field', 'remove_field', 'rename_field', 'transform_field', 'change_type']),
  field: z.string(),
  to: z.string().optional(),
  value: z.unknown().optional(),
  fn: z.string().optional(),
  toType: z.string().optional(),
});

export function registerSchemaMigrationTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'schema_migrate',
    defineTool(
      {
        name: 'schema_migrate',
        description:
          'Migrate state data between schema versions. Transforms state values according to the specified transforms. Use dryRun to preview without applying.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            schemaName: string,
            fromVersion: {
              type: 'number',
              description: 'Source schema version',
            },
            toVersion: {
              type: 'number',
              description: 'Target schema version',
            },
            transforms: {
              type: 'array',
              description: 'Transform operations to apply',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['add_field', 'remove_field', 'rename_field', 'transform_field', 'change_type'],
                  },
                  field: string,
                  to: string,
                  value: {},
                  fn: string,
                  toType: string,
                },
                required: ['type', 'field'],
              },
            },
            dryRun: {
              type: 'boolean',
              description: 'Report what the migration would change without applying it',
            },
            batchSize: {
              type: 'number',
              description: 'Records to process per batch',
            },
          },
          required: ['workspaceId', 'schemaName', 'fromVersion', 'toVersion', 'transforms'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        schemaName: z.string().min(1).max(100),
        fromVersion: z.number().int().min(1),
        toVersion: z.number().int().min(1),
        transforms: z.array(transformSchema).min(1),
        dryRun: z.boolean().default(false),
        batchSize: z.number().int().min(1).max(1000).default(100),
      }),
      async ({ workspaceId, schemaName, fromVersion, toVersion, transforms, dryRun, batchSize }) => {
        // Validate versions are different
        if (fromVersion === toVersion) {
          throw new ToolOperationError('VALIDATION_ERROR', 'fromVersion and toVersion must be different');
        }

        // Preview mode - no changes applied
        if (dryRun) {
          const preview = await previewSchemaMigration({
            workspaceId,
            ownerId: getCurrentUserId(),
            schemaName,
            fromVersion,
            toVersion,
            transforms,
          });
          return {
            ...preview,
            schemaName,
            fromVersion,
            toVersion,
            dryRun: true,
          };
        }

        // Apply migration
        const result = await migrateSchema({
          workspaceId,
          ownerId: getCurrentUserId(),
          schemaName,
          fromVersion,
          toVersion,
          transforms,
          options: { batchSize },
        });

        // Record metrics
        recordSchemaMigration(fromVersion, toVersion, result.affectedStates);

        return {
          ...result,
          fromVersion,
          toVersion,
          schemaName,
          message: result.success
            ? `Successfully migrated ${result.affectedStates} states`
            : `Migration completed with ${result.errors.length} errors`,
        };
      },
    ),
  );

  tools.set(
    'schema_diff',
    defineTool(
      {
        name: 'schema_diff',
        description:
          'Compare two schema versions. Shows added, removed, and changed fields.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            schemaName: string,
            versionA: {
              type: 'number',
              description: 'First schema version',
            },
            versionB: {
              type: 'number',
              description: 'Second schema version',
            },
          },
          required: ['workspaceId', 'schemaName', 'versionA', 'versionB'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        schemaName: z.string().min(1).max(100),
        versionA: z.number().int().min(1),
        versionB: z.number().int().min(1),
      }),
      async ({ workspaceId, schemaName, versionA, versionB }) => {
        const result = await getSchemaDiff(workspaceId, schemaName, versionA, versionB);
        return {
          ...result,
          schemaName,
          versionA,
          versionB,
        };
      },
    ),
  );

  return tools;
}
