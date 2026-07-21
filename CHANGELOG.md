# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and
Semantic Versioning.

## [Unreleased]

## [0.3.1] - 2026-07-21

### Added

- Workflow pattern guides under `docs/workflows/`
- Python SDK v0.4.0 with MCP stdio transport and TypeScript API parity
- `UNVALIDATED_STATE` warning on schema-less `state_write` responses

### Fixed

- Example runner uses `node --experimental-strip-types` (top-level await compatible)
- Example runner fails fast when the SDK is not built
- Retry-recovery example uses deterministic failure sequence for demos
- SQLite `foreign_keys` and `busy_timeout` applied on the live Prisma connection
- Lazy database initialization via `connectDatabase()` (no top-level await on import)
- Cursor setup docs lead with zero-config `npx @context-router/mcp-server`
- Python SDK connect cleans up partial startup failures
- Removed stale experimental Python SDK files under `packages/sdk-python/src/`
- `UNVALIDATED_STATE` stderr logging is opt-in via `CONTEXT_ROUTER_LOG_UNVALIDATED_STATE=true`

### Changed

- README adds Start Here workflow pattern table
- Adoptability and retrospective docs aligned with actual implementation status
- Python SDK `WorkflowSession.set()` returns the written `StateValue`
- CI runs Python SDK integration tests on Ubuntu

## [0.3.0] - 2026-07-21

### Added

- Zero-configuration SQLite storage with transactional packaged migrations
- `ContextRouter.local()` and workflow-scoped TypeScript SDK sessions
- Named workspace get-or-create and owner-scoped router status tools
- SDK-provided `context-router doctor` and `context-router status` commands
- Node.js 20, 22, and 24 compatibility target

### Changed

- SQLite is now the default local store; PostgreSQL remains an explicit option
- MCP tool surface expanded from 27 to 29 tools
- Quickstart no longer requires Docker, environment files, or manual migrations

## [0.2.0] - 2026-07-20

### Added

- Compare-and-set state writes via `expectedVersion`
- Idempotent step execution tools with auto-checkpoints
- Semantic schema `requires` rules
- Agent role ACLs for selective reads and writes
- Optional provenance envelopes on state writes
- Structured, role-aware handoff packets
- Cursor setup documentation and MCP config example

### Changed

- MCP tool surface expanded from 22 to 27 tools
- TypeScript SDK extended for steps, roles, CAS, and structured handoffs

## [0.1.0] - 2026-07-19

### Added

- Local PostgreSQL-backed MCP server with 22 tools
- Workspace-scoped schemas, workflows, state, checkpoints, and handoffs
- Transactional checkpoint restoration
- TypeScript SDK with explicit workflow identifiers
- Open-source documentation, CI, security policy, and release automation

[Unreleased]: https://github.com/mindlever-strategy/context-router/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/mindlever-strategy/context-router/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mindlever-strategy/context-router/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mindlever-strategy/context-router/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mindlever-strategy/context-router/releases/tag/v0.1.0
