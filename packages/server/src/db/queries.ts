import { Prisma, type WorkflowStatus } from '../generated/prisma/client.js';
import { prisma } from './client.js';

export async function createWorkspace(name: string, ownerId: string) {
  return prisma.workspace.create({ data: { name, ownerId } });
}

export async function listWorkspaces(ownerId: string) {
  return prisma.workspace.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getWorkspace(workspaceId: string, ownerId: string) {
  return prisma.workspace.findFirst({ where: { id: workspaceId, ownerId } });
}

export async function deleteWorkspace(workspaceId: string, ownerId: string) {
  const workspace = await getWorkspace(workspaceId, ownerId);
  if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
  return prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function createSchema(
  workspaceId: string,
  ownerId: string,
  name: string,
  fields: object,
) {
  await requireWorkspace(workspaceId, ownerId);
  return prisma.$transaction(async (tx) => {
    const latest = await tx.schema.findFirst({
      where: { workspaceId, name },
      orderBy: { version: 'desc' },
    });
    return tx.schema.create({
      data: {
        workspaceId,
        name,
        fields: fields as Prisma.InputJsonValue,
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
) {
  await requireRunningWorkflow(workspaceId, ownerId, workflowId);
  return prisma.state.upsert({
    where: { workflowId_key: { workflowId, key } },
    create: { workspaceId, workflowId, key, value },
    update: { value, version: { increment: 1 } },
  });
}

export async function readState(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  key: string,
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  return prisma.state.findFirst({ where: { workspaceId, workflowId, key } });
}

export async function readStateFields(
  workspaceId: string,
  ownerId: string,
  workflowId: string,
  keys?: string[],
) {
  await requireWorkflow(workspaceId, ownerId, workflowId);
  const states = await prisma.state.findMany({
    where: {
      workspaceId,
      workflowId,
      ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
    },
    orderBy: { key: 'asc' },
  });
  return Object.fromEntries(states.map((state) => [state.key, state.value]));
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
) {
  return readStateFields(workspaceId, ownerId, workflowId);
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
    data: { workspaceId, workflowId, snapshot, label },
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
