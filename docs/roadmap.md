# Roadmap

## v0.1

- Trusted local stdio MCP server
- PostgreSQL storage
- TypeScript SDK
- Schemas, explicit workflows, state, checkpoints, and handoffs

## v0.2

- Compare-and-set state updates (`expectedVersion`)
- Idempotent step executions (`step_run_start` / `complete` / `fail`)
- Semantic schema rules (`requires`)
- Agent roles with read/write ACLs
- Optional provenance envelopes on state writes
- Structured, role-aware handoff packets
- Cursor setup docs and example workflow

## v0.3

- SQLite default with automatic local migrations
- Node.js 20+ support
- Workflow-scoped TypeScript SDK and packaged local server startup
- Named workspace get-or-create
- Router status plus `doctor` and `status` CLI commands
- One runnable simple-pipeline quickstart

## v0.4

- Python SDK in the monorepo (`packages/sdk-python`), published to PyPI as
  `ctxrouter`
- Additional first-class workflow examples and `docs/workflows/` guides
- LangGraph and CrewAI adapters
- Improved error messages with actionable suggestions
- Flexible state storage (arrays, nested objects)
- Workflow debugger (`debugger_inspect`)

## v0.5

- AutoGen adapter
- Coordinated 0.5.0 npm publish across the server, SDK, and adapters

## v0.6

The Python SDK is published at 0.6.0. The npm 0.6.0 release is pending.

- Event journal with entries, replay, stats, and export views
- AI-assisted handoff summaries (`handoff_generate_ai`)
- LlamaIndex adapter
- Batch state reads and writes, state TTL, schema migration, and state diff
- State-integrity fixes: owner isolation, atomic batches, atomic compare-and-set
- MCP tool surface consolidated from 49 to 37 tools

## Candidates not yet started

- Checkpoint compaction

## Later evaluation

Automatic SQLite-to-PostgreSQL migration, remote MCP transport,
authentication, hosted multi-tenancy, observability,
Redis, billing, and managed deployment require separate threat models and
product decisions. They are not existing features.
