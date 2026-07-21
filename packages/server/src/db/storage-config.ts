import { homedir } from 'node:os';
import { isAbsolute, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type StorageEngine = 'sqlite' | 'postgresql';

export interface StorageConfig {
  engine: StorageEngine;
  databaseUrl: string;
  databasePath?: string;
  location?: string;
}

export interface StorageConfigInput {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
  cwd?: string;
}

export function defaultDataDirectory(input: StorageConfigInput = {}): string {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const home = input.homeDir ?? homedir();
  const pathApi = platform === 'win32' ? win32 : posix;

  if (env.CONTEXT_ROUTER_DATA_DIR?.trim()) {
    return pathApi.resolve(env.CONTEXT_ROUTER_DATA_DIR.trim());
  }
  if (platform === 'win32') {
    return win32.join(
      env.LOCALAPPDATA?.trim() || win32.join(home, 'AppData', 'Local'),
      'context-router',
    );
  }
  if (platform === 'darwin') {
    return posix.join(home, 'Library', 'Application Support', 'context-router');
  }
  return posix.join(
    env.XDG_DATA_HOME?.trim() || posix.join(home, '.local', 'share'),
    'context-router',
  );
}

export function resolveStorageConfig(
  input: StorageConfigInput = {},
): StorageConfig {
  const env = input.env ?? process.env;
  const requestedEngine = env.STORAGE_ENGINE?.trim().toLowerCase();
  if (
    requestedEngine &&
    requestedEngine !== 'sqlite' &&
    requestedEngine !== 'postgresql'
  ) {
    throw new Error('STORAGE_ENGINE must be either "sqlite" or "postgresql"');
  }

  const configuredUrl = env.DATABASE_URL?.trim();
  if (!configuredUrl) {
    if (requestedEngine === 'postgresql') {
      throw new Error(
        'DATABASE_URL is required when STORAGE_ENGINE is postgresql',
      );
    }
    const databasePath = join(defaultDataDirectory(input), 'context-router.db');
    return sqliteConfig(databasePath);
  }

  const inferredEngine = inferStorageEngine(configuredUrl);
  if (requestedEngine && requestedEngine !== inferredEngine) {
    throw new Error(
      `STORAGE_ENGINE=${requestedEngine} does not match DATABASE_URL (${inferredEngine})`,
    );
  }
  if (inferredEngine === 'postgresql') {
    return { engine: 'postgresql', databaseUrl: configuredUrl };
  }
  return sqliteConfig(sqlitePathFromUrl(configuredUrl, input.cwd));
}

export function inferStorageEngine(databaseUrl: string): StorageEngine {
  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) return 'postgresql';
  if (/^(?:file|sqlite):/i.test(databaseUrl)) return 'sqlite';
  throw new Error(
    'Unsupported DATABASE_URL. Use file:/sqlite: for SQLite or postgres:/postgresql: for PostgreSQL',
  );
}

function sqlitePathFromUrl(databaseUrl: string, cwd = process.cwd()): string {
  if (/^file:\/\//i.test(databaseUrl)) return fileURLToPath(databaseUrl);
  const raw = databaseUrl.replace(/^(?:file|sqlite):/i, '');
  if (!raw) throw new Error('SQLite DATABASE_URL must include a file path');
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

function sqliteConfig(databasePath: string): StorageConfig {
  const absolutePath = resolve(databasePath);
  return {
    engine: 'sqlite',
    databasePath: absolutePath,
    databaseUrl: pathToFileURL(absolutePath).href,
    location: absolutePath,
  };
}
