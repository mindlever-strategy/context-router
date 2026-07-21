# Retry Recovery Workflow

**When to use:** An agent step may fail and you need to resume from a known-good checkpoint.

```text
Agent A → checkpoint → Agent B → [FAIL] → restore checkpoint → Agent B (retry) → complete
```

## Pattern

1. Perform one-time setup (fetch document, etc.) and store state.
2. Before each attempt, create a labeled checkpoint.
3. On failure, list checkpoints, restore the pre-attempt snapshot, and retry.
4. Complete the workflow after the final successful step.

The example uses a deterministic failure sequence (fail twice, succeed on third attempt) so the pattern is reproducible in demos.

## SDK calls used

- `WorkflowSession.set`, `checkpoint`, `complete`
- `router.checkpoint.list`, `router.checkpoint.restore` for recovery
- Under the hood: `checkpoint_create`, `checkpoint_list`, `checkpoint_restore`

## Runnable example

[examples/retry-recovery.ts](../../examples/retry-recovery.ts)

```bash
npm run build
node scripts/run-example.mjs retry-recovery
```

## MCP-only equivalent

```text
state_write → checkpoint_create → [attempt] → checkpoint_restore → [retry] → workflow_complete
```
