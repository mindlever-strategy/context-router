/**
 * Benchmark Runner
 *
 * Executes all benchmarks and generates a comprehensive report.
 */

import { runTokenReductionBenchmark } from './token-reduction.js';
import { runLatencyBenchmarks } from './latency.js';
import { runMemoryBenchmarks } from './memory-usage.js';
import { runCostSavingsBenchmarks, printCostSavingsTable } from './cost-savings.js';
import { benchmarkFailureRecovery } from './failure-recovery.js';

interface BenchmarkSummary {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  results: {
    tokenReduction: Awaited<ReturnType<typeof runTokenReductionBenchmark>>;
    latency: Awaited<ReturnType<typeof runLatencyBenchmarks>>;
    memory: Awaited<ReturnType<typeof runMemoryBenchmarks>>;
    costSavings: Awaited<ReturnType<typeof runCostSavingsBenchmarks>>;
    failureRecovery: Awaited<ReturnType<typeof benchmarkFailureRecovery>>;
  };
}

function printBanner(text: string, width: number = 80): void {
  const padding = Math.max(0, Math.floor((width - text.length - 4) / 2));
  console.log('\n' + '═'.repeat(width));
  console.log('═'.repeat(padding) + '  ' + text + '  ' + '═'.repeat(padding + (width % 2)));
  console.log('═'.repeat(width) + '\n');
}

function printSection(title: string): void {
  console.log('\n' + '─'.repeat(80));
  console.log(`  ${title}`);
  console.log('─'.repeat(80));
}

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    Context Router Benchmark Suite                             ║
║                    Proving Efficiency & Cost Savings                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  console.log('System Info:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  const summary: BenchmarkSummary = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    results: {
      tokenReduction: [],
      latency: [],
      memory: [],
      costSavings: [],
      failureRecovery: [],
    },
  };

  // 1. Token Reduction Benchmark
  printBanner('Benchmark 1: Token Reduction');
  console.log('Comparing context size between chat history and Context Router state...\n');
  summary.results.tokenReduction = await runTokenReductionBenchmark();

  // 2. Latency Benchmark
  printBanner('Benchmark 2: Operation Latency');
  console.log('Measuring Context Router operation overhead...\n');
  summary.results.latency = await runLatencyBenchmarks();

  // 3. Memory Usage Benchmark
  printBanner('Benchmark 3: Memory Usage');
  console.log('Comparing memory footprint...\n');
  summary.results.memory = await runMemoryBenchmarks();

  // 4. Cost Savings
  printBanner('Benchmark 4: Cost Savings');
  console.log('Calculating monetary savings...\n');
  summary.results.costSavings = await runCostSavingsBenchmarks();
  printCostSavingsTable(summary.results.costSavings);

  // 5. Failure Recovery
  printBanner('Benchmark 5: Failure Recovery');
  console.log('Comparing checkpoint restore vs full restart...\n');
  summary.results.failureRecovery = await benchmarkFailureRecovery();

  // Print Summary
  printBanner('Summary');

  const totalTime = Date.now() - startTime;

  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KEY FINDINGS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📊 Token Reduction                                                         │
│     Average reduction: ${getAverageTokenReduction(summary.results.tokenReduction).toFixed(1)}%                                           │
│     Best case: ${getMaxTokenReduction(summary.results.tokenReduction).toFixed(1)}%                                                       │
│                                                                             │
│  ⚡ Latency                                                                 │
│     State write: ${getAvgLatency(summary.results.latency, 'State Write').toFixed(2)}ms                                              │
│     State read: ${getAvgLatency(summary.results.latency, 'State Read').toFixed(2)}ms                                                │
│     Checkpoint: ${getAvgLatency(summary.results.latency, 'Checkpoint').toFixed(2)}ms                                               │
│                                                                             │
│  💾 Memory Savings                                                          │
│     Average reduction: ${getAverageMemoryReduction(summary.results.memory).toFixed(1)}%                                            │
│                                                                             │
│  💰 Cost Savings (Claude Sonnet)                                            │
│     Monthly: $${getMonthlySavings(summary.results.costSavings).toFixed(2)}                                                        │
│     Yearly: $${getYearlySavings(summary.results.costSavings).toFixed(2)}                                                           │
│                                                                             │
│  🔄 Failure Recovery                                                        │
│     Average speedup: ${getAvgSpeedup(summary.results.failureRecovery).toFixed(1)}x                                                │
│     Work saved: ${getAvgWorkSaved(summary.results.failureRecovery).toFixed(0)}%                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Total benchmark time: ${(totalTime / 1000).toFixed(1)}s
`);

  // Save results to file
  const fs = await import('fs');
  const resultsPath = './benchmark-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
  console.log(`Results saved to: ${resultsPath}\n`);

  // Exit
  await (await import('../packages/sdk-typescript/dist/index.js')).ContextRouter.local().then(r => r.close()).catch(() => {});
}

// Helper functions
function getAverageTokenReduction(results: { reductionPercent: number }[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.reductionPercent, 0) / results.length;
}

function getMaxTokenReduction(results: { reductionPercent: number }[]): number {
  return Math.max(...results.map(r => r.reductionPercent), 0);
}

function getAvgLatency(results: { operation: string; avgMs: number }[], op: string): number {
  const filtered = results.filter(r => r.operation.includes(op));
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, r) => sum + r.avgMs, 0) / filtered.length;
}

function getAverageMemoryReduction(results: { ratio: number }[]): number {
  if (results.length === 0) return 0;
  const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
  return (1 - avgRatio) * 100;
}

function getMonthlySavings(results: { monthlySavings: number }[]): number {
  return results.reduce((sum, r) => sum + r.monthlySavings, 0);
}

function getYearlySavings(results: { yearlySavings: number }[]): number {
  return results.reduce((sum, r) => sum + r.yearlySavings, 0);
}

function getAvgSpeedup(results: { speedupFactor: number }[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.speedupFactor, 0) / results.length;
}

function getAvgWorkSaved(results: { workSavedPercent: number }[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.workSavedPercent, 0) / results.length;
}

main().catch(console.error);
