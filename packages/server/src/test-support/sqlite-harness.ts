import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';

export type SqliteHarness = {
  ownerId: string;
  queries: typeof import('../db/queries.js');
  teardown: () => Promise<void>;
};

/**
 * Boots an isolated SQLite database in a temp directory.
 *
 * `storageConfig` is resolved when `db/client.js` is first imported, so the
 * environment must be stubbed before that import happens. Callers must await
 * this inside `beforeAll` and call `teardown()` in `afterAll`.
 *
 * Call this at most ONCE per test file. Vitest caches modules per file, so a
 * second call in the same file reuses the first call's already-resolved
 * `storageConfig` — it would silently read and write the first database path
 * even after that directory was torn down. Use one top-level
 * `beforeAll`/`afterAll` pair per file; if you need a second isolated
 * database, put it in its own test file.
 */
export async function startSqliteHarness(
  label: string,
): Promise<SqliteHarness> {
  const dataDirectory = await mkdtemp(
    join(tmpdir(), `context-router-${label}-`),
  );
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('STORAGE_ENGINE', 'sqlite');
  vi.stubEnv('CONTEXT_ROUTER_DATA_DIR', dataDirectory);

  const client = await import('../db/client.js');
  await client.connectDatabase();
  const queries = await import('../db/queries.js');

  return {
    ownerId: `${label}-${randomUUID()}`,
    queries,
    teardown: async () => {
      await client.closeDatabase();
      vi.unstubAllEnvs();
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}
