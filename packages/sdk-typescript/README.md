# @context-router/sdk

TypeScript client for `@context-router/mcp-server`.

```typescript
import { ContextRouter } from '@context-router/sdk';

const router = new ContextRouter();
await router.connect('npx', ['-y', '@context-router/mcp-server'], {
  DATABASE_URL: process.env.DATABASE_URL!,
});

const workspace = await router.workspace.create('Demo');
const workflow = await router.workflow.create(workspace.id);
await router.state.write(workspace.id, workflow.id, 'result', { ok: true });
await router.disconnect();
```

Every state, checkpoint, handoff, and workflow call uses explicit workspace and
workflow identifiers. Tool failures throw `ContextRouterError`.
