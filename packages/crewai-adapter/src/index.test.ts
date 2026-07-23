import { describe, expect, it } from 'vitest';
import {
  ContextRouter,
  type ToolTransport,
} from '@context-router/sdk';
import { ContextRouterMemory } from './index.js';

function envelope(data: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, data }),
      },
    ],
  };
}

/**
 * In-memory transport that mirrors real Context Router semantics:
 * - state_read with `keys` → exact IN match only
 * - state_snapshot → all keys
 */
class FakeTransport implements ToolTransport {
  calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  private state = new Map<string, unknown>();

  async callTool(request: {
    name: string;
    arguments: Record<string, unknown>;
  }) {
    this.calls.push(request);
    const { name, arguments: args } = request;

    switch (name) {
      case 'workspace_ensure':
        return envelope({
          id: 'workspace-id',
          name: args.name,
          ownerId: 'local',
          createdAt: '2026-01-01T00:00:00.000Z',
        });
      case 'workflow_create':
        return envelope({
          id: 'workflow-id',
          workspaceId: args.workspaceId,
          status: 'RUNNING',
          createdAt: '2026-01-01T00:00:00.000Z',
          completedAt: null,
          failureReason: null,
        });
      case 'state_write':
        this.state.set(args.key as string, args.value);
        return envelope({
          written: true,
          state: {
            key: args.key,
            value: args.value,
            version: 1,
          },
        });
      case 'state_read': {
        if (Array.isArray(args.keys)) {
          const values: Record<string, unknown> = {};
          for (const key of args.keys as string[]) {
            if (this.state.has(key)) {
              values[key] = this.state.get(key);
            }
          }
          return envelope({ values });
        }
        const key = args.key as string;
        if (!this.state.has(key)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'STATE_NOT_FOUND',
                    message: 'Missing key',
                  },
                }),
              },
            ],
          };
        }
        return envelope({
          key,
          value: this.state.get(key),
          version: 1,
        });
      }
      case 'state_snapshot':
        return envelope(Object.fromEntries(this.state));
      case 'checkpoint_create':
        return envelope({
          id: 'checkpoint-id',
          workspaceId: args.workspaceId,
          workflowId: args.workflowId,
          label: args.label,
        });
      case 'workflow_complete':
        return envelope({
          id: args.workflowId,
          workspaceId: args.workspaceId,
          status: 'COMPLETED',
          createdAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          failureReason: null,
        });
      default:
        return envelope({ ok: true, ...args });
    }
  }
}

function createMemory(transport: FakeTransport) {
  return new ContextRouterMemory({
    workspaceName: 'crew-test',
    autoCheckpoint: false,
    router: new ContextRouter({ transport }),
  });
}

describe('ContextRouterMemory list/get-all APIs', () => {
  it('does not treat wildcard strings as exact getMany keys', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeAgentOutput('researcher', { findings: 'alpha' });
    await memory.storeSharedMemory('note', { text: 'shared' });
    await memory.storeTaskResult('t1', 'Research', { ok: true }, 'researcher');

    await memory.getAllMemories();
    await memory.listAgents();
    await memory.listTasks();
    await memory.getAllSharedMemories();

    const listCalls = transport.calls.filter(
      (call) =>
        call.name === 'state_read' || call.name === 'state_snapshot'
    );

    expect(listCalls.every((call) => call.name === 'state_snapshot')).toBe(
      true
    );
    expect(
      transport.calls.some(
        (call) =>
          call.name === 'state_read' &&
          Array.isArray(call.arguments.keys) &&
          (call.arguments.keys as string[]).some((key) => key.includes('*'))
      )
    ).toBe(false);
  });

  it('getAllMemories returns keys under the crew prefix', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeAgentOutput('researcher', { findings: 'alpha' });
    await memory.storeSharedMemory('note', { text: 'shared' });

    const { memories } = await memory.getAllMemories();
    expect(memories.length).toBeGreaterThanOrEqual(2);
    expect(memories.some((m) => m.includes('alpha'))).toBe(true);
  });

  it('listAgents returns agents with stored outputs', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeAgentOutput('researcher', { findings: 'alpha' });
    await memory.storeAgentOutput('writer', { draft: 'beta' });
    await memory.storeSharedMemory('noise', { x: 1 });

    const agents = await memory.listAgents();
    expect(agents.sort()).toEqual(['researcher', 'writer']);
  });

  it('listTasks returns stored task results', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeTaskResult('t1', 'Research topic', { ok: true }, 'researcher');
    await memory.storeAgentOutput('researcher', { findings: 'alpha' });

    const tasks = await memory.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: 't1',
      taskDescription: 'Research topic',
      agentRole: 'researcher',
      output: { ok: true },
    });
  });

  it('getAllSharedMemories returns only shared keys', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeSharedMemory('a', { n: 1 });
    await memory.storeSharedMemory('b', { n: 2 });
    await memory.storeAgentOutput('researcher', { findings: 'nope' });

    const shared = await memory.getAllSharedMemories();
    expect(Object.keys(shared).sort()).toEqual([
      'crewai:shared:a',
      'crewai:shared:b',
    ]);
    expect(shared['crewai:shared:a']).toEqual({ n: 1 });
  });

  it('keeps exact-key get/set paths working via getMany/get', async () => {
    const transport = new FakeTransport();
    const memory = createMemory(transport);

    await memory.storeAgentOutput('researcher', { findings: 'alpha' });
    const context = await memory.getAgentContext('researcher');

    expect(context.previousOutputs['crewai:agent:researcher:output']).toBeDefined();
    expect(
      transport.calls.some(
        (call) =>
          call.name === 'state_read' &&
          Array.isArray(call.arguments.keys) &&
          (call.arguments.keys as string[]).includes(
            'crewai:agent:researcher:output'
          )
      )
    ).toBe(true);

    const shared = await memory.getSharedMemory('note');
    expect(shared).toBeNull();

    await memory.storeSharedMemory('note', { text: 'hi' });
    expect(await memory.getSharedMemory('note')).toEqual({ text: 'hi' });
  });
});
