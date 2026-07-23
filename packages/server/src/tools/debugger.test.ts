import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowDebugger } from './debugger.js';

// Mock the database client
vi.mock('../db/client.js', () => ({
  prisma: {
    workflow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    checkpoint: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock readStateFields and listCheckpoints from queries
vi.mock('../db/queries.js', () => ({
  readStateFields: vi.fn().mockResolvedValue({}),
  listCheckpoints: vi.fn().mockResolvedValue([]),
}));

describe('WorkflowDebugger', () => {
  let workflowDebugger: WorkflowDebugger;

  beforeEach(() => {
    workflowDebugger = new WorkflowDebugger('test-owner-id');
    vi.clearAllMocks();
  });

  describe('listWorkflows', () => {
    it('shows message when no workflows exist', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findMany).mockResolvedValueOnce([]);

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.listWorkflows();

      console.log = originalLog;

      expect(logs.some((log) => log.includes('No workflows found'))).toBe(true);
    });

    it('displays workflow list when workflows exist', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findMany).mockResolvedValueOnce([
        {
          id: 'wf-1',
          workspaceId: 'ws-1',
          status: 'RUNNING' as const,
          createdAt: new Date('2024-01-01'),
          completedAt: null,
          failureReason: null,
          workspace: { name: 'Test Workspace' },
        },
      ]);

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.listWorkflows();

      console.log = originalLog;

      expect(logs.some((log) => log.includes('WORKFLOW LIST'))).toBe(true);
      expect(logs.some((log) => log.includes('wf-1'))).toBe(true);
      expect(logs.some((log) => log.includes('RUNNING'))).toBe(true);
    });

    it('shows correct status colors for different workflow states', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findMany).mockResolvedValueOnce([
        {
          id: 'wf-1',
          workspaceId: 'ws-1',
          status: 'COMPLETED' as const,
          createdAt: new Date('2024-01-01'),
          completedAt: new Date('2024-01-02'),
          failureReason: null,
          workspace: { name: 'Workspace 1' },
        },
        {
          id: 'wf-2',
          workspaceId: 'ws-2',
          status: 'FAILED' as const,
          createdAt: new Date('2024-01-01'),
          completedAt: new Date('2024-01-02'),
          failureReason: 'Test failure',
          workspace: { name: 'Workspace 2' },
        },
      ]);

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.listWorkflows();

      console.log = originalLog;

      expect(logs.some((log) => log.includes('COMPLETED'))).toBe(true);
      expect(logs.some((log) => log.includes('FAILED'))).toBe(true);
    });
  });

  describe('inspectWorkflow', () => {
    it('shows error when workflow not found', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce(null);

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args) => {
        errors.push(args.map(String).join(' '));
      };

      await workflowDebugger.inspectWorkflow('non-existent-id');

      console.error = originalError;

      expect(errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('displays workflow details when found', async () => {
      const { prisma } = await import('../db/client.js');
      const { listCheckpoints } = await import('../db/queries.js');
      const { readStateFields } = await import('../db/queries.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date('2024-01-01'),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test Workspace' },
      });
      vi.mocked(listCheckpoints).mockResolvedValueOnce([]);
      vi.mocked(readStateFields).mockResolvedValueOnce({});

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.inspectWorkflow('wf-1');

      console.log = originalLog;

      expect(logs.some((log) => log.includes('WORKFLOW INSPECTOR'))).toBe(true);
      expect(logs.some((log) => log.includes('wf-1'))).toBe(true);
    });

    it('shows checkpoints with their snapshots', async () => {
      const { prisma } = await import('../db/client.js');
      const { listCheckpoints } = await import('../db/queries.js');
      const { readStateFields } = await import('../db/queries.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date('2024-01-01'),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test Workspace' },
      });
      vi.mocked(listCheckpoints).mockResolvedValueOnce([
        {
          id: 'cp-1',
          workflowId: 'wf-1',
          label: 'before-step-1',
          createdAt: new Date('2024-01-01'),
          snapshot: { key1: 'value1', key2: 'value2' },
        },
      ]);
      vi.mocked(readStateFields).mockResolvedValueOnce({ currentKey: 'currentValue' });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.inspectWorkflow('wf-1');

      console.log = originalLog;

      expect(logs.some((log) => log.includes('before-step-1'))).toBe(true);
      expect(logs.some((log) => log.includes('Checkpoints'))).toBe(true);
    });
  });

  describe('diffCheckpoints', () => {
    it('shows error when workflow not found', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce(null);

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args) => {
        errors.push(args.map(String).join(' '));
      };

      await workflowDebugger.diffCheckpoints('non-existent', 'cp-1', 'cp-2');

      console.error = originalError;

      expect(errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('shows error when checkpoint not found', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date(),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test' },
      });
      vi.mocked(prisma.checkpoint.findFirst).mockResolvedValueOnce(null);

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args) => {
        errors.push(args.map(String).join(' '));
      };

      await workflowDebugger.diffCheckpoints('wf-1', 'cp-1', 'cp-2');

      console.error = originalError;

      expect(errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('shows diff between two checkpoints', async () => {
      const { prisma } = await import('../db/client.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date(),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test' },
      });
      vi.mocked(prisma.checkpoint.findFirst)
        .mockResolvedValueOnce({
          id: 'cp-1',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          label: 'before',
          createdAt: new Date('2024-01-01'),
          snapshot: { key1: 'old-value', key2: 'same' },
        })
        .mockResolvedValueOnce({
          id: 'cp-2',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          label: 'after',
          createdAt: new Date('2024-01-02'),
          snapshot: { key1: 'new-value', key2: 'same' },
        });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.diffCheckpoints('wf-1', 'cp-1', 'cp-2');

      console.log = originalLog;

      expect(logs.some((log) => log.includes('CHECKPOINT DIFF'))).toBe(true);
      expect(logs.some((log) => log.includes('-'))).toBe(true); // removed
      expect(logs.some((log) => log.includes('+'))).toBe(true); // added
    });

    it('shows no differences when snapshots are identical', async () => {
      const { prisma } = await import('../db/client.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date(),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test' },
      });
      vi.mocked(prisma.checkpoint.findFirst)
        .mockResolvedValueOnce({
          id: 'cp-1',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          label: 'same1',
          createdAt: new Date('2024-01-01'),
          snapshot: { key1: 'value' },
        })
        .mockResolvedValueOnce({
          id: 'cp-2',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          label: 'same2',
          createdAt: new Date('2024-01-02'),
          snapshot: { key1: 'value' },
        });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await workflowDebugger.diffCheckpoints('wf-1', 'cp-1', 'cp-2');

      console.log = originalLog;

      expect(logs.some((log) => log.includes('No differences found'))).toBe(true);
    });
  });

  describe('tailWorkflow', () => {
    it('shows error when workflow not found', async () => {
      const { prisma } = await import('../db/client.js');
      vi.mocked(prisma.workflow.findFirst).mockResolvedValueOnce(null);

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args) => {
        errors.push(args.map(String).join(' '));
      };

      await workflowDebugger.tailWorkflow('non-existent-id');

      console.error = originalError;

      expect(errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('single-shot snapshot resolves without hanging or process.exit', async () => {
      const { prisma } = await import('../db/client.js');
      const { listCheckpoints } = await import('../db/queries.js');
      const { readStateFields } = await import('../db/queries.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date(),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test' },
      });
      vi.mocked(listCheckpoints).mockResolvedValue([]);
      vi.mocked(readStateFields).mockResolvedValue({ foo: 'bar' });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      await expect(
        workflowDebugger.tailWorkflow('wf-1', { continuous: false }),
      ).resolves.toBeUndefined();

      console.log = originalLog;

      expect(exitSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(logs.some((log) => log.includes('WORKFLOW TAIL'))).toBe(true);
      expect(logs.some((log) => log.includes('Single-shot snapshot'))).toBe(true);
      expect(logs.some((log) => log.includes('foo'))).toBe(true);

      exitSpy.mockRestore();
      setIntervalSpy.mockRestore();
    });

    it('updates lastCheckpointCount across successive continuous polls', async () => {
      const { prisma } = await import('../db/client.js');
      const { listCheckpoints } = await import('../db/queries.js');
      const { readStateFields } = await import('../db/queries.js');

      vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
        id: 'wf-1',
        workspaceId: 'ws-1',
        status: 'RUNNING' as const,
        createdAt: new Date(),
        completedAt: null,
        failureReason: null,
        workspace: { name: 'Test' },
      });
      vi.mocked(readStateFields).mockResolvedValue({ step: 1 });
      vi.mocked(listCheckpoints)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'cp-1',
            workflowId: 'wf-1',
            label: 'first-cp',
            createdAt: new Date(),
            snapshot: { a: 1 },
          },
        ]);

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      const abort = new AbortController();
      let intervalCb: (() => void) | undefined;
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: TimerHandler) => {
        intervalCb = typeof cb === 'function' ? () => { void (cb as () => void)(); } : undefined;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

      const tailPromise = workflowDebugger.tailWorkflow('wf-1', {
        continuous: true,
        intervalMs: 500,
        signal: abort.signal,
      });

      // Allow initial poll to finish, then trigger second poll via mocked interval
      await vi.waitFor(() => {
        expect(intervalCb).toBeDefined();
      });
      intervalCb!();
      await vi.waitFor(() => {
        expect(logs.some((log) => log.includes('first-cp'))).toBe(true);
      });

      abort.abort();
      await tailPromise;

      console.log = originalLog;

      expect(logs.some((log) => log.includes('New checkpoint'))).toBe(true);
      expect(clearIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('continuous mode stops without process.exit when workflow completes', async () => {
      const { prisma } = await import('../db/client.js');
      const { listCheckpoints } = await import('../db/queries.js');
      const { readStateFields } = await import('../db/queries.js');

      vi.mocked(prisma.workflow.findFirst)
        .mockResolvedValueOnce({
          id: 'wf-1',
          workspaceId: 'ws-1',
          status: 'RUNNING' as const,
          createdAt: new Date(),
          completedAt: null,
          failureReason: null,
          workspace: { name: 'Test' },
        })
        .mockResolvedValueOnce({
          id: 'wf-1',
          workspaceId: 'ws-1',
          status: 'RUNNING' as const,
          createdAt: new Date(),
          completedAt: null,
          failureReason: null,
          workspace: { name: 'Test' },
        })
        .mockResolvedValue({
          id: 'wf-1',
          workspaceId: 'ws-1',
          status: 'COMPLETED' as const,
          createdAt: new Date(),
          completedAt: new Date(),
          failureReason: null,
          workspace: { name: 'Test' },
        });
      vi.mocked(listCheckpoints).mockResolvedValue([]);
      vi.mocked(readStateFields).mockResolvedValue({});

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      let intervalCb: (() => void) | undefined;
      vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: TimerHandler) => {
        intervalCb = typeof cb === 'function' ? () => { void (cb as () => void)(); } : undefined;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
      vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(' '));
      };

      const tailPromise = workflowDebugger.tailWorkflow('wf-1', {
        continuous: true,
        intervalMs: 500,
      });

      await vi.waitFor(() => expect(intervalCb).toBeDefined());
      intervalCb!();
      await tailPromise;

      console.log = originalLog;

      expect(exitSpy).not.toHaveBeenCalled();
      expect(logs.some((log) => log.includes('Workflow ended'))).toBe(true);

      exitSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });
});

