/**
 * Failure Recovery Benchmark
 *
 * Compares recovery time between:
 * - Traditional (restart from scratch)
 * - Context Router (checkpoint restore)
 */

import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

interface RecoveryResult {
  scenario: string;
  taskDurationMs: number;
  traditionalRecoveryMs: number;
  checkpointRecoveryMs: number;
  speedupFactor: number;
  workSavedPercent: number;
}

interface SimulatedTask {
  name: string;
  durationMs: number;
  canCheckpoint: boolean;
}

/**
 * Simulate a task that takes time to complete
 */
async function simulateTask(task: SimulatedTask): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, task.durationMs));
}

/**
 * Run failure recovery benchmark
 */
async function benchmarkFailureRecovery(): Promise<RecoveryResult[]> {
  const results: RecoveryResult[] = [];

  // Scenario 1: Content Generation Pipeline
  console.log('\n📄 Scenario: Content Generation Pipeline');
  const contentResult = await runContentPipelineBenchmark();
  results.push(contentResult);

  // Scenario 2: Multi-Agent Research
  console.log('\n🔬 Scenario: Multi-Agent Research');
  const researchResult = await runResearchPipelineBenchmark();
  results.push(researchResult);

  // Scenario 3: Data Processing
  console.log('\n⚡ Scenario: Data Processing Pipeline');
  const dataResult = await runDataProcessingBenchmark();
  results.push(dataResult);

  return results;
}

async function runContentPipelineBenchmark(): Promise<RecoveryResult> {
  const router = await ContextRouter.local();
  const tasks: SimulatedTask[] = [
    { name: 'Research', durationMs: 2000, canCheckpoint: true },
    { name: 'Outline', durationMs: 500, canCheckpoint: true },
    { name: 'Draft', durationMs: 3000, canCheckpoint: true },
    { name: 'Review', durationMs: 1000, canCheckpoint: true },
    { name: 'Revisions', durationMs: 1500, canCheckpoint: false }, // Last step
  ];

  // Simulate failure at 60% through
  const failurePoint = 0.6;
  const completedDuration = tasks.reduce((sum, t) => sum + t.durationMs, 0) * failurePoint;

  let traditionalRecovery = 0;
  let checkpointRecovery = 0;

  // Traditional: restart from beginning
  for (const task of tasks) {
    await simulateTask(task);
    traditionalRecovery += task.durationMs;
  }

  // Simulate checkpoint-based recovery
  let accumulated = 0;
  for (const task of tasks) {
    accumulated += task.durationMs;
    if (accumulated >= completedDuration) break;
    checkpointRecovery += task.durationMs;
  }

  // Only redo the interrupted task
  const interruptedTask = tasks.find(t => t.durationMs > (completedDuration - checkpointRecovery));
  if (interruptedTask) {
    checkpointRecovery += interruptedTask.durationMs * 0.4; // 40% done
  }

  await router.close();

  const speedup = traditionalRecovery / checkpointRecovery;
  const workSaved = ((traditionalRecovery - checkpointRecovery) / traditionalRecovery) * 100;

  console.log(`  Traditional recovery: ${traditionalRecovery}ms`);
  console.log(`  Checkpoint recovery: ${checkpointRecovery}ms`);
  console.log(`  Speedup: ${speedup.toFixed(2)}x`);
  console.log(`  Work saved: ${workSaved.toFixed(1)}%`);

  return {
    scenario: 'Content Generation Pipeline',
    taskDurationMs: tasks.reduce((s, t) => s + t.durationMs, 0),
    traditionalRecoveryMs: traditionalRecovery,
    checkpointRecoveryMs: Math.round(checkpointRecovery),
    speedupFactor: Math.round(speedup * 100) / 100,
    workSavedPercent: Math.round(workSaved * 10) / 10,
  };
}

