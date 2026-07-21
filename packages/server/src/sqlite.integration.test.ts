import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('SQLite vertical slice', () => {
  let dataDirectory: string;
  let databasePath: string;
  let queries: typeof import('./db/queries.js');
  let closeDatabase: typeof import('./db/client.js').closeDatabase;
  let migrateSqlite: typeof import('./db/client.js').migrateSqlite;
  let readSqlitePragma: typeof import('./db/client.js').readSqlitePragma;
  const ownerId = `sqlite-${randomUUID()}`;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'context-router-sqlite-'));
    databasePath = join(dataDirectory, 'context-router.db');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('STORAGE_ENGINE', 'sqlite');
    vi.stubEnv('CONTEXT_ROUTER_DATA_DIR', dataDirectory);
    const client = await import('./db/client.js');
    await client.connectDatabase();
    queries = await import('./db/queries.js');
    ({ closeDatabase, migrateSqlite, readSqlitePragma } = client);
  });

  afterAll(async () => {
    await closeDatabase();
    vi.unstubAllEnvs();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('persists roles, CAS writes, checkpoints, and restores', async () => {
    const workspace = await queries.ensureWorkspace('SQLite Example', ownerId);
    expect((await queries.ensureWorkspace('sqlite example', ownerId)).id).toBe(
      workspace.id,
    );
    await queries.createAgentRole(
      workspace.id,
      ownerId,
      'writer',
      ['result'],
      ['result'],
    );
    const workflow = await queries.createWorkflow(workspace.id, ownerId);
    const first = await queries.writeState(
      workspace.id,
      ownerId,
      workflow.id,
      'result',
      { value: 1 },
      { agentRole: 'writer' },
    );
    const checkpoint = await queries.createCheckpoint(
      workspace.id,
      ownerId,
      workflow.id,
      'known-good',
    );
    await queries.writeState(
      workspace.id,
      ownerId,
      workflow.id,
      'result',
      { value: 2 },
      { expectedVersion: first.version },
    );
    await queries.restoreCheckpoint(workspace.id, ownerId, checkpoint.id);
    expect(
      (await queries.readState(workspace.id, ownerId, workflow.id, 'result'))
        ?.value,
    ).toEqual({ value: 1 });
  });

  it('enforces foreign keys on the live Prisma connection', async () => {
    expect(await readSqlitePragma('foreign_keys')).toBe(1);
    const { prisma: liveClient } = await import('./db/client.js');
    await expect(
      liveClient.$executeRawUnsafe(
        `INSERT INTO "Workflow" ("id", "workspaceId", "status", "createdAt") VALUES ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000098', 'RUNNING', datetime('now'))`,
      ),
    ).rejects.toThrow();
  });

  it('applies busy_timeout on the live Prisma connection', async () => {
    expect(await readSqlitePragma('busy_timeout')).toBe(5000);
  });

  it('returns UNVALIDATED_STATE when state_write omits schemaName', async () => {
    const { registerStateTools } = await import('./tools/state.js');
    const stateWrite = registerStateTools({} as never, () => ownerId).get(
      'state_write',
    );
    if (!stateWrite) throw new Error('state_write tool was not registered');

    const workspace = await queries.ensureWorkspace('Warn Example', ownerId);
    const workflow = await queries.createWorkflow(workspace.id, ownerId);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await stateWrite.handler({
      workspaceId: workspace.id,
      workflowId: workflow.id,
      key: 'lead',
      value: { name: 'Acme' },
    });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      success: boolean;
      data: { warning?: string; written: boolean };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.warning).toBe('UNVALIDATED_STATE');
    expect(payload.data.written).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();

    const previousLogSetting = process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE;
    process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE = 'true';
    await stateWrite.handler({
      workspaceId: workspace.id,
      workflowId: workflow.id,
      key: 'lead-2',
      value: { name: 'Beta' },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('UNVALIDATED_STATE'),
    );
    warnSpy.mockRestore();
    if (previousLogSetting === undefined) {
      delete process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE;
    } else {
      process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE = previousLogSetting;
    }
  });

  it('does not warn when state_write includes schemaName', async () => {
    const { registerStateTools } = await import('./tools/state.js');
    const { registerSchemaTools } = await import('./tools/schema.js');
    const stateWrite = registerStateTools({} as never, () => ownerId).get(
      'state_write',
    );
    const schemaCreate = registerSchemaTools({} as never, () => ownerId).get(
      'schema_create',
    );
    if (!stateWrite || !schemaCreate) {
      throw new Error('Expected state and schema tools to be registered');
    }

    const workspace = await queries.ensureWorkspace('Schema Example', ownerId);
    const workflow = await queries.createWorkflow(workspace.id, ownerId);
    await schemaCreate.handler({
      workspaceId: workspace.id,
      name: 'Lead',
      fields: { name: { type: 'string', required: true } },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await stateWrite.handler({
      workspaceId: workspace.id,
      workflowId: workflow.id,
      key: 'lead',
      value: { name: 'Acme' },
      schemaName: 'Lead',
    });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      success: boolean;
      data: { warning?: string };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.warning).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('applies migrations once and detects checksum changes', () => {
    migrateSqlite(databasePath);
    const database = new Database(databasePath);
    const original = database
      .prepare(
        'SELECT "checksum" FROM "_context_router_migrations" WHERE "name" = ?',
      )
      .get('001_initial.sql') as { checksum: string };
    database
      .prepare(
        'UPDATE "_context_router_migrations" SET "checksum" = ? WHERE "name" = ?',
      )
      .run('altered', '001_initial.sql');
    database.close();
    expect(() => migrateSqlite(databasePath)).toThrow('checksum mismatch');

    const repair = new Database(databasePath);
    repair
      .prepare(
        'UPDATE "_context_router_migrations" SET "checksum" = ? WHERE "name" = ?',
      )
      .run(original.checksum, '001_initial.sql');
    repair.close();
  });
});
