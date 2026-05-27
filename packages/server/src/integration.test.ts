import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Test database client - uses in-memory SQLite for integration tests
const createTestPrisma = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: 'file:./test-integration.db',
      },
    },
  });
};

// Integration tests for the full Context Router workflow
// These tests verify end-to-end functionality from workflow creation through state management,
// checkpoints, and handoff generation.
describe('Full Integration', () => {
  let prisma: PrismaClient;
  const testWorkspaceId = uuidv4();
  const testUserId = uuidv4();

  beforeAll(async () => {
    prisma = createTestPrisma();

    // Ensure database is clean and migrated
    await prisma.$connect();

    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace',
        ownerId: testUserId,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.checkpoint.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.state.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workflow.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workspace.delete({ where: { id: testWorkspaceId } });
    await prisma.$disconnect();
  });

  describe('Workflow Lifecycle', () => {
    it('creates a workflow and tracks it in the database', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          workspaceId: testWorkspaceId,
        },
      });

      expect(workflow.id).toBeDefined();
      expect(workflow.workspaceId).toBe(testWorkspaceId);
      expect(workflow.status).toBe('RUNNING');
      expect(workflow.createdAt).toBeInstanceOf(Date);

      // Verify workflow exists in database
      const found = await prisma.workflow.findUnique({
        where: { id: workflow.id },
      });
      expect(found).not.toBeNull();
      expect(found?.status).toBe('RUNNING');

      // Clean up
      await prisma.workflow.delete({ where: { id: workflow.id } });
    });

    it('completes a workflow and records completion timestamp', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          workspaceId: testWorkspaceId,
        },
      });

      const completed = await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeInstanceOf(Date);

      // Verify persisted
      const found = await prisma.workflow.findUnique({
        where: { id: workflow.id },
      });
      expect(found?.status).toBe('COMPLETED');

      // Clean up
      await prisma.workflow.delete({ where: { id: workflow.id } });
    });

    it('fails a workflow with reason', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          workspaceId: testWorkspaceId,
        },
      });

      const failed = await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: 'FAILED',
          failureReason: 'Connection timeout exceeded',
          completedAt: new Date(),
        },
      });

      expect(failed.status).toBe('FAILED');
      expect(failed.failureReason).toBe('Connection timeout exceeded');

      // Clean up
      await prisma.workflow.delete({ where: { id: workflow.id } });
    });
  });

  describe('State Management', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflow = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });
      workflowId = workflow.id;
    });

    afterEach(async () => {
      // Clean up state and workflow
      await prisma.state.deleteMany({ where: { workflowId } });
      await prisma.workflow.delete({ where: { id: workflowId } });
    });

    it('writes and reads state', async () => {
      // Write state
      const userData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'admin',
      };

      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'user' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'user',
          value: userData,
        },
        update: {
          value: userData,
          version: { increment: 1 },
        },
      });

      // Read state
      const state = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId, key: 'user' } },
      });

      expect(state).not.toBeNull();
      expect(state?.value).toEqual(userData);
      expect(state?.version).toBe(1);
    });

    it('updates existing state and increments version', async () => {
      // Write initial state
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'counter' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'counter',
          value: { value: 1 },
        },
        update: {
          value: { value: 1 },
        },
      });

      // Update state
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'counter' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'counter',
          value: { value: 2 },
        },
        update: {
          value: { value: 2 },
          version: { increment: 1 },
        },
      });

      // Verify version incremented
      const state = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId, key: 'counter' } },
      });

      expect(state?.version).toBe(2);
      expect(state?.value).toEqual({ value: 2 });
    });

    it('deletes state', async () => {
      // Write state
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'temp' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'temp',
          value: { data: 'temporary' },
        },
        update: { value: { data: 'temporary' } },
      });

      // Delete state
      await prisma.state.delete({
        where: { workflowId_key: { workflowId, key: 'temp' } },
      });

      // Verify deleted
      const state = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId, key: 'temp' } },
      });

      expect(state).toBeNull();
    });

    it('snapshots all state for a workflow', async () => {
      // Write multiple state entries
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'company' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'company',
          value: { name: 'Acme Corp' },
        },
        update: { value: { name: 'Acme Corp' } },
      });

      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'contact' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'contact',
          value: { email: 'test@acme.com' },
        },
        update: { value: { email: 'test@acme.com' } },
      });

      // Snapshot
      const states = await prisma.state.findMany({
        where: { workflowId },
      });

      const snapshot: Record<string, Prisma.InputJsonValue> = {};
      for (const state of states) {
        snapshot[state.key] = state.value as Prisma.InputJsonValue;
      }

      expect(Object.keys(snapshot)).toContain('company');
      expect(Object.keys(snapshot)).toContain('contact');
      expect(snapshot.company).toEqual({ name: 'Acme Corp' });
    });
  });

  describe('Checkpoint Management', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflow = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });
      workflowId = workflow.id;
    });

    afterEach(async () => {
      await prisma.checkpoint.deleteMany({ where: { workflowId } });
      await prisma.state.deleteMany({ where: { workflowId } });
      await prisma.workflow.delete({ where: { id: workflowId } });
    });

    it('creates a checkpoint and stores snapshot', async () => {
      // Write state before checkpoint
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'counter' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'counter',
          value: { value: 1 },
        },
        update: { value: { value: 1 } },
      });

      // Create snapshot
      const states = await prisma.state.findMany({ where: { workflowId } });
      const snapshot: Record<string, Prisma.InputJsonValue> = {};
      for (const state of states) {
        snapshot[state.key] = state.value as Prisma.InputJsonValue;
      }

      // Create checkpoint
      const checkpoint = await prisma.checkpoint.create({
        data: {
          workspaceId: testWorkspaceId,
          workflowId,
          snapshot,
          label: 'before-increment',
        },
      });

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.workflowId).toBe(workflowId);
      expect(checkpoint.label).toBe('before-increment');
      expect(checkpoint.snapshot).toEqual({ counter: { value: 1 } });
    });

    it('restores checkpoint and overwrites current state', async () => {
      // Write initial state
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'counter' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'counter',
          value: { value: 1 },
        },
        update: { value: { value: 1 } },
      });

      // Create checkpoint
      const states = await prisma.state.findMany({ where: { workflowId } });
      const snapshot: Record<string, Prisma.InputJsonValue> = {};
      for (const state of states) {
        snapshot[state.key] = state.value as Prisma.InputJsonValue;
      }

      const checkpoint = await prisma.checkpoint.create({
        data: {
          workspaceId: testWorkspaceId,
          workflowId,
          snapshot,
          label: 'initial',
        },
      });

      // Modify state after checkpoint
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'counter' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'counter',
          value: { value: 5 },
        },
        update: {
          value: { value: 5 },
          version: { increment: 1 },
        },
      });

      // Verify state changed
      let state = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId, key: 'counter' } },
      });
      expect(state?.value).toEqual({ value: 5 });

      // Restore checkpoint
      await prisma.state.deleteMany({ where: { workflowId } });

      const restoredSnapshot = checkpoint.snapshot as Record<string, Prisma.InputJsonValue>;
      for (const [key, value] of Object.entries(restoredSnapshot)) {
        await prisma.state.create({
          data: {
            workspaceId: testWorkspaceId,
            workflowId,
            key,
            value,
          },
        });
      }

      // Verify restored
      state = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId, key: 'counter' } },
      });
      expect(state?.value).toEqual({ value: 1 });
    });

    it('lists checkpoints in descending order by creation time', async () => {
      // Create multiple checkpoints
      for (let i = 0; i < 3; i++) {
        await prisma.checkpoint.create({
          data: {
            workspaceId: testWorkspaceId,
            workflowId,
            snapshot: { step: i },
            label: `checkpoint-${i}`,
          },
        });
      }

      // List checkpoints
      const checkpoints = await prisma.checkpoint.findMany({
        where: { workflowId },
        orderBy: { createdAt: 'desc' },
      });

      expect(checkpoints).toHaveLength(3);
      // Most recent first
      expect(checkpoints[0].label).toBe('checkpoint-2');
      expect(checkpoints[2].label).toBe('checkpoint-0');
    });
  });

  describe('Handoff Generation', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflow = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });
      workflowId = workflow.id;

      // Write state for handoff
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'lead' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'lead',
          value: {
            company_name: 'Acme Corp',
            domain: 'acme.com',
            status: 'CONFIRMED',
          },
        },
        update: { value: { company_name: 'Acme Corp', domain: 'acme.com', status: 'CONFIRMED' } },
      });

      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'contact' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'contact',
          value: {
            name: 'Jane Doe',
            email: 'jane@acme.com',
          },
        },
        update: { value: { name: 'Jane Doe', email: 'jane@acme.com' } },
      });
    });

    afterEach(async () => {
      await prisma.state.deleteMany({ where: { workflowId } });
      await prisma.workflow.delete({ where: { id: workflowId } });
    });

    it('reads multiple state fields for handoff', async () => {
      // Read all state fields
      const states = await prisma.state.findMany({
        where: { workflowId },
      });

      const data: Record<string, unknown> = {};
      for (const state of states) {
        data[state.key] = state.value;
      }

      expect(data.lead).toEqual({
        company_name: 'Acme Corp',
        domain: 'acme.com',
        status: 'CONFIRMED',
      });
      expect(data.contact).toEqual({
        name: 'Jane Doe',
        email: 'jane@acme.com',
      });
    });

    it('generates handoff summary containing key information', async () => {
      // Simulate handoff generator format
      const states = await prisma.state.findMany({ where: { workflowId } });

      const data: Record<string, unknown> = {};
      for (const state of states) {
        data[state.key] = state.value;
      }

      // Generate summary format (simulating HandoffGenerator)
      const summary = generateTestSummary(data);

      expect(summary).toContain('Acme Corp');
      expect(summary).toContain('acme.com');
      expect(summary).toContain('CONFIRMED');
      expect(summary).toContain('Jane Doe');
    });
  });

  describe('Usage Tracking', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflow = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });
      workflowId = workflow.id;
    });

    afterEach(async () => {
      await prisma.usage.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.workflow.delete({ where: { id: workflowId } });
    });

    it('tracks workflow operations', async () => {
      // Track create
      await prisma.usage.create({
        data: {
          workspaceId: testWorkspaceId,
          workflowId,
          action: 'workflow_create',
        },
      });

      // Track state write
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId, key: 'test' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId,
          key: 'test',
          value: { data: 'test' },
        },
        update: { value: { data: 'test' } },
      });

      await prisma.usage.create({
        data: {
          workspaceId: testWorkspaceId,
          workflowId,
          action: 'state_write',
        },
      });

      // Verify usage tracked
      const usages = await prisma.usage.findMany({
        where: { workspaceId: testWorkspaceId },
        orderBy: { timestamp: 'asc' },
      });

      expect(usages).toHaveLength(2);
      expect(usages[0].action).toBe('workflow_create');
      expect(usages[1].action).toBe('state_write');
    });

    it('counts completed workflows for billing', async () => {
      // Create and complete multiple workflows
      for (let i = 0; i < 3; i++) {
        const w = await prisma.workflow.create({
          data: { workspaceId: testWorkspaceId },
        });
        await prisma.workflow.update({
          where: { id: w.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      // Count completed workflows this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const completedCount = await prisma.workflow.count({
        where: {
          workspaceId: testWorkspaceId,
          status: 'COMPLETED',
          completedAt: { gte: startOfMonth },
        },
      });

      expect(completedCount).toBeGreaterThanOrEqual(3);

      // Clean up test workflows
      await prisma.workflow.deleteMany({
        where: { workspaceId: testWorkspaceId, status: 'COMPLETED' },
      });
    });
  });

  describe('Cross-Workflow State Isolation', () => {
    it('ensures state is isolated between workflows', async () => {
      // Create two workflows
      const workflow1 = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });
      const workflow2 = await prisma.workflow.create({
        data: { workspaceId: testWorkspaceId },
      });

      // Write different state to each
      await prisma.state.upsert({
        where: { workflowId_key: { workflowId: workflow1.id, key: 'shared_key' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId: workflow1.id,
          key: 'shared_key',
          value: { source: 'workflow1' },
        },
        update: { value: { source: 'workflow1' } },
      });

      await prisma.state.upsert({
        where: { workflowId_key: { workflowId: workflow2.id, key: 'shared_key' } },
        create: {
          workspaceId: testWorkspaceId,
          workflowId: workflow2.id,
          key: 'shared_key',
          value: { source: 'workflow2' },
        },
        update: { value: { source: 'workflow2' } },
      });

      // Verify isolation
      const state1 = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId: workflow1.id, key: 'shared_key' } },
      });
      const state2 = await prisma.state.findUnique({
        where: { workflowId_key: { workflowId: workflow2.id, key: 'shared_key' } },
      });

      expect(state1?.value).toEqual({ source: 'workflow1' });
      expect(state2?.value).toEqual({ source: 'workflow2' });

      // Clean up
      await prisma.state.deleteMany({ where: { workflowId: { in: [workflow1.id, workflow2.id] } } });
      await prisma.workflow.deleteMany({ where: { id: { in: [workflow1.id, workflow2.id] } } });
    });
  });
});

// Helper function to simulate handoff generator format
function generateTestSummary(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const formattedKey = key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase());

    if (typeof value === 'object' && value !== null) {
      lines.push(`${formattedKey}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const formattedNestedKey = nestedKey
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());
        lines.push(`  ${formattedNestedKey}: ${nestedValue}`);
      }
    } else {
      lines.push(`${formattedKey}: ${value}`);
    }
  }

  return lines.join('\n');
}
