// In production, use: import { ContextRouter } from '@context-router/sdk';
// For local development, use the built SDK:
import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

const MAX_RETRIES = 3;

async function fetchDocument(url: string) {
  return {
    id: 'doc-123',
    content: 'Sample document content for processing',
    format: 'markdown',
  };
}

let parseAttempt = 0;

async function parseDocument(doc: any): Promise<{ parsed: any }> {
  // Deterministic: fail attempts 0 and 1, succeed on attempt 2
  const currentAttempt = parseAttempt++;
  if (currentAttempt < 2) {
    throw new Error('Parse error: unexpected format');
  }
  return { parsed: { title: doc.id, body: doc.content } };
}

async function validateDocument(parsed: any) {
  return { valid: true, document: parsed };
}

async function retryWithRecovery(
  flow: any,
  operation: () => Promise<any>,
  checkpointLabel: string,
): Promise<any> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const checkpointLabelWithAttempt = `${checkpointLabel}-attempt-${attempt}`;
      await flow.checkpoint(checkpointLabelWithAttempt);
      console.log(`Attempt ${attempt + 1}: Starting...`);

      const result = await operation();
      console.log(`Attempt ${attempt + 1}: Succeeded!`);
      return result;
    } catch (error) {
      attempt++;
      console.error(`Attempt ${attempt} failed: ${error}`);

      if (attempt >= MAX_RETRIES) {
        throw new Error(`All ${MAX_RETRIES} attempts failed`);
      }

      const restoreLabel = `${checkpointLabel}-attempt-${attempt - 1}`;
      console.log(`Restoring checkpoint: ${restoreLabel}`);

      const checkpoints = await flow.router.checkpoint.list(
        flow.workspace.id,
        flow.workflow.id,
      );
      const targetCheckpoint = checkpoints.find(
        (cp: any) => cp.label === restoreLabel,
      );

      if (targetCheckpoint) {
        await flow.router.checkpoint.restore(
          flow.workspace.id,
          targetCheckpoint.id,
        );
        console.log(`Restored state successfully`);
      } else {
        console.warn(`Checkpoint not found for restore: ${restoreLabel}`);
      }
    }
  }
}

async function main() {
  const router = await ContextRouter.local();

  try {
    const flow = await router.start('Document processing');

    const doc = await fetchDocument('https://example.com/report');
    await flow.set('document', doc);
    console.log('Document fetched:', doc.id);

    console.log('Starting parse with retry logic...');
    const parsed = await retryWithRecovery(
      flow,
      () => parseDocument(doc),
      'parse',
    );

    await flow.set('parsed', parsed);
    console.log('Document parsed successfully');

    const validated = await validateDocument(parsed.parsed);
    await flow.set('validated', validated);

    await flow.complete();
    console.log('\n✓ Document processed successfully');
  } finally {
    await router.close();
  }
}

main().catch((error) => {
  console.error('\n✗ Processing failed:', error);
  process.exitCode = 1;
});
