import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase, prisma } from './db/client.js';
import {
  completeStepRun,
  createAgentRole,
  createCheckpoint,
  createSchema,
  createWorkflow,
  createWorkspace,
  ensureWorkspace,
  getRouterStatus,
  getWorkflow,
  readState,
  readStateFields,
  restoreCheckpoint,
  startStepRun,
  transitionWorkflow,
  writeState,
} from './db/queries.js';
import { registerAgentRoleTools } from './tools/agent-role.js';
import { registerCheckpointTools } from './tools/checkpoint.js';
import { registerHandoffTools } from './tools/handoff.js';
import { registerSchemaTools } from './tools/schema.js';
import { registerStateTools } from './tools/state.js';
import { registerStepTools } from './tools/step.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerRouterTools } from './tools/router.js';
import { registerDebuggerTools } from './tools/debugger-tool.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const integration = hasDatabase ? describe : describe.skip;

integration('PostgreSQL vertical slice', () => {
  const ownerId = `test-${randomUUID()}`;
  let workspaceId: string;
  let workflowId: string;

  beforeAll(async () => {
    await connectDatabase();
    await prisma.$connect();
    const workspace = await createWorkspace('Integration workspace', ownerId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId } });
    await prisma.$disconnect();
  });

  it('registers the stable 30-tool MCP surface', () => {
    const server = {} as never;
    const owner = () => ownerId;
    const registries = [
      registerWorkspaceTools(server, owner),
      registerSchemaTools(server, owner),
      registerStateTools(server, owner),
      registerCheckpointTools(server, owner),
      registerHandoffTools(server, owner),
      registerWorkflowTools(server, owner),
      registerStepTools(server, owner),
      registerAgentRoleTools(server, owner),
      registerRouterTools(server, owner),
      registerDebuggerTools(server, owner),
    ];
    expect(
      registries.reduce((count, registry) => count + registry.size, 0),
    ).toBe(30);
  });

  it('ensures one named workspace and reports owner-scoped status', async () => {
    const first = await ensureWorkspace('  Integration Named  ', ownerId);
    const second = await ensureWorkspace('integration named', ownerId);
    expect(second.id).toBe(first.id);
    const status = await getRouterStatus(ownerId);
    expect(status.version).toBe('0.3.1');
    expect(status.totals.workspaces).toBeGreaterThanOrEqual(2);
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

  it('rejects compare-and-set writes on version mismatch', async () => {
    const workflow = await createWorkflow(workspaceId, ownerId);
    await writeState(workspaceId, ownerId, workflow.id, 'counter', {
      value: 1,
    });
    const current = await readState(
      workspaceId,
      ownerId,
      workflow.id,
      'counter',
    );
    await writeState(
      workspaceId,
      ownerId,
      workflow.id,
      'counter',
      { value: 2 },
      { expectedVersion: current!.version },
    );
    await expect(
      writeState(
        workspaceId,
        ownerId,
        workflow.id,
        'counter',
        { value: 99 },
        { expectedVersion: current!.version },
      ),
    ).rejects.toThrow('VERSION_CONFLICT');
  });

  it('caches successful step executions and auto-checkpoints', async () => {
    const workflow = await createWorkflow(workspaceId, ownerId);
    const executionId = randomUUID();
    const first = await startStepRun(
      workspaceId,
      ownerId,
      workflow.id,
      'research',
      executionId,
      'research-agent',
    );
    expect(first.cached).toBe(false);
    expect(first.checkpoint?.label).toBe(`before:research:${executionId}`);

    await completeStepRun(
      workspaceId,
      ownerId,
      workflow.id,
      'research',
      executionId,
      { companyName: 'Acme Corp' },
    );

    const second = await startStepRun(
      workspaceId,
      ownerId,
      workflow.id,
      'research',
      executionId,
    );
    expect(second.cached).toBe(true);
    expect(second.execution.result).toEqual({ companyName: 'Acme Corp' });
  });

  it('enforces agent role write and read ACLs', async () => {
    const workflow = await createWorkflow(workspaceId, ownerId);
    await createAgentRole(
      workspaceId,
      ownerId,
      'research',
      ['lead*'],
      ['lead*'],
    );
    await writeState(
      workspaceId,
      ownerId,
      workflow.id,
      'lead',
      { companyName: 'Acme Corp' },
      { agentRole: 'research' },
    );
    await expect(
      writeState(
        workspaceId,
        ownerId,
        workflow.id,
        'score',
        { value: 90 },
        { agentRole: 'research' },
      ),
    ).rejects.toThrow('WRITE_FORBIDDEN');

    const visible = await readStateFields(
      workspaceId,
      ownerId,
      workflow.id,
      undefined,
      { agentRole: 'research', unwrap: true },
    );
    expect(visible).toEqual({ lead: { companyName: 'Acme Corp' } });
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
