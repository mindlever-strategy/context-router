import { Prisma, type WorkflowStatus } from '../generated/postgresql/client.js';
import {
  assertWriteAllowed,
  filterReadableState,
} from '../services/agent-role.js';
import {
  type ProvenanceMeta,
  unwrapState,
  wrapStateValue,
} from '../services/provenance.js';
import { normalizeWorkspaceName } from '../services/workspace.js';
import {
  SchemaValidator,
  type FieldDefinition,
} from '../services/schema-validator.js';
import { prisma, storageConfig } from './client.js';
import {
  journaledStateWrite,
  journaledStateDelete,
  journaledCheckpointCreate,
  journaledCheckpointRestore,
  journaledCheckpointDelete,
  journaledStepStart,
  journaledStepComplete,
  journaledStepFail,
  journaledWorkflowCreated,
  journaledWorkflowComplete,
  journaledWorkflowFail,
} from '../services/journal-hooks.js';

export type WriteStateOptions = {
  expectedVersion?: number;
  agentRole?: string;
  provenance?: ProvenanceMeta;
  provenanceMode?: 'per-field' | 'whole-object';
  expiresIn?: number;          // TTL: seconds from now
  expiresAt?: Date;            // TTL: absolute expiration time
};

export type StateWriteEntry = {
  key: string;
  value: Prisma.InputJsonValue;
  schemaName?: string;
};

export type WriteStateBatchOptions = {
  atomic?: boolean;             // All or nothing
  onConflict?: 'upsert' | 'skip' | 'fail';
};

export type StateBatchResult = {
  key: string;
  success: boolean;
  version?: number;
  skipped?: boolean;
  error?: string;
};

export type ReadStateBatchOptions = {
  agentRole?: string;
  unwrap?: boolean;
};

const batchValidator = new SchemaValidator();

export async function createWorkspace(name: string, ownerId: string) {
  return publicWorkspace(
    await prisma.workspace.create({ data: { name, ownerId } }),
  );
}

export async function ensureWorkspace(name: string, ownerId: string) {
  const trimmedName = name.trim();
  const lookupKey = normalizeWorkspaceName(trimmedName);
  const existing = await prisma.workspace.findUnique({
    where: { ownerId_lookupKey: { ownerId, lookupKey } },
  });
  if (existing) return publicWorkspace(existing);

  const legacyCandidates = (
    await prisma.workspace.findMany({
      where: { ownerId, lookupKey: null },
      orderBy: { createdAt: 'asc' },
    })
  ).filter((workspace) => normalizeWorkspaceName(workspace.name) === lookupKey);
  if (legacyCandidates.length > 1) {
    throw new Error('WORKSPACE_NAME_AMBIGUOUS');
  }

  try {
    if (legacyCandidates[0]) {
      return publicWorkspace(
        await prisma.workspace.update({
          where: { id: legacyCandidates[0].id },
          data: { lookupKey },
        }),
      );
    }
    return publicWorkspace(
      await prisma.workspace.create({
        data: { name: trimmedName, ownerId, lookupKey },
      }),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.workspace.findUnique({
        where: { ownerId_lookupKey: { ownerId, lookupKey } },
      });
      if (raced) return publicWorkspace(raced);
    }
    throw error;
  }
}

export async function listWorkspaces(ownerId: string) {
  return (
    await prisma.workspace.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    })
  ).map(publicWorkspace);
}

export async function getWorkspace(workspaceId: string, ownerId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId },
  });
  return workspace ? publicWorkspace(workspace) : null;
}

export async function deleteWorkspace(workspaceId: string, ownerId: string) {
  const workspace = await getWorkspace(workspaceId, ownerId);
  if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
  return publicWorkspace(
    await prisma.workspace.delete({ where: { id: workspaceId } }),
  );
}

export async function createSchema(
  workspaceId: string,
  ownerId: string,
  name: string,
  fields: object,
  rules?: object[],
) {
  await requireWorkspace(workspaceId, ownerId);
  const payload = {
    ...(fields as Record<string, unknown>),
    ...(rules && rules.length > 0 ? { __semanticRules: rules } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const latest = await tx.schema.findFirst({
      where: { workspaceId, name },
      orderBy: { version: 'desc' },
    });
    return tx.schema.create({
      data: {
        workspaceId,
        name,
        fields: payload as Prisma.InputJsonValue,
        version: (latest?.version ?? 0) + 1,
      },
    });
  });
}

