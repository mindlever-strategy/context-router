/**
 * LangGraph + Context Router Integration Example
 *
 * This example demonstrates how to use Context Router as a checkpointer
 * for LangGraph workflows, enabling:
 * - Persistent state across process restarts
 * - Selective context reads between nodes (handoffs)
 * - Multi-tenant workspace isolation
 * - Audit trail via checkpoints
 */

import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

// Note: In production, install langgraph-sdk and use the adapter
// import { createContextRouterChecker } from '@context-router/langgraph-adapter';

/**
 * Simulated LangGraph-style state
 */
interface GraphState {
  topic: string;
  research: { sources: string[]; findings: string[] } | null;
  outline: string[] | null;
  draft: string | null;
  review: { approved: boolean; feedback: string } | null;
}

/**
 * Simulated LangGraph nodes
 */
async function researchNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log('[Research] Gathering information about:', state.topic);

  const research = {
    sources: [`source-1:${state.topic}`, `source-2:${state.topic}`],
    findings: [
      `Finding 1 about ${state.topic}`,
      `Finding 2 about ${state.topic}`,
      `Finding 3 about ${state.topic}`,
    ],
  };

  return { research };
}

async function outlineNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log('[Outline] Creating outline from research');

  if (!state.research) {
    throw new Error('Research must be completed first');
  }

  const outline = [
    `Introduction to ${state.topic}`,
    ...state.research.findings.map((f, i) => `Section ${i + 1}: ${f}`),
    'Conclusion',
  ];

  return { outline };
}

async function draftNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log('[Draft] Writing content from outline');

  if (!state.outline) {
    throw new Error('Outline must be completed first');
  }

  const draft = state.outline.map((s) => `## ${s}\n\nContent for ${s}...`).join('\n\n');

  return { draft };
}

async function reviewNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log('[Review] Evaluating draft quality');

  const approved = state.draft && state.draft.length > 100;
  const review = {
    approved: approved ?? false,
    feedback: approved
      ? 'Draft meets quality standards'
      : 'Draft too short, needs more content',
  };

  return { review };
}

/**
 * Main workflow using Context Router for state persistence
 */
async function main() {
  console.log('Starting LangGraph + Context Router workflow...\n');

  const router = await ContextRouter.local();

  try {
    // Create a workflow session (replaces LangGraph's checkpointer)
    const flow = await router.start('langgraph-workflow');

    // Initialize state
    let state: GraphState = {
      topic: 'Context Router Benefits',
      research: null,
      outline: null,
      draft: null,
      review: null,
    };

    // Persist initial state
    await flow.set('graph_state', state);
    console.log('Initial state saved\n');

    // Node 1: Research
    const researchResult = await researchNode(state);
    state = { ...state, ...researchResult };
    await flow.set('graph_state', state);
    await flow.set('research', researchResult);
    await flow.checkpoint('research-completed');
    console.log('Research checkpoint saved\n');

    // Simulate selective handoff (LangGraph inter-node communication)
    const handoff = await flow.handoff({
      keys: ['research'],
      maxTokens: 200,
    });
    console.log('[Handoff] To outline node:', handoff.summary.substring(0, 80) + '...\n');

    // Node 2: Outline
    const outlineResult = await outlineNode(state);
    state = { ...state, ...outlineResult };
    await flow.set('graph_state', state);
    await flow.set('outline', outlineResult);
    await flow.checkpoint('outline-completed');
    console.log('Outline checkpoint saved\n');

    // Handoff for draft node
    const handoff2 = await flow.handoff({
      keys: ['outline'],
      maxTokens: 200,
    });
    console.log('[Handoff] To draft node:', handoff2.summary.substring(0, 80) + '...\n');

    // Node 3: Draft
    const draftResult = await draftNode(state);
    state = { ...state, ...draftResult };
    await flow.set('graph_state', state);
    await flow.set('draft', draftResult);
    await flow.checkpoint('draft-completed');
    console.log('Draft checkpoint saved\n');

    // Handoff for review node
    const handoff3 = await flow.handoff({
      keys: ['draft'],
      maxTokens: 200,
    });
    console.log('[Handoff] To review node:', handoff3.summary.substring(0, 80) + '...\n');

    // Node 4: Review
    const reviewResult = await reviewNode(state);
    state = { ...state, ...reviewResult };
    await flow.set('graph_state', state);
    await flow.set('review', reviewResult);
    await flow.checkpoint('review-completed');
    console.log('Review checkpoint saved\n');

    // List all checkpoints
    const checkpoints = await router.checkpoint.list(flow.workspace.id, flow.workflow.id);
    console.log('📋 Checkpoints created:', checkpoints.length);
    checkpoints.forEach((cp: any, i: number) => {
      console.log(`  ${i + 1}. ${cp.label} (${new Date(cp.createdAt).toLocaleTimeString()})`);
    });

    await flow.complete();

    // Final state summary
    console.log('\n✅ Workflow Complete!');
    console.log('Final state:', {
      topic: state.topic,
      researchSources: state.research?.sources.length ?? 0,
      outlineSections: state.outline?.length ?? 0,
      draftLength: state.draft?.length ?? 0,
      approved: state.review?.approved ?? false,
    });
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
