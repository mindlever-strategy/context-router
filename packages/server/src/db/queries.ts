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
import { prisma, storageConfig } from './client.js';

export type WriteStateOptions = {
  expectedVersion?: number;
  agentRole?: string;
  provenance?: ProvenanceMeta;
  provenanceMode?: 'per-field' | 'whole-object';
};

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
  return prisma.workflow.create({ data: { workspaceId } });
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
  return prisma.workflow.update({
    where: { id: workflow.id },
    data: {
      status,
      completedAt: new Date(),
      failureReason: status === 'FAILED' ? failureReason : null,
    },
  });
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

  if (options.expectedVersion !== undefined) {
    const currentVersion = existing?.version ?? 0;
    if (currentVersion !== options.expectedVersion) {
      throw new Error('VERSION_CONFLICT');
    }
  }

  let finalValue = value;
  if (options.provenance) {
    finalValue = wrapStateValue(
      value as Record<string, unknown>,
      options.provenance,
      options.provenanceMode ?? 'per-field',
    ) as Prisma.InputJsonValue;
  }

  return prisma.state.upsert({
    where: { workflowId_key: { workflowId, key } },
    create: { workspaceId, workflowId, key, value: finalValue },
    update: { value: finalValue, version: { increment: 1 } },
  });
}

export async function readState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  key: string,
  options: { agentRole?: string; unwrap?: boolean } = {},
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  const state = await prisma.state.findFirst({
    where: { workspaceId, workflowId, key },
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
  const states = await prisma.state.findMany({
    where: {
      workspaceId,
      workflowId,
      ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
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
  const result = await prisma.state.deleteMany({
    where: { workspaceId, workflowId, key },
  });
  if (result.count === 0) throw new Error('STATE_NOT_FOUND');
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

export async function createCheckpoint(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  label?: string,
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);
  const snapshot = await readStateFields(workspaceId, ownerId, workflowId);
  return prisma.checkpoint.create({
    data: {
      workspaceId,
      workflowId,
      snapshot: snapshot as Prisma.InputJsonValue,
      label,
    },
  });
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

  const snapshot = checkpoint.snapshot as Record<string, Prisma.InputJsonValue>;
  await prisma.$transaction(async (tx) => {
    await tx.state.deleteMany({
      where: { workspaceId, workflowId: checkpoint.workflowId },
    });
    if (Object.keys(snapshot).length > 0) {
      await tx.state.createMany({
        data: Object.entries(snapshot).map(([key, value]) => ({
          workspaceId,
          workflowId: checkpoint.workflowId,
          key,
          value,
        })),
      });
    }
  });
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

  const updated = await prisma.stepExecution.update({
    where: { id: execution.id },
    data: {
      status: 'SUCCEEDED',
      result: result ?? undefined,
    },
  });
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

function publicWorkspace<T extends { lookupKey?: string | null }>(
  workspace: T,
) {
  const { lookupKey: _lookupKey, ...publicValue } = workspace;
  return publicValue;
}
