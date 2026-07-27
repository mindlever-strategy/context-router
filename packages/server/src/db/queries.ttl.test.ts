import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startSqliteHarness,
  type SqliteHarness,
} from '../test-support/sqlite-harness.js';
import { readCheckpointEntries } from '../services/checkpoint-format.js';

describe('state expiry consistency', () => {
  let harness: SqliteHarness;
  let queries: SqliteHarness['queries'];
  const owner = 'ttl-owner';

  beforeAll(async () => {
    harness = await startSqliteHarness('ttl');
    queries = harness.queries;
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('hides expired keys from every read path', async () => {
    const workspace = await queries.createWorkspace('ttl-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);

    await queries.writeState(workspace.id, owner, workflow.id, 'live', {
      n: 1,
    });
    await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'dead',
      { n: 2 },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    expect(
      await queries.readState(workspace.id, owner, workflow.id, 'dead'),
    ).toBeNull();
    expect(
      await queries.snapshotState(workspace.id, owner, workflow.id),
    ).toEqual({ live: { n: 1 } });
    expect(
      await queries.readStateFields(workspace.id, owner, workflow.id, [
        'live',
        'dead',
      ]),
    ).toEqual({ live: { n: 1 } });
    expect(
      await queries.readStateBatch(workspace.id, owner, workflow.id, [
        'live',
        'dead',
      ]),
    ).toEqual({
      results: [
        { key: 'live', found: true, value: { n: 1 }, version: 1 },
        { key: 'dead', found: false },
      ],
    });
  });

  it('does not skip an expired key during batch writes with onConflict: skip', async () => {
    const workspace = await queries.createWorkspace('ttl-batch-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);

    await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'expired',
      { n: 1 },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const result = await queries.writeStateBatch(
      workspace.id,
      owner,
      workflow.id,
      [{ key: 'expired', value: { n: 2 } }],
      { onConflict: 'skip' },
    );

    expect(result.results).toEqual([
      { key: 'expired', success: true, version: 2 },
    ]);
    expect(
      (await queries.readState(workspace.id, owner, workflow.id, 'expired'))
        ?.value,
    ).toEqual({ n: 2 });
  });

  it('clears an existing TTL the same way via writeState and via the atomic batch path', async () => {
    const workspace = await queries.createWorkspace('ttl-clear-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);

    // Path 1: writeState directly.
    await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'single',
      { n: 1 },
      { expiresIn: 3600 },
    );
    await queries.writeState(workspace.id, owner, workflow.id, 'single', {
      n: 2,
    });
    const single = await queries.readState(
      workspace.id,
      owner,
      workflow.id,
      'single',
    );
    expect(single?.expiresAt).toBeNull();

    // Path 2: writeStateBatch's atomic transaction, which goes through
    // writeStateEntry rather than writeState.
    await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'batch',
      { n: 1 },
      { expiresIn: 3600 },
    );
    await queries.writeStateBatch(
      workspace.id,
      owner,
      workflow.id,
      [{ key: 'batch', value: { n: 2 } }],
      { atomic: true },
    );
    const batch = await queries.readState(
      workspace.id,
      owner,
      workflow.id,
      'batch',
    );
    expect(batch?.expiresAt).toBeNull();
  });

  it('enforces agent-role ACLs on TTL writes', async () => {
    const workspace = await queries.createWorkspace('ttl-acl-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);
    await queries.createAgentRole(
      workspace.id,
      owner,
      'writer',
      ['allowed'],
      ['allowed'],
    );

    await expect(
      queries.writeState(
        workspace.id,
        owner,
        workflow.id,
        'forbidden',
        { n: 1 },
        { agentRole: 'writer', expiresIn: 60 },
      ),
    ).rejects.toThrow('WRITE_FORBIDDEN');
  });

  it('excludes expired keys from checkpoints', async () => {
    const workspace = await queries.createWorkspace('ttl-cp-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);

    await queries.writeState(workspace.id, owner, workflow.id, 'live', {
      n: 1,
    });
    await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'dead',
      { n: 2 },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const checkpoint = await queries.createCheckpoint(
      workspace.id,
      owner,
      workflow.id,
    );
    // Asserted on keys, not shape: the checkpoint snapshot format is an
    // implementation detail (see services/checkpoint-format.ts).
    expect(
      Object.keys(readCheckpointEntries(checkpoint.snapshot)).sort(),
    ).toEqual(['live']);
  });

  it('preserves version and expiry across a checkpoint restore', async () => {
    const workspace = await queries.createWorkspace('restore-ws', owner);
    const workflow = await queries.createWorkflow(workspace.id, owner);
    const future = new Date(Date.now() + 600_000);

    await queries.writeState(workspace.id, owner, workflow.id, 'k', { n: 1 });
    const second = await queries.writeState(
      workspace.id,
      owner,
      workflow.id,
      'k',
      { n: 2 },
      { expiresAt: future },
    );
    expect(second.version).toBe(2);

    const checkpoint = await queries.createCheckpoint(
      workspace.id,
      owner,
      workflow.id,
    );
    await queries.writeState(workspace.id, owner, workflow.id, 'k', { n: 3 });
    await queries.restoreCheckpoint(workspace.id, owner, checkpoint.id);

    const restored = await queries.readState(
      workspace.id,
      owner,
      workflow.id,
      'k',
    );
    expect(restored?.value).toEqual({ n: 2 });
    expect(restored?.version).toBe(2);
    expect(restored?.expiresAt?.getTime()).toBe(future.getTime());
  });
});
