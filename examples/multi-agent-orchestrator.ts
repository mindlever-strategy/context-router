/**
 * Multi-Agent Orchestrator Example
 *
 * Demonstrates a complex workflow with:
 * - A coordinator agent that delegates to specialist agents
 * - State passing between coordinator and specialists
 * - Conditional branching based on intermediate results
 * - Final synthesis by the coordinator
 */

import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

// Simulated specialist agents
async function dataCollectionAgent(topic: string) {
  return {
    sources: [`source-1:${topic}`, `source-2:${topic}`, `source-3:${topic}`],
    keyFacts: [
      `Fact about ${topic}: It's important`,
      `Another fact about ${topic}`,
      `Final fact about ${topic}`,
    ],
    confidence: 0.85,
  };
}

async function analysisAgent(sources: string[], facts: string[]) {
  return {
    insights: facts.map((f, i) => `Insight ${i + 1}: ${f}`),
    recommendations: [
      `Recommendation based on ${sources.length} sources`,
      'Prioritize top findings',
    ],
    riskLevel: 'MEDIUM' as const,
  };
}

async function reviewAgent(insights: string[], recommendations: string[]) {
  return {
    approved: true,
    feedback: insights.length > 2 ? 'Comprehensive analysis' : 'Needs more depth',
    revisionsNeeded: insights.length <= 2 ? ['Add more sources'] : [],
  };
}

async function synthesisAgent(
  analysis: { insights: string[]; recommendations: string[]; riskLevel: string },
  review: { approved: boolean; feedback: string }
) {
  return {
    executiveSummary: `${analysis.insights.length} key insights identified`,
    actionItems: analysis.recommendations,
    status: review.approved ? 'READY' : 'REVISION_REQUIRED',
    riskLevel: analysis.riskLevel,
  };
}

async function main() {
  const router = await ContextRouter.local();

  try {
    // Create a workflow with the orchestrator pattern
    const flow = await router.start('Multi-Agent Orchestrator');

    // Step 1: Coordinator decides topic and delegates collection
    const topic = 'AI in healthcare';
    await flow.set('task', { topic, assignedBy: 'orchestrator' });
    console.log(`[Coordinator] Assigned topic: ${topic}`);

    // Step 2: Data collection specialist works
    const collectionResult = await dataCollectionAgent(topic);
    await flow.set('collectedData', collectionResult);
    await flow.checkpoint('data-collected');
    console.log(`[Data Agent] Collected ${collectionResult.sources.length} sources`);

    // Step 3: Handoff to analysis agent (selective context)
    const handoffToAnalysis = await flow.handoff({
      keys: ['collectedData'],
      maxTokens: 200,
    });
    console.log(`[Coordinator] Handoff to Analysis: ${handoffToAnalysis.summary.substring(0, 50)}...`);

    // Step 4: Analysis specialist
    const analysisResult = await analysisAgent(
      collectionResult.sources,
      collectionResult.keyFacts
    );
    await flow.set('analysis', analysisResult);
    console.log(`[Analysis Agent] Risk level: ${analysisResult.riskLevel}`);

    // Step 5: Conditional branching - only proceed to review if confidence is high
    if (collectionResult.confidence >= 0.8) {
      await flow.set('review', await reviewAgent(analysisResult.insights, analysisResult.recommendations));
      console.log('[Review Agent] Proceeding to review');
    } else {
      await flow.set('review', { approved: false, feedback: 'Confidence too low', revisionsNeeded: ['Re-collect data'] });
      console.log('[Review Agent] Skipped due to low confidence');
    }

    // Step 6: Final synthesis
    const handoffToSynthesis = await flow.handoff({
      keys: ['analysis', 'review'],
      maxTokens: 300,
    });

    const finalResult = await synthesisAgent(analysisResult, (await flow.get('review')).value);
    await flow.set('finalOutput', finalResult);

    await flow.complete();
    console.log('\n✅ Final result:', finalResult);
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
