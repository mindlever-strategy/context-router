import { randomUUID } from 'node:crypto';
import { ContextRouter } from '@context-router/sdk';

const router = new ContextRouter();

await router.connect('node', ['packages/server/dist/index.js'], {
  DATABASE_URL: process.env.DATABASE_URL!,
  CONTEXT_ROUTER_OWNER_ID: 'example',
});

try {
  const workspace = await router.workspace.create('Lead qualification demo');
  await router.schema.create(
    workspace.id,
    'Lead',
    {
      companyName: { type: 'string', required: true },
      domain: { type: 'string', required: true },
      validationStatus: {
        type: 'enum',
        values: ['PENDING', 'CONFIRMED', 'REJECTED'],
        required: true,
      },
      decisionMakerEmail: { type: 'string', required: false },
    },
    [
      {
        type: 'requires',
        when: { field: 'validationStatus', eq: 'CONFIRMED' },
        fields: ['decisionMakerEmail'],
      },
    ],
  );

  await router.agentRole.create(workspace.id, 'research', ['lead'], ['lead']);
  await router.agentRole.create(workspace.id, 'validation', ['lead'], ['lead']);
  await router.agentRole.create(
    workspace.id,
    'outreach',
    ['draft*'],
    ['lead', 'draft*'],
  );

  const workflow = await router.workflow.create(workspace.id);
  const executionId = randomUUID();

  const researchStart = (await router.step.start(
    workspace.id,
    workflow.id,
    'research',
    executionId,
    'research-agent',
  )) as { cached: boolean };

  if (!researchStart.cached) {
    await router.state.write(
      workspace.id,
      workflow.id,
      'lead',
      {
        companyName: 'Acme Corp',
        domain: 'acme.example',
        validationStatus: 'PENDING',
      },
      {
        schemaName: 'Lead',
        agentRole: 'research',
        provenance: {
          agentRole: 'research',
          executionId,
          source: 'web_search',
          confidence: 0.86,
        },
      },
    );
    await router.step.complete(
      workspace.id,
      workflow.id,
      'research',
      executionId,
      {
        status: 'researched',
      },
    );
  }

  const validationExecutionId = randomUUID();
  await router.step.start(
    workspace.id,
    workflow.id,
    'validation',
    validationExecutionId,
  );
  const leadState = await router.state.read(workspace.id, workflow.id, 'lead', {
    agentRole: 'validation',
    unwrap: true,
  });
  await router.state.write(
    workspace.id,
    workflow.id,
    'lead',
    {
      ...(leadState.value as Record<string, unknown>),
      validationStatus: 'CONFIRMED',
      decisionMakerEmail: 'jane@acme.example',
    },
    {
      schemaName: 'Lead',
      agentRole: 'validation',
      expectedVersion: leadState.version,
    },
  );
  await router.step.complete(
    workspace.id,
    workflow.id,
    'validation',
    validationExecutionId,
  );

  const handoff = await router.handoff.generate(workspace.id, workflow.id, {
    keys: ['lead'],
    agentRole: 'outreach',
    format: 'structured',
    nextGoals: ['Draft a personalized outreach email'],
    maxTokens: 120,
  });

  console.log({ handoff });

  await router.workflow.complete(workspace.id, workflow.id);
} finally {
  await router.disconnect();
}
