import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from './db/client.js';
import {
  createCheckpoint,
  createSchema,
  createWorkflow,
  createWorkspace,
  getWorkflow,
  readState,
  readStateFields,
  restoreCheckpoint,
  transitionWorkflow,
  writeState,
} from './db/queries.js';
import { registerCheckpointTools } from './tools/checkpoint.js';
import { registerHandoffTools } from './tools/handoff.js';
import { registerSchemaTools } from './tools/schema.js';
import { registerStateTools } from './tools/state.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { registerWorkspaceTools } from './tools/workspace.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const integration = hasDatabase ? describe : describe.skip;

integration('PostgreSQL vertical slice', () => {
  const ownerId = `test-${randomUUID()}`;
  let workspaceId: string;
  let workflowId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const workspace = await createWorkspace('Integration workspace', ownerId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId } });
    await prisma.$disconnect();
  });

  it('registers the stable 22-tool MCP surface', () => {
    const server = {} as never;
    const owner = () => ownerId;
    const registries = [
      registerWorkspaceTools(server, owner),
      registerSchemaTools(server, owner),
      registerStateTools(server, owner),
      registerCheckpointTools(server, owner),
      registerHandoffTools(server, owner),
      registerWorkflowTools(server, owner),
    ];
    expect(
      registries.reduce((count, registry) => count + registry.size, 0),
    ).toBe(22);
  });

  it('creates incrementing schema versions', async () => {
    const fields = { name: { type: 'string', required: true } };
    const first = await createSchema(workspaceId, ownerId, 'Lead', fields);
    const second = await createSchema(workspaceId, ownerId, 'Lead', fields);
    expect([first.version, second.version]).toEqual([1, 2]);
  });

  it('writes, selects, checkpoints, and atomically restores state', async () => {
    const workflow = await createWorkflow(workspaceId, ownerId);
    workflowId = workflow.id;
    await writeState(workspaceId, ownerId, workflowId, 'company', {
      name: 'Acme',
    });
    await writeState(workspaceId, ownerId, workflowId, 'score', { value: 90 });

    expect(
      await readStateFields(workspaceId, ownerId, workflowId, ['company']),
    ).toEqual({
      company: { name: 'Acme' },
    });
    expect(await readStateFields(workspaceId, ownerId, workflowId)).toEqual({
      company: { name: 'Acme' },
      score: { value: 90 },
    });

    const checkpoint = await createCheckpoint(
      workspaceId,
      ownerId,
      workflowId,
      'before-change',
    );
    await writeState(workspaceId, ownerId, workflowId, 'score', { value: 10 });
    await restoreCheckpoint(workspaceId, ownerId, checkpoint.id);
    expect(
      (await readState(workspaceId, ownerId, workflowId, 'score'))?.value,
    ).toEqual({
      value: 90,
    });
  });

  it('rejects cross-workspace access and repeated terminal transitions', async () => {
    const otherOwner = `test-${randomUUID()}`;
    await expect(
      getWorkflow(workspaceId, otherOwner, workflowId),
    ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    await transitionWorkflow(workspaceId, ownerId, workflowId, 'COMPLETED');
    await expect(
      transitionWorkflow(workspaceId, ownerId, workflowId, 'COMPLETED'),
    ).rejects.toThrow('WORKFLOW_NOT_RUNNING');
  });
});
