/**
 * Content Generation Pipeline Example
 *
 * A realistic marketing content workflow showing:
 * - Research → Outline → Draft → Review → Publish stages
 * - Schema-defined content structure
 * - State snapshots at each milestone
 * - Handoff summaries for human review
 */

import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

// Simulated content generation agents
async function researchTopic(topic: string) {
  return {
    topic,
    searchResults: [
      { title: 'Article 1', relevance: 0.9 },
      { title: 'Article 2', relevance: 0.85 },
      { title: 'Article 3', relevance: 0.7 },
    ],
    keyStats: ['72% of users prefer video', '42% conversion increase'],
    competitors: ['Competitor A', 'Competitor B'],
  };
}

async function createOutline(research: any, targetPlatform: string) {
  const outlineItems = [
    'Hook - attention grabbing opener',
    'Problem statement - why it matters',
    'Main content - key points from research',
    'Call to action',
  ];

  return {
    sections: outlineItems,
    targetPlatform,
    estimatedLength: targetPlatform === 'LinkedIn' ? '1500 words' : '800 words',
    tone: 'professional',
  };
}

async function writeContent(outline: any, research: any) {
  return {
    title: `The Ultimate Guide to ${research.topic}`,
    body: `
# ${research.topic}

## Hook
Did you know that ${research.keyStats[0]}?

## Problem
Many teams struggle with...

## Solution
Based on our research:
${outline.sections.map((s: string) => `- ${s}`).join('\n')}

## Conclusion
Start implementing today.
    `.trim(),
    wordCount: outline.targetPlatform === 'LinkedIn' ? 1450 : 780,
    includesImages: true,
    suggestedTags: [research.topic, 'guide', 'tutorial'],
  };
}

async function generateSocialVariants(content: any, platforms: string[]) {
  return platforms.map((platform) => {
    const truncated = content.body.substring(0, 200) + '...';
    return {
      platform,
      text: platform === 'Twitter'
        ? `${content.title.substring(0, 200)} ${truncated}`
        : `${content.title}\n\n${truncated}`,
      hashtags: content.suggestedTags.map((t: string) => `#${t.replace(/\s+/g, '')}`),
      characterCount: platform === 'Twitter' ? 280 : 2000,
    };
  });
}

async function main() {
  const router = await ContextRouter.local();

  try {
    const flow = await router.start('Content Pipeline');

    // Define content schema
    const contentSchema = {
      type: 'object' as const,
      fields: {
        title: { type: 'string', required: true },
        body: { type: 'string', required: true },
        wordCount: { type: 'number', required: true },
        targetAudience: { type: 'string', required: true },
      },
    };

    // Stage 1: Research
    console.log('[Stage 1] Researching topic...');
    const research = await researchTopic('AI Workflow Automation');
    await flow.set('research', research);
    await flow.checkpoint('research-complete');
    console.log(`  Found ${research.searchResults.length} relevant sources`);

    // Stage 2: Create Outline
    console.log('[Stage 2] Creating outline...');
    const outline = await createOutline(research, 'LinkedIn');
    await flow.set('outline', outline);
    await flow.checkpoint('outline-approved');
    console.log(`  ${outline.sections.length} sections planned`);

    // Stage 3: Write Content
    console.log('[Stage 3] Writing content...');
    const content = await writeContent(outline, research);
    await flow.set('mainContent', content);
    await flow.checkpoint('draft-complete');
    console.log(`  Draft: ${content.wordCount} words`);

    // Stage 4: Generate Social Variants
    console.log('[Stage 4] Creating social variants...');
    const socialVariants = await generateSocialVariants(content, ['Twitter', 'LinkedIn', 'Instagram']);
    // Wrap array in object since state values must be objects
    await flow.set('socialVariants', { items: socialVariants });
    console.log(`  Created ${socialVariants.length} variants`);

    // Stage 5: Handoff for Review
    const handoff = await flow.handoff({
      keys: ['mainContent'],
      maxTokens: 500,
    });
    console.log(`\n[Handoff Summary]\n${handoff.summary}`);

    // Mark as ready for review
    await flow.set('status', 'READY_FOR_REVIEW');

    await flow.complete();

    console.log('\n📄 Pipeline Complete:');
    console.log(`  - Main article: ${content.wordCount} words`);
    console.log(`  - Social variants: ${socialVariants.length}`);
    console.log(`  - Status: READY_FOR_REVIEW`);
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
