# Architecture

Context Router is a state service, not an agent runtime.

```text
MCP client or TypeScript SDK
          │ stdio
          ▼
Context Router MCP server
          │
     tool handlers
          │
 schema validation / handoff formatting
          │
     Prisma queries
          │
      PostgreSQL 16
```

## Ownership model

`CONTEXT_ROUTER_OWNER_ID` identifies the trusted local operator and defaults to
`local`. Every database query first resolves a workspace owned by that value.
Workflow, state, schema, and checkpoint identifiers are then constrained to the
resolved workspace.

This prevents accidental cross-workspace references but is not remote
authentication. The stdio process and database must remain inside a trusted
environment.

## Data model

- **Workspace:** local isolation boundary.
- **Schema:** versioned field definitions for validating state values.
- **Workflow:** one explicit run with `RUNNING`, `COMPLETED`, or `FAILED` status.
- **State:** versioned JSON object stored under a workflow key.
- **Checkpoint:** immutable full-state snapshot.

Restores run in a single database transaction: current workflow state is deleted
and the checkpoint snapshot is inserted atomically. A restore is allowed only
while the workflow is running.

## Contract

MCP calls return JSON in a text content block. Successful and failed calls use
the envelopes described in `api.md`. The TypeScript SDK unwraps successful data
and throws `ContextRouterError` for failures.
