import { readFileSync } from 'node:fs';

/**
 * The server version, read from the packaged package.json.
 *
 * Hardcoding it here would drift the moment changesets bumps the manifest,
 * which is exactly what happened between 0.3.1 and 0.5.0.
 */
export const SERVER_VERSION: string = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;
