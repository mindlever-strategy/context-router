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

## Candidate v0.4 work

- [x] Functional Python SDK in monorepo (`packages/sdk-python`, v0.4.0)
- [ ] Python SDK published to PyPI
- [x] Additional first-class workflow examples and `docs/workflows/` guides
- [x] LangGraph adapter (`packages/langgraph-adapter`)
- [x] Improved error messages with actionable suggestions
- [x] Flexible state storage (arrays, nested objects)
- Visual workflow debugger evaluation
- CrewAI adapter evaluation
- Event journal and checkpoint compaction
- AI-assisted handoff summaries (optional)

## Later evaluation

Automatic SQLite-to-PostgreSQL migration, remote MCP transport,
authentication, hosted multi-tenancy, observability,
Redis, billing, and managed deployment require separate threat models and
product decisions. They are not existing features.