export async function getSchema(
  workspaceId: string,
  ownerId: string,
  name: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  return prisma.schema.findFirst({
    where: { workspaceId, name },
    orderBy: { version: 'desc' },
  });
}

export async function listSchemas(workspaceId: string, ownerId: string) {
  await requireWorkspace(workspaceId, ownerId);
  return prisma.schema.findMany({
    where: { workspaceId },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });
}

export async function createAgentRole(
  workspaceId: string,
  ownerId: string,
  name: string,
  allowedWriteKeys: string[],
  allowedReadKeys: string[],
) {
  await requireWorkspace(workspaceId, ownerId);
  return prisma.agentRole.create({
    data: {
      workspaceId,
      name,
      allowedWriteKeys,
      allowedReadKeys,
    },
  });
}

export async function listAgentRoles(workspaceId: string, ownerId: string) {
  await requireWorkspace(workspaceId, ownerId);
  const roles = await prisma.agentRole.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
  });
  return roles.map(normalizeAgentRole);
}

export async function getAgentRole(
  workspaceId: string,
  ownerId: string,
  name: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  const role = await prisma.agentRole.findFirst({
    where: { workspaceId, name },
  });
  return role ? normalizeAgentRole(role) : null;
}

export async function getRouterStatus(ownerId: string) {
  const workspaceWhere = { ownerId };
  const workflowWhere = { workspace: { ownerId } };
  const [
    workspaces,
    workflows,
    runningWorkflows,
    checkpoints,
    recentWorkflows,
  ] = await prisma.$transaction([
    prisma.workspace.count({ where: workspaceWhere }),
    prisma.workflow.count({ where: workflowWhere }),
    prisma.workflow.count({
      where: { ...workflowWhere, status: 'RUNNING' },
    }),
    prisma.checkpoint.count({ where: { workspace: { ownerId } } }),
    prisma.workflow.findMany({
      where: workflowWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);
  return {
    version: '0.3.1',
    storage: {
      engine: storageConfig.engine,
      ...(storageConfig.location ? { location: storageConfig.location } : {}),
    },
    totals: { workspaces, workflows, runningWorkflows, checkpoints },
    recentWorkflows,
  };
}

export async function createWorkflow(workspaceId: string, ownerId: string) {
  await requireWorkspace(workspaceId, ownerId);
  const workflow = await prisma.workflow.create({ data: { workspaceId } });

  // Journal the workflow creation (fire and forget)
  journaledWorkflowCreated(workspaceId, workflow.id, { source: 'createWorkflow' }).catch(() => {});

  return workflow;
}

export async function getWorkflow(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  return prisma.workflow.findFirst({ where: { id: workflowId, workspaceId } });
}

export async function transitionWorkflow(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  status: Exclude<WorkflowStatus, 'RUNNING'>,
  failureReason?: string,
) {
  const workflow = await requireRunningWorkflow(
    workspaceId,
    ownerId,
    workflowId,
  );

  const previousStatus = workflow.status;

  const updated = await prisma.workflow.update({
    where: { id: workflow.id },
    data: {
      status,
      completedAt: new Date(),
      failureReason: status === 'FAILED' ? failureReason : null,
    },
  });

  // Journal the workflow transition (fire and forget)
  if (status === 'COMPLETED') {
    journaledWorkflowComplete(workspaceId, workflowId, previousStatus, { source: 'transitionWorkflow' }).catch(() => {});
  } else if (status === 'FAILED') {
    journaledWorkflowFail(workspaceId, workflowId, previousStatus, failureReason ?? 'Unknown', { source: 'transitionWorkflow' }).catch(() => {});
  }

  return updated;
}

export async function writeState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  key: string,
  value: Prisma.InputJsonValue,
  options: WriteStateOptions = {},
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);

  if (options.agentRole) {
    const role = await getAgentRole(workspaceId, ownerId, options.agentRole);
    if (!role) throw new Error('AGENT_ROLE_NOT_FOUND');
    assertWriteAllowed(key, role.allowedWriteKeys);
  }

  const existing = await prisma.state.findFirst({
    where: { workspaceId, workflowId, key },
  });

  let finalValue = value;
  if (options.provenance) {
    finalValue = wrapStateValue(
      value as Record<string, unknown>,
      options.provenance,
      options.provenanceMode ?? 'per-field',
    ) as Prisma.InputJsonValue;
  }

  // Compare-and-set must be a single conditional statement. Reading the
  // version and then writing lets two concurrent writers both pass the check.
  const expiresAt = resolveExpiry(options);

  const state =
    options.expectedVersion === undefined
      ? await prisma.state.upsert({
          where: { workflowId_key: { workflowId, key } },
          create: {
            workspaceId,
            workflowId,
            key,
            value: finalValue,
            expiresAt,
          },
          update: { value: finalValue, expiresAt, version: { increment: 1 } },
        })
      : await compareAndSetState(
          workspaceId,
          workflowId,
          key,
          finalValue,
          options.expectedVersion,
          expiresAt,
        );

  // Journal the state write (fire and forget, don't block the operation)
  journaledStateWrite(workspaceId, workflowId, {
    key,
    previousValue: existing?.value ?? null,
    newValue: finalValue,
    version: state.version,
    schemaValidated: Boolean(options.provenance),
  }, { source: 'writeState' }).catch(() => {});

  return state;
}

/**
 * Applies a versioned write as one conditional statement.
 *
 * `expectedVersion: 0` means "this key must not exist yet" and maps to an
 * insert whose unique-constraint violation is the conflict signal. Any other
 * value maps to an UPDATE ... WHERE version = ?, where a zero row count is
 * the conflict signal.
 */
async function compareAndSetState(
  workspaceId: string,
  workflowId: string,
  key: string,
  value: Prisma.InputJsonValue,
  expectedVersion: number,
  expiresAt: Date | null,
) {
  if (expectedVersion === 0) {
    try {
      return await prisma.state.create({
        data: { workspaceId, workflowId, key, value, expiresAt },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error('VERSION_CONFLICT');
      throw error;
    }
  }

  // A separate updateMany + findUnique leaves a window where a concurrent
  // deleteState makes the read-back return null (reporting STATE_NOT_FOUND
  // for a CAS that did commit), or a concurrent third writer bumps the row
  // so the read-back returns a version this call never produced — which the
  // caller would then treat as an observed version, defeating the exact
  // guarantee CAS exists to provide. extendedWhereUnique lets the version
  // check ride along in the same `where` as the compound unique key, so the
  // conditional update and the row it returns are one statement.
  try {
    return await prisma.state.update({
      where: { workflowId_key: { workflowId, key }, version: expectedVersion },
      data: { value, expiresAt, version: { increment: 1 } },
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new Error('VERSION_CONFLICT');
    throw error;
  }
}

/**
 * Resolves the absolute expiry for a write. `expiresAt` wins over `expiresIn`;
 * neither means the key never expires.
 */
function resolveExpiry(options: WriteStateOptions): Date | null {
  if (options.expiresAt) return options.expiresAt;
  if (options.expiresIn !== undefined && options.expiresIn > 0) {
    return new Date(Date.now() + options.expiresIn * 1000);
  }
  return null;
}

/** Matches rows that have not expired: either no TTL, or a future TTL. */
const notExpired = () => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

export async function readState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  key: string,
  options: { agentRole?: string; unwrap?: boolean } = {},
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  const state = await prisma.state.findFirst({
    where: { workspaceId, workflowId, key, ...notExpired() },
  });
  if (!state) return null;

  if (options.agentRole) {
    const role = await getAgentRole(workspaceId, ownerId, options.agentRole);
    if (!role) throw new Error('AGENT_ROLE_NOT_FOUND');
    const filtered = filterReadableState(
      { [key]: state.value },
      role.allowedReadKeys,
    );
    if (!filtered[key]) throw new Error('READ_FORBIDDEN');
  }

  if (options.unwrap) {
    return {
      ...state,
      value: unwrapState({ [key]: state.value })[key] as Prisma.JsonValue,
    };
  }
  return state;
}

export async function readStateFields(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  keys?: string[],
  options: { agentRole?: string; unwrap?: boolean } = {},
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  const states = await prisma.state.findMany({
    where: {
      workspaceId,
      workflowId,
      ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
      ...notExpired(),
    },
    orderBy: { key: 'asc' },
  });
  let values: Record<string, Prisma.JsonValue> = Object.fromEntries(
    states.map((state) => [state.key, state.value]),
  );

  if (options.agentRole) {
    const role = await getAgentRole(workspaceId, ownerId, options.agentRole);
    if (!role) throw new Error('AGENT_ROLE_NOT_FOUND');
    values = filterReadableState(
      values as Record<string, unknown>,
      role.allowedReadKeys,
    ) as Record<string, Prisma.JsonValue>;
  }

  return options.unwrap
    ? (unwrapState(values as Record<string, unknown>) as Record<
        string,
        Prisma.JsonValue
      >)
    : values;
}

export async function deleteState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  key: string,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);

  // Capture the value before deletion for journaling
  const existing = await prisma.state.findFirst({
    where: { workspaceId, workflowId, key },
  });
  if (!existing) throw new Error('STATE_NOT_FOUND');

  const result = await prisma.state.deleteMany({
    where: { workspaceId, workflowId, key },
  });
  if (result.count === 0) throw new Error('STATE_NOT_FOUND');

  // Journal the state deletion (fire and forget)
  journaledStateDelete(workspaceId, workflowId, {
    key,
    previousValue: existing.value as Prisma.InputJsonValue,
  }, { source: 'deleteState' }).catch(() => {});

  return { key };
}

export async function snapshotState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  options: { agentRole?: string; unwrap?: boolean } = {},
) {
  return readStateFields(workspaceId, ownerId, workflowId, undefined, options);
}

/** A checkpoint row: the value plus the metadata a restore must reinstate. */
type CheckpointEntry = {
  value: Prisma.InputJsonValue;
  version: number;
  expiresAt: string | null;
};

/**
 * Reads a checkpoint snapshot in either format.
 *
 * Checkpoints written before version/expiry preservation stored a bare
 * key -> value map. Those still restore, defaulting to version 1 and no TTL.
 */
function readCheckpointEntries(
  snapshot: unknown,
): Record<string, CheckpointEntry> {
  const entries = Object.entries(
    (snapshot ?? {}) as Record<string, unknown>,
  );
  return Object.fromEntries(
    entries.map(([key, raw]) => {
      const candidate = raw as Partial<CheckpointEntry> | null;
      const isNewFormat =
        candidate !== null &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        'value' in candidate &&
        typeof candidate.version === 'number';

      return isNewFormat
        ? [
            key,
            {
              value: candidate.value as Prisma.InputJsonValue,
              version: candidate.version as number,
              expiresAt: candidate.expiresAt ?? null,
            },
          ]
        : [
            key,
            {
              value: raw as Prisma.InputJsonValue,
              version: 1,
              expiresAt: null,
            },
          ];
    }),
  );
}

export async function createCheckpoint(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  label?: string,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);

  const rows = await prisma.state.findMany({
    where: { workspaceId, workflowId, ...notExpired() },
    orderBy: { key: 'asc' },
  });
  const snapshot: Record<string, CheckpointEntry> = Object.fromEntries(
    rows.map((row) => [
      row.key,
      {
        value: row.value as Prisma.InputJsonValue,
        version: row.version,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      },
    ]),
  );

  const checkpoint = await prisma.checkpoint.create({
    data: {
      workspaceId,
      workflowId,
      snapshot: snapshot as Prisma.InputJsonValue,
      label,
    },
  });

  // Journal the checkpoint creation (fire and forget)
  journaledCheckpointCreate(workspaceId, workflowId, {
    checkpointId: checkpoint.id,
    label: checkpoint.label ?? undefined,
    stateKeys: Object.keys(snapshot),
    snapshotSize: JSON.stringify(snapshot).length,
  }, { source: 'createCheckpoint' }).catch(() => {});

  return checkpoint;
}

