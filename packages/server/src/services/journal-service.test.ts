import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startSqliteHarness,
  type SqliteHarness,
} from '../test-support/sqlite-harness.js';
import {
  pendingSequenceLockCount,
  withSequenceLock,
} from './journal-service.js';

/** Resolves after the microtask queue has fully drained. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A promise plus externally-callable resolve/reject, for controlling
 * exactly when a queued operation completes in a test. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('withSequenceLock', () => {
  it('runs appends for the same workflow strictly one at a time', async () => {
    const workflowId = `wf-serial-${Math.random()}`;
    const order: string[] = [];
    const first = deferred<void>();

    const firstResult = withSequenceLock(workflowId, async () => {
      order.push('first-start');
      await first.promise;
      order.push('first-end');
      return 'first';
    });

    const secondResult = withSequenceLock(workflowId, async () => {
      order.push('second-start');
      return 'second';
    });

    // The second operation must not start while the first is still pending,
    // even though nothing here awaits the first yet.
    await flushMicrotasks();
    expect(order).toEqual(['first-start']);

    first.resolve();
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('runs appends for different workflows concurrently', async () => {
    const order: string[] = [];
    const a = deferred<void>();
    const b = deferred<void>();

    const resultA = withSequenceLock(`wf-a-${Math.random()}`, async () => {
      order.push('a-start');
      await a.promise;
      order.push('a-end');
      return 'a';
    });
    const resultB = withSequenceLock(`wf-b-${Math.random()}`, async () => {
      order.push('b-start');
      await b.promise;
      order.push('b-end');
      return 'b';
    });

    // Both should have started even though neither has resolved -- proves
    // distinct workflow IDs don't serialize against each other.
    await flushMicrotasks();
    expect(order).toEqual(['a-start', 'b-start']);

    b.resolve();
    await expect(resultB).resolves.toBe('b');
    a.resolve();
    await expect(resultA).resolves.toBe('a');
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end']);
  });

  it('still runs the next append after a rejected one', async () => {
    const workflowId = `wf-reject-${Math.random()}`;

    const failing = withSequenceLock(workflowId, async () => {
      throw new Error('boom');
    });
    const following = withSequenceLock(workflowId, async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('ok');
  });

  it('clears its lock entry once the chain drains, without deleting a newer tail', async () => {
    const workflowId = `wf-cleanup-${Math.random()}`;
    const before = pendingSequenceLockCount();

    await withSequenceLock(workflowId, async () => 'first');
    await flushMicrotasks();
    // The first chain fully drained and nothing else queued behind it --
    // its entry should be gone, not left to grow the map forever.
    expect(pendingSequenceLockCount()).toBe(before);

    // Queue a second, slower operation, and only after it has started (so
    // its tail has replaced the map entry) let a timing quirk try to race
    // the first's own cleanup against it.
    const second = deferred<string>();
    const secondResult = withSequenceLock(workflowId, () => second.promise);
    await flushMicrotasks();
    expect(pendingSequenceLockCount()).toBe(before + 1);

    second.resolve('second');
    await expect(secondResult).resolves.toBe('second');
    await flushMicrotasks();
    expect(pendingSequenceLockCount()).toBe(before);
  });
});

describe('journal sequence allocation', () => {
  let harness: SqliteHarness;
  let queries: SqliteHarness['queries'];
  let journalService: typeof import('./journal-service.js').journalService;
  const owner = 'journal-owner';

  beforeAll(async () => {
    harness = await startSqliteHarness('journal');
    queries = harness.queries;
    ({ journalService } = await import('./journal-service.js'));
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('never reuses a sequence number under concurrent appends', async () => {
    const workspace = await queries.createWorkspace('journal-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);

    const appended = await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        journalService.append(
          workspace.id,
          workflow.id,
          'state.written',
          { index },
          { source: 'test' },
        ),
      ),
    );

    const sequences = appended
      .map((entry) => entry.sequence)
      .sort((a, b) => a - b);
    expect(new Set(sequences).size).toBe(sequences.length);
  });
});
