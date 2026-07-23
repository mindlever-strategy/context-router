import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextRouterChecker,
  __resetDefaultCheckerForTests,
  __setDefaultCheckerForTests,
  contextRouterChannel,
  contextRouterNode,
  createContextRouterChecker,
  generateHandoff,
  writeContextRouterNode,
} from './index.js';

interface MockSession {
  workflow: { id: string };
  workspace: { id: string };
  set: ReturnType<typeof vi.fn>;
  getMany: ReturnType<typeof vi.fn>;
  checkpoint: ReturnType<typeof vi.fn>;
  handoff: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
}

function createMockRouter() {
  let checkpointSeq = 0;
  const state = new Map<string, unknown>();
  const workflow = { id: 'workflow-stable-uuid' };
  const workspace = { id: 'workspace-uuid' };

  const session: MockSession = {
    workflow,
    workspace,
    set: vi.fn(async (key: string, value: unknown) => {
      state.set(key, value);
    }),
    getMany: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = state.get(key);
      }
      return result;
    }),
    checkpoint: vi.fn(async (label?: string) => {
      checkpointSeq += 1;
      return {
        id: `checkpoint-${checkpointSeq}`,
        label,
        createdAt: new Date().toISOString(),
      };
    }),
    handoff: vi.fn(async () => ({
      summary: 'handoff-summary',
      keysIncluded: ['__state__'],
      packet: { keys: ['__state__'] },
    })),
    complete: vi.fn(async () => workflow),
  };

  const start = vi.fn(async () => session);

  const router = {
    start,
    checkpoint: {
      list: vi.fn(async () => []),
      restore: vi.fn(async () => undefined),
    },
    close: vi.fn(async () => undefined),
  };

  return { router, session, start, state, workflow };
}

describe('ContextRouterChecker', () => {
  beforeEach(() => {
    __resetDefaultCheckerForTests();
  });

  afterEach(() => {
    __resetDefaultCheckerForTests();
  });

  it('put returns the real checkpoint id, not the workflow id', async () => {
    const { router, workflow } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });

    const result = await checker.put(
      { thread_id: 'thread-1' },
      { count: 1 }
    );

    expect(result.checkpoint_id).toBe('checkpoint-1');
    expect(result.checkpoint_id).not.toBe(workflow.id);
    expect(result.thread_id).toBe('thread-1');
  });

  it('put returns a unique checkpoint_id on each save', async () => {
    const { router } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });

    const first = await checker.put({ thread_id: 'thread-1' }, { n: 1 });
    const second = await checker.put({ thread_id: 'thread-1' }, { n: 2 });

    expect(first.checkpoint_id).toBe('checkpoint-1');
    expect(second.checkpoint_id).toBe('checkpoint-2');
    expect(first.checkpoint_id).not.toBe(second.checkpoint_id);
  });

  it('reuses one session/workflow for the same thread across put and get', async () => {
    const { router, start } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });

    await checker.put({ thread_id: 'thread-1' }, { messages: ['a'] });
    const loaded = await checker.get({ thread_id: 'thread-1' });

    expect(start).toHaveBeenCalledTimes(1);
    expect(loaded?.data).toEqual({ messages: ['a'] });
    expect(loaded?.config.checkpoint_id).toBe('checkpoint-1');
  });
});

describe('helper sharing', () => {
  beforeEach(() => {
    __resetDefaultCheckerForTests();
  });

  afterEach(() => {
    __resetDefaultCheckerForTests();
  });

  it('write + read helpers share one workflow when given the same checker', async () => {
    const { router, start } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });

    await writeContextRouterNode(
      { draft: 'hello' },
      { thread_id: 'shared-thread' },
      { nodeName: 'write', checker }
    );

    const read = await contextRouterNode(
      {},
      { thread_id: 'shared-thread' },
      { checker }
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(read).toEqual({ draft: 'hello' });
  });

  it('helpers without explicit checker reuse the process-wide default instance', async () => {
    const { router, start } = createMockRouter();
    const seeded = createContextRouterChecker({ router: router as any });
    __setDefaultCheckerForTests(seeded);

    await writeContextRouterNode(
      { draft: 'via-default' },
      { thread_id: 'default-thread' },
      { nodeName: 'write' }
    );
    const read = await contextRouterNode(
      {},
      { thread_id: 'default-thread' }
    );
    await generateHandoff(
      { analysis: 'z' },
      { thread_id: 'default-thread' }
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(read).toEqual({ draft: 'via-default' });
  });

  it('fresh checkers would start separate workflows (contrast)', async () => {
    const { router, start } = createMockRouter();

    const a = createContextRouterChecker({ router: router as any });
    const b = createContextRouterChecker({ router: router as any });

    await a.getSessionDetails('contrast-thread');
    await b.getSessionDetails('contrast-thread');

    // Separate checker instances each keep their own session map
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('contextRouterChannel reader and writer share one session', async () => {
    const { router, start } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });
    const channel = contextRouterChannel('channel-thread', checker);

    await channel.writer({ value: 42 });
    const value = await channel.reader();

    expect(start).toHaveBeenCalledTimes(1);
    expect(value).toEqual({ value: 42 });
  });

  it('contextRouterChannel does not start a new workflow per read/write', async () => {
    const { router, start } = createMockRouter();
    const checker = createContextRouterChecker({ router: router as any });
    const channel = contextRouterChannel('channel-default', checker);

    await channel.writer({ a: 1 });
    await channel.writer({ a: 2 });
    await channel.reader();
    await channel.reader();

    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('ContextRouterChecker export', () => {
  it('exports ContextRouterChecker as a class', () => {
    expect(ContextRouterChecker).toBeTypeOf('function');
  });
});