export async function listCheckpoints(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  return prisma.checkpoint.findMany({
    where: { workspaceId, workflowId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function restoreCheckpoint(
  workspaceId: string,
  ownerId: string,
  checkpointId: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  const checkpoint = await prisma.checkpoint.findFirst({
    where: { id: checkpointId, workspaceId },
  });
  if (!checkpoint) throw new Error('CHECKPOINT_NOT_FOUND');
  await requireRunningWorkflow(workspaceId, ownerId, checkpoint.workflowId);

  const snapshot = readCheckpointEntries(checkpoint.snapshot);
  const stateKeysRestored = Object.keys(snapshot);

  await prisma.$transaction(async (tx) => {
    await tx.state.deleteMany({
      where: { workspaceId, workflowId: checkpoint.workflowId },
    });
    if (stateKeysRestored.length > 0) {
      await tx.state.createMany({
        data: Object.entries(snapshot).map(([key, entry]) => ({
          workspaceId,
          workflowId: checkpoint.workflowId,
          key,
          value: entry.value,
          version: entry.version,
          expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
        })),
      });
    }
  });

  // Journal the checkpoint restore (fire and forget)
  journaledCheckpointRestore(workspaceId, checkpoint.workflowId, {
    checkpointId,
    stateKeysRestored,
  }, { source: 'restoreCheckpoint' }).catch(() => {});

  return checkpoint;
}

export async function deleteCheckpoint(
  workspaceId: string,
  ownerId: string,
  checkpointId: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  const checkpoint = await prisma.checkpoint.findFirst({
    where: { id: checkpointId, workspaceId },
  });
  if (!checkpoint) throw new Error('CHECKPOINT_NOT_FOUND');
  await prisma.checkpoint.delete({ where: { id: checkpoint.id } });

  // Journal the checkpoint deletion (fire and forget)
  journaledCheckpointDelete(workspaceId, checkpoint.workflowId, {
    checkpointId,
    label: checkpoint.label ?? undefined,
  }, { source: 'deleteCheckpoint' }).catch(() => {});

  return { checkpointId };
}

export async function startStepRun(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  stepId: string,
  executionId: string,
  agentId?: string,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);

  const existing = await prisma.stepExecution.findUnique({
    where: {
      workflowId_stepId_executionId: { workflowId, stepId, executionId },
    },
  });

  if (existing?.status === 'SUCCEEDED') {
    return {
      cached: true,
      execution: existing,
      checkpoint: null,
    };
  }

  const checkpoint = await createCheckpoint(
    workspaceId,
    ownerId,
    workflowId,
    `before:${stepId}:${executionId}`,
  );

  const isRetry = Boolean(existing);
  const execution = existing
    ? await prisma.stepExecution.update({
        where: { id: existing.id },
        data: {
          status: 'RUNNING',
          agentId: agentId ?? existing.agentId,
          attempt: { increment: 1 },
        },
      })
    : await prisma.stepExecution.create({
        data: {
          workspaceId,
          workflowId,
          stepId,
          executionId,
          agentId,
          status: 'RUNNING',
        },
      });

  // Journal the step start (fire and forget)
  journaledStepStart(workspaceId, workflowId, {
    stepId,
    executionId,
    agentId: agentId ?? existing?.agentId ?? undefined,
    checkpointId: checkpoint.id,
    attempt: isRetry ? (existing?.attempt ?? 0) + 1 : 1,
  }, { source: 'startStepRun', agentId }).catch(() => {});

  return { cached: false, execution, checkpoint };
}

export async function completeStepRun(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  stepId: string,
  executionId: string,
  result?: Prisma.InputJsonValue,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);
  const execution = await prisma.stepExecution.findUnique({
    where: {
      workflowId_stepId_executionId: { workflowId, stepId, executionId },
    },
  });
  if (!execution) throw new Error('STEP_EXECUTION_NOT_FOUND');

  // Calculate duration from creation time
  const durationMs = execution.createdAt
    ? Date.now() - execution.createdAt.getTime()
    : 0;

  // Extract result keys if result is an object
  const resultKeys = result && typeof result === 'object' && !Array.isArray(result)
    ? Object.keys(result as Record<string, unknown>)
    : [];

  const updated = await prisma.stepExecution.update({
    where: { id: execution.id },
    data: {
      status: 'SUCCEEDED',
      result: result ?? undefined,
    },
  });

  // Journal the step completion (fire and forget)
  journaledStepComplete(workspaceId, workflowId, {
    stepId,
    executionId,
    durationMs,
    resultKeys,
  }, { source: 'completeStepRun', agentId: execution.agentId ?? undefined }).catch(() => {});

  return updated;
}

export async function failStepRun(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  stepId: string,
  executionId: string,
  reason: string,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);
  const execution = await prisma.stepExecution.findUnique({
    where: {
      workflowId_stepId_executionId: { workflowId, stepId, executionId },
    },
  });
  if (!execution) throw new Error('STEP_EXECUTION_NOT_FOUND');

  const updated = await prisma.stepExecution.update({
    where: { id: execution.id },
    data: {
      status: 'FAILED',
      result: { reason } as Prisma.InputJsonValue,
    },
  });

  // Journal the step failure (fire and forget)
  journaledStepFail(workspaceId, workflowId, {
    stepId,
    executionId,
    reason,
    attempt: execution.attempt,
  }, { source: 'failStepRun', agentId: execution.agentId ?? undefined }).catch(() => {});

  return updated;
}

async function requireWorkspace(workspaceId: string, ownerId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId },
  });
  if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
  return workspace;
}

