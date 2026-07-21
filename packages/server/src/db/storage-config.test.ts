import { describe, expect, it } from 'vitest';
import {
  defaultDataDirectory,
  inferStorageEngine,
  resolveStorageConfig,
} from './storage-config.js';

describe('storage configuration', () => {
  it('defaults to the OS application-data SQLite database', () => {
    const config = resolveStorageConfig({
      env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
      platform: 'win32',
      homeDir: 'C:\\Users\\dev',
    });
    expect(config.engine).toBe('sqlite');
    expect(config.databasePath).toContain('context-router');
    expect(config.databasePath).toContain('context-router.db');
  });

  it('uses standard macOS and Linux data directories', () => {
    expect(
      defaultDataDirectory({
        env: {},
        platform: 'darwin',
        homeDir: '/Users/dev',
      }),
    ).toBe('/Users/dev/Library/Application Support/context-router');
    expect(
      defaultDataDirectory({
        env: {},
        platform: 'linux',
        homeDir: '/home/dev',
      }),
    ).toBe('/home/dev/.local/share/context-router');
    expect(
      defaultDataDirectory({
        env: { XDG_DATA_HOME: '/data' },
        platform: 'linux',
        homeDir: '/home/dev',
      }),
    ).toBe('/data/context-router');
  });

  it('detects supported URLs and rejects mismatches', () => {
    expect(inferStorageEngine('postgresql://localhost/router')).toBe(
      'postgresql',
    );
    expect(inferStorageEngine('file:./router.db')).toBe('sqlite');
    expect(() =>
      resolveStorageConfig({
        env: {
          DATABASE_URL: 'file:./router.db',
          STORAGE_ENGINE: 'postgresql',
        },
      }),
    ).toThrow('does not match');
    expect(() => inferStorageEngine('mysql://localhost/router')).toThrow(
      'Unsupported DATABASE_URL',
    );
  });
});
