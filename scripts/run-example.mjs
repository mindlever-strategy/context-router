#!/usr/bin/env node
/**
 * Run examples using the locally-built SDK.
 *
 * Usage:
 *   node scripts/run-example.mjs simple-pipeline
 *   node scripts/run-example.mjs parallel-merge
 *   node scripts/run-example.mjs retry-recovery
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const examples = {
  'simple-pipeline': 'examples/simple-pipeline.ts',
  'parallel-merge': 'examples/parallel-merge.ts',
  'retry-recovery': 'examples/retry-recovery.ts',
};

const sdkDist = resolve(process.cwd(), 'packages/sdk-typescript/dist/index.js');
if (!existsSync(sdkDist)) {
  console.error('SDK is not built. Run: npm run build');
  process.exit(1);
}

const name = process.argv[2];
if (!name || !examples[name]) {
  console.log('Usage: node scripts/run-example.mjs <example-name>');
  console.log('Available examples:');
  for (const [key, file] of Object.entries(examples)) {
    console.log(`  - ${key} (${file})`);
  }
  process.exit(2);
}

const examplePath = resolve(process.cwd(), examples[name]);
console.log(`Running: ${examplePath}\n`);

const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', examplePath],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 0);
