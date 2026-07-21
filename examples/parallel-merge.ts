// In production, use: import { ContextRouter } from '@context-router/sdk';
// For local development, use the built SDK:
import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

// Simulated agents - replace with actual AI calls in production
async function gatherData() {
  return { raw: ['item1', 'item2', 'item3', 'item4', 'item5'] };
}

async function analyzeAspectA(data: { raw: string[] }) {
  return {
    aspect: 'A',
    result: `Analysis A: Found ${data.raw.length} items, first is ${data.raw[0]}`,
  };
}

async function analyzeAspectB(data: { raw: string[] }) {
  return {
    aspect: 'B',
    result: `Analysis B: ${data.raw.filter((i) => i.includes('2')).length} items contain '2'`,
  };
}

async function analyzeAspectC(data: { raw: string[] }) {
  return {
    aspect: 'C',
    result: `Analysis C: Last item is ${data.raw[data.raw.length - 1]}`,
  };
}

async function synthesize(analysisA: any, analysisB: any, analysisC: any) {
  return {
    summary: `Combined ${3} analyses into final report`,
    conclusions: [analysisA.result, analysisB.result, analysisC.result],
    recommendation: 'All aspects analyzed, proceed to next step',
  };
}

async function main() {
  const router = await ContextRouter.local();

  try {
    const flow = await router.start('Parallel research');

    // Step 1: Gather data (one-time, not retried)
    const data = await gatherData();
    await flow.set('data', data);
    console.log('Gathered data:', data.raw);

    // Step 2: Fan out to 3 agents in parallel
    console.log('Running 3 analyses in parallel...');
    const [analysisA, analysisB, analysisC] = await Promise.all([
      analyzeAspectA(data),
      analyzeAspectB(data),
      analyzeAspectC(data),
    ]);

    // Step 3: Store all results
    await flow.set('analysisA', analysisA);
    await flow.set('analysisB', analysisB);
    await flow.set('analysisC', analysisC);

    // Step 4: Create checkpoint before synthesis
    await flow.checkpoint('pre-synthesis');

    // Step 5: Synthesize - pass only the analyses, not raw data
    const handoff = await flow.handoff({
      keys: ['analysisA', 'analysisB', 'analysisC'],
      maxTokens: 300,
    });
    console.log('Handoff summary:', handoff.summary);

    const synthesis = await synthesize(analysisA, analysisB, analysisC);
    await flow.set('synthesis', synthesis);

    await flow.complete();
    console.log('\nFinal synthesis:', synthesis);
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
