import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startSqliteHarness,
  type SqliteHarness,
} from '../test-support/sqlite-harness.js';

describe('state layer integrity', () => {
  let harness: SqliteHarness;
  let queries: SqliteHarness['queries'];
  const alice = 'alice';
  const mallory = 'mallory';

  beforeAll(async () => {
    harness = await startSqliteHarness('integrity');
    queries = harness.queries;
  });

  afterAll(async () => {
    await harness.teardown();
  });

  describe('owner isolation', () => {
    it('refuses multi-key reads from a non-owner', async () => {
      const workspace = await queries.createWorkspace('alice-ws', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);
      await queries.writeState(workspace.id, alice, workflow.id, 'secret', {
        apiKey: 'sk-alice-PRIVATE',
      });

      // Single-key reads are already scoped; multi-key reads must match.
      await expect(
        queries.readState(workspace.id, mallory, workflow.id, 'secret'),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');

      await expect(
        queries.snapshotState(workspace.id, mallory, workflow.id),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');

      await expect(
        queries.readStateFields(workspace.id, mallory, workflow.id, ['secret']),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    });

    it('still serves the legitimate owner', async () => {
      const workspace = await queries.createWorkspace('alice-ws-2', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);
      await queries.writeState(workspace.id, alice, workflow.id, 'ok', {
        v: 1,
      });

      expect(
        await queries.snapshotState(workspace.id, alice, workflow.id),
      ).toEqual({ ok: { v: 1 } });
    });
  });

  describe('atomic batch writes', () => {
    it('commits nothing when any entry fails', async () => {
      const workspace = await queries.createWorkspace('batch-ws', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);

      const batch = await queries.writeStateBatch(
        workspace.id,
        alice,
        workflow.id,
        [
          { key: 'good_one', value: { ok: true } },
          // Prisma rejects an undefined value, forcing a real failure
          // partway through the transaction.
          {
            key: 'poison',
            value: undefined as unknown as Parameters<
              typeof queries.writeStateBatch
            >[3][number]['value'],
          },
          { key: 'good_two', value: { ok: true } },
        ],
        { atomic: true },
      );

      expect(batch.results.every((result) => !result.success)).toBe(true);
      expect(
        await queries.snapshotState(workspace.id, alice, workflow.id),
      ).toEqual({});
    });

    it('commits every entry when all succeed', async () => {
      const workspace = await queries.createWorkspace('batch-ws-2', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);

      const batch = await queries.writeStateBatch(
        workspace.id,
        alice,
        workflow.id,
        [
          { key: 'a', value: { n: 1 } },
          { key: 'b', value: { n: 2 } },
        ],
        { atomic: true },
      );

      expect(batch.results.every((result) => result.success)).toBe(true);
      expect(
        await queries.snapshotState(workspace.id, alice, workflow.id),
      ).toEqual({ a: { n: 1 }, b: { n: 2 } });
    });
  });

  describe('compare-and-set', () => {
    it('lets exactly one of two concurrent CAS writers win', async () => {
      const workspace = await queries.createWorkspace('cas-ws', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);
      const initial = await queries.writeState(
        workspace.id,
        alice,
        workflow.id,
        'counter',
        { n: 0 },
      );

      const outcomes = await Promise.allSettled([
        queries.writeState(workspace.id, alice, workflow.id, 'counter', {
          n: 1,
        }, { expectedVersion: initial.version }),
        queries.writeState(workspace.id, alice, workflow.id, 'counter', {
          n: 2,
        }, { expectedVersion: initial.version }),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        message: 'VERSION_CONFLICT',
      });
    });

    it('rejects a stale expectedVersion', async () => {
      const workspace = await queries.createWorkspace('cas-ws-2', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);
      await queries.writeState(workspace.id, alice, workflow.id, 'k', {
        n: 0,
      });
      await queries.writeState(workspace.id, alice, workflow.id, 'k', {
        n: 1,
      });

      await expect(
        queries.writeState(
          workspace.id,
          alice,
          workflow.id,
          'k',
          { n: 2 },
          { expectedVersion: 1 },
        ),
      ).rejects.toThrow('VERSION_CONFLICT');
    });

    it('treats expectedVersion 0 as "must not exist yet"', async () => {
      const workspace = await queries.createWorkspace('cas-ws-3', alice);
      const workflow = await queries.createWorkflow(workspace.id, alice);

      const created = await queries.writeState(
        workspace.id,
        alice,
        workflow.id,
        'fresh',
        { n: 1 },
        { expectedVersion: 0 },
      );
      expect(created.version).toBe(1);

      await expect(
        queries.writeState(
          workspace.id,
          alice,
          workflow.id,
          'fresh',
          { n: 2 },
          { expectedVersion: 0 },
        ),
      ).rejects.toThrow('VERSION_CONFLICT');
    });
  });
});