async function requireWorkflow(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
) {
  await requireWorkspace(workspaceId, ownerId);
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
  });
  if (!workflow) throw new Error('WORKFLOW_NOT_FOUND');
  return workflow;
}

async function requireRunningWorkflow(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
) {
  const workflow = await requireWorkflow(workspaceId, ownerId, workflowId);
  if (workflow.status !== 'RUNNING') throw new Error('WORKFLOW_NOT_RUNNING');
  return workflow;
}

function normalizeAgentRole<
  T extends {
    allowedWriteKeys: unknown;
    allowedReadKeys: unknown;
  },
>(role: T): T & { allowedWriteKeys: string[]; allowedReadKeys: string[] } {
  return {
    ...role,
    allowedWriteKeys: stringArray(role.allowedWriteKeys),
    allowedReadKeys: stringArray(role.allowedReadKeys),
  };
}

function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error('INVALID_AGENT_ROLE_STORAGE');
  }
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2025',
  );
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Writes multiple state entries in one call.
 *
 * In atomic mode, a failure that happens after every entry's loop body has
 * already run — a commit-time failure such as a Prisma interactive
 * transaction timeout (P2028), SQLITE_BUSY on commit, or a deferred
 * constraint — can't be pinned on any single entry. Every entry is still
 * reported as `ROLLED_BACK` in that case, but the real error would
 * otherwise vanish (not thrown, not logged, not in any per-entry result).
 * The top-level `error` field on the return value carries it instead.
 */
