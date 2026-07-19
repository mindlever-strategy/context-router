import { ContextRouter } from '@context-router/sdk';

const router = new ContextRouter();

await router.connect('node', ['packages/server/dist/index.js'], {
  DATABASE_URL: process.env.DATABASE_URL!,
  CONTEXT_ROUTER_OWNER_ID: 'example',
});

try {
  const workspace = await router.workspace.create('Lead qualification demo');
  await router.schema.create(workspace.id, 'Lead', {
    companyName: { type: 'string', required: true },
    domain: { type: 'string', required: true },
    status: {
      type: 'enum',
      values: ['PENDING', 'CONFIRMED', 'REJECTED'],
      required: true,
    },
  });

  const workflow = await router.workflow.create(workspace.id);
  await router.state.write(
    workspace.id,
    workflow.id,
    'lead',
    {
      companyName: 'Acme Corp',
      domain: 'acme.example',
      status: 'CONFIRMED',
    },
    'Lead',
  );
  await router.state.write(workspace.id, workflow.id, 'score', { value: 92 });

  const checkpoint = (await router.checkpoint.create(
    workspace.id,
    workflow.id,
    { label: 'validated-lead' },
  )) as { id: string };

  const selected = await router.state.readMany(workspace.id, workflow.id, [
    'lead',
  ]);
  const handoff = await router.handoff.generate(workspace.id, workflow.id, {
    maxTokens: 100,
  });

  console.log({ selected, handoff });

  await router.state.write(workspace.id, workflow.id, 'score', { value: 0 });
  await router.checkpoint.restore(workspace.id, checkpoint.id);
  await router.workflow.complete(workspace.id, workflow.id);
} finally {
  await router.disconnect();
}
