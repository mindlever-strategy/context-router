# @context-router/sdk

TypeScript client and zero-configuration local runtime for Context Router.

```typescript
import { ContextRouter } from '@context-router/sdk';

const router = await ContextRouter.local();
const flow = await router.start('Demo');
await flow.set('result', { ok: true });
console.log((await flow.handoff()).summary);
await flow.complete();
await router.close();
```

SQLite is created automatically in the operating system's application-data
directory. Run `context-router doctor` or `context-router status` after
installation to inspect it. The existing explicit workspace/workflow-ID API is
also available. Tool failures throw `ContextRouterError`.
