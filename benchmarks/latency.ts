/**
 * Latency Benchmark
 *
 * Measures the overhead of Context Router operations
 * compared to in-memory state management.
 */

interface LatencyResult {
  operation: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

type LatencyCallback = () => Promise<void> | void;

/**
 * Run a benchmark and collect latency statistics
 */
async function benchmark(
  name: string,
  fn: LatencyCallback,
  iterations: number = 1000
): Promise<LatencyResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);

  return {
    operation: name,
    iterations,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    p99Ms: percentile(times, 99),
    minMs: times[0],
    maxMs: times[times.length - 1],
  };
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * In-memory state store (baseline comparison)
 */
class InMemoryState {
  private state: Map<string, unknown> = new Map();

  async set(key: string, value: unknown): Promise<void> {
    this.state.set(key, JSON.parse(JSON.stringify(value)));
  }

  async get(key: string): Promise<unknown | null> {
    const value = this.state.get(key);
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = this.state.get(key);
      if (value) result[key] = JSON.parse(JSON.stringify(value));
    }
    return result;
  }

  async delete(key: string): Promise<void> {
    this.state.delete(key);
  }

  clear(): void {
    this.state.clear();
  }
}

/**
 * Context Router workflow simulation (with actual Context Router)
 */
async function benchmarkContextRouterWorkflow(): Promise<{
  stateOps: LatencyResult[];
  totalWorkflowMs: number;
}> {
  const { ContextRouter } = await import('../packages/sdk-typescript/dist/index.js');

  const router = await ContextRouter.local();
  const flow = await router.start('latency-benchmark');

  const stateOps: LatencyResult[] = [];

  // Benchmark state write
  const writeTimes: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await flow.set(`key_${i}`, {
      data: `value_${i}`,
      nested: { deep: Math.random() },
      array: [1, 2, 3],
    });
    writeTimes.push(performance.now() - start);
  }
  writeTimes.sort((a, b) => a - b);
  stateOps.push({
    operation: 'state_write (Context Router)',
    iterations: 100,
    avgMs: writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length,
    p50Ms: percentile(writeTimes, 50),
    p95Ms: percentile(writeTimes, 95),
    p99Ms: percentile(writeTimes, 99),
    minMs: writeTimes[0],
    maxMs: writeTimes[writeTimes.length - 1],
  });

  // Benchmark state read
  const readTimes: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await flow.get(`key_${i}`);
    readTimes.push(performance.now() - start);
  }
  readTimes.sort((a, b) => a - b);
  stateOps.push({
    operation: 'state_read (Context Router)',
    iterations: 100,
    avgMs: readTimes.reduce((a, b) => a + b, 0) / readTimes.length,
    p50Ms: percentile(readTimes, 50),
    p95Ms: percentile(readTimes, 95),
    p99Ms: percentile(readTimes, 99),
    minMs: readTimes[0],
    maxMs: readTimes[readTimes.length - 1],
  });

  // Benchmark checkpoint
  const checkpointTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await flow.checkpoint(`checkpoint_${i}`);
    checkpointTimes.push(performance.now() - start);
  }
  checkpointTimes.sort((a, b) => a - b);
  stateOps.push({
    operation: 'checkpoint_create (Context Router)',
    iterations: 20,
    avgMs: checkpointTimes.reduce((a, b) => a + b, 0) / checkpointTimes.length,
    p50Ms: percentile(checkpointTimes, 50),
    p95Ms: percentile(checkpointTimes, 95),
    p99Ms: percentile(checkpointTimes, 99),
    minMs: checkpointTimes[0],
    maxMs: checkpointTimes[checkpointTimes[checkpointTimes.length - 1]],
  });

  // Benchmark handoff
  const handoffTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await flow.handoff({ keys: [`key_${i % 10}`], maxTokens: 100 });
    handoffTimes.push(performance.now() - start);
  }
  handoffTimes.sort((a, b) => a - b);
  stateOps.push({
    operation: 'handoff_generate (Context Router)',
    iterations: 20,
    avgMs: handoffTimes.reduce((a, b) => a + b, 0) / handoffTimes.length,
    p50Ms: percentile(handoffTimes, 50),
    p95Ms: percentile(handoffTimes, 95),
    p99Ms: percentile(handoffTimes, 99),
    minMs: handoffTimes[0],
    maxMs: handoffTimes[handoffTimes.length - 1],
  });

  const totalStart = performance.now();
  await flow.complete();
  const totalWorkflowMs = performance.now() - totalStart;

  await router.close();

  return { stateOps, totalWorkflowMs };
}