describe('clampPollInterval', () => {
  it('clamps to 500–10000 and defaults invalid values', async () => {
    const { clampPollInterval, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS } =
      await import('./debugger.js');

    expect(clampPollInterval(2000)).toBe(2000);
    expect(clampPollInterval(100)).toBe(MIN_POLL_INTERVAL_MS);
    expect(clampPollInterval(50000)).toBe(MAX_POLL_INTERVAL_MS);
    expect(clampPollInterval(-1)).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(clampPollInterval(NaN)).toBe(DEFAULT_POLL_INTERVAL_MS);
  });
});

describe('debugger_inspect pollInterval schema', () => {
  it('rejects pollInterval outside 500–10000', async () => {
    const { registerDebuggerTools } = await import('./debugger-tool.js');
    const tools = registerDebuggerTools({} as never, () => 'test-owner');
    const tool = tools.get('debugger_inspect');
    expect(tool).toBeDefined();

    const tooLow = await tool!.handler({
      action: 'tail',
      workflowId: '00000000-0000-4000-8000-000000000001',
      pollInterval: 100,
    });
    expect(tooLow.isError).toBe(true);

    const tooHigh = await tool!.handler({
      action: 'tail',
      workflowId: '00000000-0000-4000-8000-000000000001',
      pollInterval: 50000,
    });
    expect(tooHigh.isError).toBe(true);
  });

  it('accepts pollInterval within bounds in JSON schema metadata', async () => {
    const { registerDebuggerTools } = await import('./debugger-tool.js');
    const { MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS } = await import('./debugger.js');
    const tools = registerDebuggerTools({} as never, () => 'test-owner');
    const tool = tools.get('debugger_inspect');
    const pollProp = tool!.definition.inputSchema.properties.pollInterval as {
      minimum?: number;
      maximum?: number;
    };
    expect(pollProp.minimum).toBe(MIN_POLL_INTERVAL_MS);
    expect(pollProp.maximum).toBe(MAX_POLL_INTERVAL_MS);
  });
});

describe('WorkflowDebugger formatDebuggerOutput', () => {
  it('returns the string unchanged', async () => {
    const { formatDebuggerOutput } = await import('./debugger.js');

    expect(formatDebuggerOutput('test output')).toBe('test output');
    expect(formatDebuggerOutput('')).toBe('');
    expect(formatDebuggerOutput('multi\nline\noutput')).toBe('multi\nline\noutput');
  });
});