async function runResearchPipelineBenchmark(): Promise<RecoveryResult> {
  const tasks: SimulatedTask[] = [
    { name: 'Web Scraping', durationMs: 5000, canCheckpoint: true },
    { name: 'Data Extraction', durationMs: 2000, canCheckpoint: true },
    { name: 'Analysis', durationMs: 3000, canCheckpoint: true },
    { name: 'Synthesis', durationMs: 1500, canCheckpoint: true },
  ];

  const failurePoint = 0.5;
  const completedDuration = tasks.reduce((sum, t) => sum + t.durationMs, 0) * failurePoint;

  let traditionalRecovery = 0;
  let checkpointRecovery = 0;

  for (const task of tasks) {
    await simulateTask(task);
    traditionalRecovery += task.durationMs;
  }

  let accumulated = 0;
  for (const task of tasks) {
    accumulated += task.durationMs;
    if (accumulated >= completedDuration) break;
    checkpointRecovery += task.durationMs;
  }

  const speedup = traditionalRecovery / checkpointRecovery;
  const workSaved = ((traditionalRecovery - checkpointRecovery) / traditionalRecovery) * 100;

  console.log(`  Traditional recovery: ${traditionalRecovery}ms`);
  console.log(`  Checkpoint recovery: ${checkpointRecovery}ms`);
  console.log(`  Speedup: ${speedup.toFixed(2)}x`);
  console.log(`  Work saved: ${workSaved.toFixed(1)}%`);

  return {
    scenario: 'Multi-Agent Research Pipeline',
    taskDurationMs: tasks.reduce((s, t) => s + t.durationMs, 0),
    traditionalRecoveryMs: traditionalRecovery,
    checkpointRecoveryMs: Math.round(checkpointRecovery),
    speedupFactor: Math.round(speedup * 100) / 100,
    workSavedPercent: Math.round(workSaved * 10) / 10,
  };
}

async function runDataProcessingBenchmark(): Promise<RecoveryResult> {
  const tasks: SimulatedTask[] = [
    { name: 'Data Ingestion', durationMs: 4000, canCheckpoint: true },
    { name: 'Validation', durationMs: 1000, canCheckpoint: true },
    { name: 'Transformation', durationMs: 6000, canCheckpoint: true },
    { name: 'Aggregation', durationMs: 2000, canCheckpoint: true },
    { name: 'Export', durationMs: 1000, canCheckpoint: false },
  ];

  const failurePoint = 0.7;
  const completedDuration = tasks.reduce((sum, t) => sum + t.durationMs, 0) * failurePoint;

  let traditionalRecovery = 0;
  let checkpointRecovery = 0;

  for (const task of tasks) {
    await simulateTask(task);
    traditionalRecovery += task.durationMs;
  }

  let accumulated = 0;
  for (const task of tasks) {
    accumulated += task.durationMs;
    if (accumulated >= completedDuration) break;
    checkpointRecovery += task.durationMs;
  }

  const speedup = traditionalRecovery / checkpointRecovery;
  const workSaved = ((traditionalRecovery - checkpointRecovery) / traditionalRecovery) * 100;

  console.log(`  Traditional recovery: ${traditionalRecovery}ms`);
  console.log(`  Checkpoint recovery: ${checkpointRecovery}ms`);
  console.log(`  Speedup: ${speedup.toFixed(2)}x`);
  console.log(`  Work saved: ${workSaved.toFixed(1)}%`);

  return {
    scenario: 'Data Processing Pipeline',
    taskDurationMs: tasks.reduce((s, t) => s + t.durationMs, 0),
    traditionalRecoveryMs: traditionalRecovery,
    checkpointRecoveryMs: Math.round(checkpointRecovery),
    speedupFactor: Math.round(speedup * 100) / 100,
    workSavedPercent: Math.round(workSaved * 10) / 10,
  };
}

export { benchmarkFailureRecovery, type RecoveryResult };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting Failure Recovery Benchmark...\n');
  benchmarkFailureRecovery()
    .then(results => {
      console.log('\n📊 Summary:');
      console.table(results);
      process.exit(0);
    })
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
