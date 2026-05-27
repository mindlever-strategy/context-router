import { prisma } from './client';
import type { Plan, Permission, WorkflowStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Workspace queries
export async function createWorkspace(name: string, ownerId: string) {
  return prisma.workspace.create({
    data: { name, ownerId },
  });
}

export async function getWorkspace(id: string) {
  return prisma.workspace.findUnique({ where: { id } });
}

export async function listWorkspaces(ownerId: string) {
  return prisma.workspace.findMany({ where: { ownerId } });
}

export async function deleteWorkspace(id: string) {
  return prisma.workspace.delete({ where: { id } });
}

// Schema queries
export async function createSchema(workspaceId: string, name: string, fields: object) {
  return prisma.schema.create({
    data: { workspaceId, name, fields },
  });
}

export async function getSchema(workspaceId: string, name: string) {
  return prisma.schema.findFirst({
    where: { workspaceId, name },
    orderBy: { version: 'desc' },
  });
}

export async function listSchemas(workspaceId: string) {
  return prisma.schema.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
  });
}

// State queries
export async function writeState(
  workspaceId: string,
  workflowId: string,
  key: string,
  value: object
) {
  return prisma.state.upsert({
    where: { workflowId_key: { workflowId, key } },
    create: { workspaceId, workflowId, key, value },
    update: {
      value,
      version: { increment: 1 },
    },
  });
}

export async function readState(workflowId: string, key: string) {
  return prisma.state.findUnique({
    where: { workflowId_key: { workflowId, key } },
  });
}

export async function readStateFields(workflowId: string, fields: string[]) {
  const states = await prisma.state.findMany({
    where: { workflowId },
  });

  const result: Record<string, unknown> = {};
  for (const state of states) {
    if (fields.includes(state.key)) {
      result[state.key] = state.value;
    }
  }
  return result;
}

export async function deleteState(workflowId: string, key: string) {
  return prisma.state.delete({
    where: { workflowId_key: { workflowId, key } },
  });
}

export async function snapshotState(workflowId: string) {
  const states = await prisma.state.findMany({
    where: { workflowId },
  });

  const snapshot: Record<string, Prisma.InputJsonValue> = {};
  for (const state of states) {
    snapshot[state.key] = state.value as Prisma.InputJsonValue;
  }
  return snapshot;
}

// Checkpoint queries
export async function createCheckpoint(
  workspaceId: string,
  workflowId: string,
  snapshot: object,
  label?: string
) {
  return prisma.checkpoint.create({
    data: { workspaceId, workflowId, snapshot, label },
  });
}

export async function listCheckpoints(workflowId: string) {
  return prisma.checkpoint.findMany({
    where: { workflowId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function restoreCheckpoint(checkpointId: string) {
  const checkpoint = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
  if (!checkpoint) throw new Error('Checkpoint not found');

  // Delete current state
  await prisma.state.deleteMany({ where: { workflowId: checkpoint.workflowId } });

  // Restore from snapshot
  const snapshot = checkpoint.snapshot as Record<string, Prisma.InputJsonValue>;
  for (const [key, value] of Object.entries(snapshot)) {
    await prisma.state.create({
      data: {
        workspaceId: checkpoint.workspaceId,
        workflowId: checkpoint.workflowId,
        key,
        value,
      },
    });
  }

  return checkpoint;
}

// Workflow queries
export async function createWorkflow(workspaceId: string) {
  return prisma.workflow.create({
    data: { workspaceId },
  });
}

export async function getWorkflow(id: string) {
  return prisma.workflow.findUnique({ where: { id } });
}

export async function completeWorkflow(id: string) {
  return prisma.workflow.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
}

export async function failWorkflow(id: string, reason: string) {
  return prisma.workflow.update({
    where: { id },
    data: { status: 'FAILED', failureReason: reason, completedAt: new Date() },
  });
}

// Usage tracking
export async function trackUsage(workspaceId: string, workflowId: string | null, action: string) {
  return prisma.usage.create({
    data: { workspaceId, workflowId, action },
  });
}

export async function countCompletedWorkflows(workspaceId: string, since: Date) {
  return prisma.workflow.count({
    where: { workspaceId, status: 'COMPLETED', completedAt: { gte: since } },
  });
}

// API Key queries
export async function createApiKey(workspaceId: string, name: string, permissions: Permission) {
  const key = crypto.randomUUID().replace(/-/g, '');
  const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));

  const apiKey = await prisma.apiKey.create({
    data: {
      workspaceId,
      name,
      permissions,
      keyHash: Buffer.from(keyHash).toString('hex'),
    },
  });

  return { id: apiKey.id, key, name, permissions };
}
