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
});
