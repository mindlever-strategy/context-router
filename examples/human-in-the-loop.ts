/**
 * Human-in-the-Loop Workflow Example
 *
 * Demonstrates:
 * - Approval checkpoints that pause for human review
 * - State inspection before proceeding
 * - Revision loops when human rejects
 * - Audit trail of human decisions
 */

import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

interface HumanDecision {
  approved: boolean;
  feedback: string;
  timestamp: string;
  reviewer: string;
}

// Simulated human review function (in production, this would be an API call)
async function requestHumanReview(state: any, prompt: string): Promise<HumanDecision> {
  console.log(`\n[Human Review] Requesting approval for: ${prompt}`);
  console.log('[Human Review] Current state:', JSON.stringify(state, null, 2));

  // Simulate human decision - in production this would be an actual API call
  const autoApprove = process.env.AUTO_APPROVE === 'true';
  return {
    approved: autoApprove || Math.random() > 0.3, // 70% approval rate
    feedback: autoApprove
      ? 'Auto-approved'
      : Math.random() > 0.5
        ? 'Looks good, proceed'
        : 'Please add more details about the target audience',
    timestamp: new Date().toISOString(),
    reviewer: 'human-reviewer',
  };
}

async function generateDraft(topic: string) {
  return {
    title: `Draft: ${topic}`,
    content: `Initial content about ${topic}...`,
    targetAudience: 'developers',
    estimatedReadTime: '5 min',
  };
}

async function improveDraft(current: any, feedback: string) {
  return {
    ...current,
    content: `${current.content}\n\n[Based on feedback]: ${feedback}`,
    revisionsCount: (current.revisionsCount || 0) + 1,
  };
}

async function main() {
  const router = await ContextRouter.local();

  try {
    const flow = await router.start('Human-in-the-Loop Review');
    const maxRevisions = 3;

    // Step 1: Generate initial content
    await flow.set('revisionCount', 0);
    const draft = await generateDraft('Context Router Benefits');
    await flow.set('draft', draft);
    console.log('[Writer] Initial draft created');

    // Step 2: Human review loop with up to 3 revisions
    await flow.checkpoint('draft-created');
    let draftValue = (await flow.get('draft')).value;
    const allReviews: any[] = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      const decision = await requestHumanReview(draftValue, `Review attempt ${attempt}`);
      await flow.set(`review${attempt}`, decision);
      allReviews.push(decision);

      if (decision.approved) {
        console.log(`[Writer] Draft approved on attempt ${attempt}`);
        break;
      }

      console.log('[Writer] Revision requested: ' + decision.feedback);
      draftValue = await improveDraft(draftValue, decision.feedback);
      await flow.set('draft', draftValue);
      await flow.checkpoint(`revision-${attempt}`);
    }

    const finalApproved = allReviews[allReviews.length - 1]?.approved;

    // Wrap array in object for state storage
    await flow.set('finalDecision', {
      approved: finalApproved,
      revisionCount: allReviews.length - 1,
      auditTrail: { reviews: allReviews },
    });

    await flow.complete();

    console.log('\n📋 Audit Trail:');
    allReviews.forEach((r, i) => {
      console.log(`  Review ${i + 1}: ${r.approved ? '✅' : '❌'} - ${r.feedback}`);
    });
    console.log(`\n${finalApproved ? '✅' : '❌'} Final: Content ${finalApproved ? 'approved' : 'needs more work'}`);
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