/**
 * In-memory baseline benchmark
 */
async function benchmarkInMemoryWorkflow(): Promise<{
  stateOps: LatencyResult[];
  totalWorkflowMs: number;
}> {
  const memory = new InMemoryState();

  const stateOps: LatencyResult[] = [];

  // Benchmark state write
  const writeResult = await benchmark('state_write (in-memory)', async () => {
    await memory.set(`key_${Math.random()}`, { data: 'value' });
  }, 100);
  stateOps.push(writeResult);

  // Benchmark state read
  await memory.set('test_key', { data: 'value' });
  const readResult = await benchmark('state_read (in-memory)', async () => {
    await memory.get('test_key');
  }, 100);
  stateOps.push(readResult);

  // No checkpoint in in-memory (would need serialization)
  stateOps.push({
    operation: 'checkpoint_create (in-memory)',
    iterations: 0,
    avgMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    minMs: 0,
    maxMs: 0,
  });

  // Handoff is just JSON serialization
  const handoffResult = await benchmark('handoff_generate (in-memory)', async () => {
    const state = await memory.getMany(['test_key']);
    JSON.stringify(state);
  }, 20);
  handoffResult.operation = 'handoff_generate (in-memory)';
  stateOps.push(handoffResult);

  const totalStart = performance.now();
  memory.clear();
  const totalWorkflowMs = performance.now() - totalStart;

  return { stateOps, totalWorkflowMs };
}

/**
 * Format latency result for display
 */
function formatLatencyResult(result: LatencyResult): string {
  if (result.iterations === 0) return '';

  return `
  ${result.operation}
    Avg: ${result.avgMs.toFixed(3)}ms | P50: ${result.p50Ms.toFixed(3)}ms | P95: ${result.p95Ms.toFixed(3)}ms | P99: ${result.p99Ms.toFixed(3)}ms
    Min: ${result.minMs.toFixed(3)}ms | Max: ${result.maxMs.toFixed(3)}ms`;
}

export async function runLatencyBenchmark(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('LATENCY BENCHMARK');
  console.log('='.repeat(70));
  console.log('\n⚡ Measuring operation latencies...\n');

  const [crResults, memResults] = await Promise.all([
    benchmarkContextRouterWorkflow(),
    benchmarkInMemoryWorkflow(),
  ]);

  console.log('\n📊 Context Router Operations:');
  for (const result of crResults.stateOps) {
    console.log(formatLatencyResult(result));
  }
  console.log(`  Total workflow: ${crResults.totalWorkflowMs.toFixed(2)}ms`);

  console.log('\n📊 In-Memory Operations (baseline):');
  for (const result of memResults.stateOps) {
    console.log(formatLatencyResult(result));
  }
  console.log(`  Total workflow: ${memResults.totalWorkflowMs.toFixed(2)}ms`);

  // Comparison
  console.log('\n📈 Comparison (Context Router vs In-Memory):');
  for (let i = 0; i < crResults.stateOps.length; i++) {
    const cr = crResults.stateOps[i];
    const mem = memResults.stateOps[i];
    if (mem.iterations > 0) {
      const overhead = ((cr.avgMs / mem.avgMs - 1) * 100).toFixed(1);
      console.log(`  ${cr.operation.split(' (')[0]}: ${overhead}% overhead`);
    }
  }

  console.log('\n✅ Latency benchmark complete');
}

// Run if executed directly
runLatencyBenchmark().catch(console.error);
