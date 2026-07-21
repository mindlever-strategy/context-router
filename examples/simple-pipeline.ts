// In production, use: import { ContextRouter } from '@context-router/sdk';
// For local development, use the built SDK:
import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

async function researchTopic() {
  return {
    topic: 'Context-efficient agents',
    findings: ['Share selected facts', 'Checkpoint completed work'],
  };
}

async function writeDraft(context: string) {
  return { title: 'Smaller handoffs, clearer agents', contextUsed: context };
}

async function main() {
  const router = await ContextRouter.local();

  try {
    const flow = await router.start('Simple pipeline');
    await flow.set('research', await researchTopic());

    const handoff = await flow.handoff({ keys: ['research'], maxTokens: 120 });
    await flow.set('draft', await writeDraft(handoff.summary));

    await flow.checkpoint('draft-created');
    console.log((await flow.get('draft')).value);
    await flow.complete();
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