export async function writeStateBatch(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  entries: StateWriteEntry[],
  options: WriteStateBatchOptions = {},
): Promise<{
  results: StateBatchResult[];
  totalDurationMs: number;
  error?: string;
}> {
  const startTime = Date.now();

  await requireRunningWorkflow(workspaceId, ownerId, workflowId);

  // Validate every named schema up front so an atomic batch never opens a
  // transaction it is going to abort.
  const schemaFailures = await validateBatchSchemas(
    workspaceId,
    ownerId,
    entries,
  );
  if (schemaFailures.size > 0) {
    return {
      results: entries.map((entry) => {
        const failure = schemaFailures.get(entry.key);
        return failure
          ? { key: entry.key, success: false, error: failure }
          : { key: entry.key, success: false, error: 'NOT_ATTEMPTED' };
      }),
      totalDurationMs: Date.now() - startTime,
    };
  }

  const onConflict = options.onConflict ?? 'upsert';
  // Live set of keys that already have a row, in this workspace/workflow.
  // Seeded from what's in the database, then updated as the loop below
  // writes — otherwise a later entry with the same key as an earlier one in
  // this same batch would still see the pre-loop snapshot and think the key
  // doesn't exist, silently clobbering (or wrongly succeeding past) a
  // caller-requested onConflict: 'fail' or 'skip'.
  const presentKeys = new Set(
    (
      await prisma.state.findMany({
        where: {
          workspaceId,
          workflowId,
          key: { in: entries.map((entry) => entry.key) },
        },
        select: { key: true },
      })
    ).map((state) => state.key),
  );

  const results: StateBatchResult[] = [];
  let batchError: string | undefined;

  if (options.atomic) {
    // The try/catch must wrap $transaction, not live inside the callback.
    // A caught error inside the callback lets the transaction commit.
    try {
      await prisma.$transaction(async (tx) => {
        for (const entry of entries) {
          if (presentKeys.has(entry.key)) {
            if (onConflict === 'skip') {
              results.push({ key: entry.key, success: true, skipped: true });
              continue;
            }
            if (onConflict === 'fail') throw new Error('STATE_KEY_EXISTS');
          }
          const written = await writeStateEntry(
            tx,
            workspaceId,
            workflowId,
            entry,
          );
          presentKeys.add(entry.key);
          results.push({
            key: entry.key,
            success: true,
            version: written.version,
          });
        }
      });
    } catch (error) {
      // Nothing was committed. Report every entry as failed and name the
      // one that broke: entries before it rolled back, entries after it
      // never ran.
      const failedIndex = results.length;
      results.length = 0;
      entries.forEach((entry, index) => {
        results.push({
          key: entry.key,
          success: false,
          error:
            index === failedIndex ? (error as Error).message : 'ROLLED_BACK',
        });
      });
      if (failedIndex >= entries.length) {
        // The failure happened after every entry's loop body already ran —
        // a commit-time failure, not a per-entry one. No entry can be
        // blamed, so surface the real cause at the batch level instead of
        // losing it behind a wall of ROLLED_BACK.
        batchError = (error as Error).message;
      }
    }
  } else {
    for (const entry of entries) {
      if (presentKeys.has(entry.key)) {
        if (onConflict === 'skip') {
          results.push({ key: entry.key, success: true, skipped: true });
          continue;
        }
        if (onConflict === 'fail') {
          results.push({
            key: entry.key,
            success: false,
            error: 'STATE_KEY_EXISTS',
          });
          continue;
        }
      }
      try {
        const written = await writeState(
          workspaceId,
          ownerId,
          workflowId,
          entry.key,
          entry.value,
        );
        presentKeys.add(entry.key);
        results.push({
          key: entry.key,
          success: true,
          version: written.version,
        });
      } catch (error) {
        results.push({
          key: entry.key,
          success: false,
          error: (error as Error).message,
        });
      }
    }
  }

  return {
    results,
    totalDurationMs: Date.now() - startTime,
    ...(batchError ? { error: batchError } : {}),
  };
}

