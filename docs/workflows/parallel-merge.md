# Parallel Merge Workflow

**When to use:** One agent gathers data, multiple agents analyze in parallel, then a synthesizer merges results.

```text
       → Agent B ─┐
Agent A ─┤        ├→ Agent D (synthesize)
       → Agent C ─┘
```

## Pattern

1. Gather shared input once and store with `flow.set('data', ...)`.
2. Fan out analysis with `Promise.all([...])` (or equivalent in your runtime).
3. Store each branch result under separate keys.
4. Create a checkpoint before merge (`flow.checkpoint('pre-synthesis')`).
5. Hand off only the branch keys—not the raw gather output—via `flow.handoff({ keys: [...] })`.
6. Write synthesis output and complete.

## SDK calls used

- `WorkflowSession.set`, `get`, `checkpoint`, `handoff`, `complete`
- Parallel agent calls happen in your application code; Context Router stores and hands off state

## Runnable example

[examples/parallel-merge.ts](../../examples/parallel-merge.ts)

```bash
npm run build
node scripts/run-example.mjs parallel-merge
```

## MCP-only equivalent

```text
state_write (data) → state_write (analysisA/B/C) → checkpoint_create → handoff_generate → workflow_complete
```
