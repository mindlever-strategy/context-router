#!/usr/bin/env node
/**
 * Run benchmarks
 *
 * Usage:
 *   node scripts/run-benchmark.mjs token
 *   node scripts/run-benchmark.mjs cost
 *   node scripts/run-benchmark.mjs all
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const benchmarks = {
  'token': 'benchmarks/token-reduction.ts',
  'cost': 'benchmarks/cost-savings.ts',
  'memory': 'benchmarks/memory-usage.ts',
  'latency': 'benchmarks/latency.ts',
  'recovery': 'benchmarks/failure-recovery.ts',
  'all': null, // Special case
};

const name = process.argv[2] || 'all';

if (!benchmarks[name]) {
  console.log('Usage: node scripts/run-benchmark.mjs <benchmark-name>');
  console.log('Available benchmarks:');
  for (const [key, file] of Object.entries(benchmarks)) {
    if (key !== 'all') {
      console.log(`  - ${key} (${file})`);
    }
  }
  console.log('  - all (run all benchmarks)');
  process.exit(2);
}

if (name === 'all') {
  console.log('\n🧪 Running all benchmarks...\n');

  for (const [key, file] of Object.entries(benchmarks)) {
    if (key === 'all') continue;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Running: ${key}`);
    console.log('─'.repeat(80));

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', file],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'inherit',
      },
    );

    if (result.status !== 0) {
      console.error(`Benchmark "${key}" failed with exit code ${result.status}`);
    }
  }

  console.log('\n✅ All benchmarks complete\n');
} else {
  const file = benchmarks[name];
  console.log(`Running: ${file}\n`);

  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', file],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  process.exit(result.status ?? 0);
}