/**
 * Validates every entry that names a schema.
 *
 * Returns a map of key -> error code for entries that failed. An empty map
 * means the whole batch is safe to write.
 */
async function validateBatchSchemas(
  workspaceId: string,
  ownerId: string,
  entries: StateWriteEntry[],
): Promise<Map<string, string>> {
  const failures = new Map<string, string>();
  const schemaCache = new Map<
    string,
    Record<string, FieldDefinition> | null
  >();

  for (const entry of entries) {
    if (!entry.schemaName) continue;

    if (!schemaCache.has(entry.schemaName)) {
      const schema = await getSchema(workspaceId, ownerId, entry.schemaName);
      schemaCache.set(
        entry.schemaName,
        schema
          ? (schema.fields as Record<string, FieldDefinition>)
          : null,
      );
    }

    const fields = schemaCache.get(entry.schemaName);
    if (!fields) {
      failures.set(entry.key, 'SCHEMA_NOT_FOUND');
      continue;
    }
    if (batchValidator.validate(fields, entry.value).length > 0) {
      failures.set(entry.key, 'SCHEMA_VALIDATION_FAILED');
    }
  }

  return failures;
}

export async function readStateBatch(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  keys: string[],
  options: ReadStateBatchOptions = {},
): Promise<{
  results: Array<{
    key: string;
    found: boolean;
    value?: Prisma.JsonValue;
    version?: number;
  }>;
}> {
  await requireWorkflow(workspaceId, ownerId, workflowId);

  const states = await prisma.state.findMany({
    where: {
      workspaceId,
      workflowId,
      key: { in: keys },
    },
  });

  const stateMap = new Map(states.map((s) => [s.key, s]));

  return {
    results: keys.map((key): { key: string; found: boolean; value?: Prisma.JsonValue; version?: number } => {
      const state = stateMap.get(key);
      if (!state) {
        return { key, found: false };
      }
      return {
        key,
        found: true,
        value: (options.unwrap ? unwrapState({ [key]: state.value })[key] : state.value) as Prisma.JsonValue,
        version: state.version,
      };
    }),
  };
}

/**
 * Write a single state entry within a transaction
 */
async function writeStateEntry(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workspaceId: string,
  workflowId: string,
  entry: StateWriteEntry,
): Promise<{ version: number }> {
  return tx.state.upsert({
    where: { workflowId_key: { workflowId, key: entry.key } },
    create: { workspaceId, workflowId, key: entry.key, value: entry.value },
    update: { value: entry.value, version: { increment: 1 } },
  });
}

// ============================================================================
// STATE TTL OPERATIONS
// ============================================================================

export async function cleanupExpiredStates(batchSize: number = 100): Promise<number> {
  // First get IDs of expired states
  const expiredStates = await prisma.state.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
    take: batchSize,
    select: { id: true },
  });

  if (expiredStates.length === 0) {
    return 0;
  }

  // Delete by IDs
  const result = await prisma.state.deleteMany({
    where: {
      id: { in: expiredStates.map(s => s.id) },
    },
  });

  return result.count;
}

function publicWorkspace<T extends { lookupKey?: string | null }>(
  workspace: T,
) {
  const { lookupKey: _lookupKey, ...publicValue } = workspace;
  return publicValue;
}
