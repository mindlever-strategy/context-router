# Simple Pipeline Workflow

**When to use:** A linear sequence of agents where each step builds on the last.

```text
Agent A (research) → handoff → Agent B (draft) → checkpoint → complete
```

## Pattern

1. Start a workflow-scoped session with `router.start(workspaceName)`.
2. Write the first agent's output with `flow.set(key, value)`.
3. Generate a bounded handoff with `flow.handoff({ keys: [...] })`.
4. Pass only the handoff summary to the next agent (not full chat history).
5. Checkpoint before risky steps, then `flow.complete()`.

Schemas are optional on first use. Omit `schemaName` to write unvalidated state;
add schemas later when you want enforced contracts.

## SDK calls used

- `ContextRouter.local()` / `router.start()`
- `WorkflowSession.set`, `handoff`, `checkpoint`, `get`, `complete`
- Under the hood: `workspace_ensure`, `workflow_create`, `state_write`, `handoff_generate`

## Runnable example

[examples/simple-pipeline.ts](../../examples/simple-pipeline.ts)

```bash
npm run build
node scripts/run-example.mjs simple-pipeline
```

## MCP-only equivalent

```text
workspace_ensure → workflow_create → state_write → handoff_generate → workflow_complete
```
