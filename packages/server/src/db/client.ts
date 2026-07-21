import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import Database from 'better-sqlite3';
import { PrismaClient as PostgreSqlClient } from '../generated/postgresql/client.js';
import { PrismaClient as SqliteClient } from '../generated/sqlite/client.js';
import { resolveStorageConfig } from './storage-config.js';

export const storageConfig = resolveStorageConfig();

let prismaClient: PostgreSqlClient | null = null;
let connectPromise: Promise<PostgreSqlClient> | null = null;

function createPostgreSqlClient(): PostgreSqlClient {
  return new PostgreSqlClient({
    adapter: new PrismaPg({ connectionString: storageConfig.databaseUrl }),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

function createSqliteClient(): SqliteClient {
  const databasePath = storageConfig.databasePath;
  if (!databasePath) throw new Error('SQLite database path was not resolved');
  try {
    mkdirSync(dirname(databasePath), { recursive: true });
    migrateSqlite(databasePath);
  } catch (error) {
    throw new Error(
      `Unable to initialize SQLite database at ${databasePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return new SqliteClient({
    adapter: new PrismaBetterSQLite3({ url: databasePath }),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

async function configureSqliteConnection(client: SqliteClient): Promise<void> {
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await client.$executeRawUnsafe('PRAGMA busy_timeout = 5000');
}

async function initializePrismaClient(): Promise<PostgreSqlClient> {
  if (storageConfig.engine === 'sqlite') {
    const client = createSqliteClient();
    await configureSqliteConnection(client);
    // Both generated clients expose the same model operations. Agent role arrays
    // are normalized at the query boundary because SQLite persists them as JSON.
    return client as unknown as PostgreSqlClient;
  }
  return createPostgreSqlClient();
}

function requirePrismaClient(): PostgreSqlClient {
  if (!prismaClient) {
    throw new Error(
      'Database is not initialized. Call connectDatabase() during startup.',
    );
  }
  return prismaClient;
}

export async function connectDatabase(): Promise<PostgreSqlClient> {
  if (prismaClient) return prismaClient;
  if (!connectPromise) {
    connectPromise = initializePrismaClient().then((client) => {
      prismaClient = client;
      return client;
    });
  }
  return connectPromise;
}

export const prisma: PostgreSqlClient = new Proxy({} as PostgreSqlClient, {
  get(_target, property, receiver) {
    const client = requirePrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export async function closeDatabase(): Promise<void> {
  if (!prismaClient) return;
  await prismaClient.$disconnect();
  prismaClient = null;
  connectPromise = null;
}

export function migrateSqlite(databasePath: string): void {
  const database = new Database(databasePath, { timeout: 5_000 });
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');
    database.exec(`
      CREATE TABLE IF NOT EXISTS "_context_router_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationDirectory = fileURLToPath(
      new URL('../../prisma/sqlite/migrations/', import.meta.url),
    );
    if (!statSync(migrationDirectory).isDirectory()) {
      throw new Error('Packaged SQLite migrations directory is missing');
    }
    const applied = database
      .prepare('SELECT "name", "checksum" FROM "_context_router_migrations"')
      .all() as Array<{ name: string; checksum: string }>;
    const appliedByName = new Map(
      applied.map((migration) => [migration.name, migration.checksum]),
    );

    for (const name of readdirSync(migrationDirectory)
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(
        new URL(`../../prisma/sqlite/migrations/${name}`, import.meta.url),
        'utf8',
      );
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previousChecksum = appliedByName.get(name);
      if (previousChecksum && previousChecksum !== checksum) {
        throw new Error(`SQLite migration checksum mismatch: ${name}`);
      }
      if (previousChecksum) continue;

      database.transaction(() => {
        database.exec(sql);
        database
          .prepare(
            'INSERT INTO "_context_router_migrations" ("name", "checksum") VALUES (?, ?)',
          )
          .run(name, checksum);
      })();
    }
  } finally {
    database.close();
  }
}

export async function readSqlitePragma(
  name: 'foreign_keys' | 'busy_timeout',
): Promise<number> {
  const client = requirePrismaClient();
  const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA ${name}`,
  );
  const row = rows[0];
  if (!row) return 0;
  const value = row[name] ?? Object.values(row)[0];
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}
