# Context Router Handoff

Last updated: 2026-07-19

## Project objective

Release Context Router as an Apache-2.0 open-source project that provides a
trusted-local MCP server for structured multi-agent workflow state.

The `v0.1` product boundary is deliberately narrow:

- local stdio MCP transport;
- PostgreSQL 16 persistence;
- workspaces, schemas, workflows, state, checkpoints, and handoffs;
- TypeScript SDK;
- no hosted service, billing, remote authentication, or agent orchestration.

## Current state

The implementation is ready for a preview pull request and GitHub CI.

- Local branch: `main`
- Git remote: `https://github.com/mindlever-strategy/context-router.git`
- Planned server package: `@context-router/mcp-server`
- Planned SDK package: `@context-router/sdk`
- Current version: `0.1.0`
- License: Apache-2.0
- Public MCP surface: 22 tools
- Python SDK: experimental and unpublished

The README and LinkedIn launch image are ready:

- `README.md`
- `assets/context-router-linkedin.png`

## Completed work

### Repository and documentation

- Added root and package-level Apache-2.0 licenses.
- Removed the tracked runtime `.env` and added `.env.example`.
- Added `.gitignore` for secrets, dependencies, build output, coverage, and local databases.
- Added README, architecture, API, roadmap, release checklist, changelog,
  contribution guide, Code of Conduct, and security policy.
- Added GitHub issue templates, pull-request template, Dependabot, CodeQL, and
  secret scanning.
- Added Changesets release configuration.
- Renamed the local default branch from `master` to `main`.

### MCP server

- Standardized all 22 tools on camelCase identifiers.
- Standardized successful responses:

  ```json
  { "success": true, "data": {} }
  ```

- Standardized error responses:

  ```json
  {
    "success": false,
    "error": {
      "code": "WORKFLOW_NOT_FOUND",
      "message": "Workflow was not found in the workspace"
    }
  }
  ```

- Added trusted-local ownership through `CONTEXT_ROUTER_OWNER_ID`, defaulting to
  `local`.
- Scoped database access through workspace ownership.
- Added explicit workflow lifecycle checks.
- Fixed schema version creation.
- Made missing schemas fail instead of silently bypassing validation.
- Fixed default handoffs so omitted keys include all state.
- Made checkpoint restoration transactional.
- Removed unused hosted HTTP authentication and rate-limit middleware.

### Database and packaging

- Added the initial PostgreSQL migration.
- Added PostgreSQL 16 Docker Compose configuration and health check.
- Switched Prisma to its generated TypeScript client and JavaScript PostgreSQL
  driver adapter.
- Embedded the compiled generated Prisma client in the server tarball.
- Added clean builds so stale tests and deleted files cannot enter packages.
- Confirmed both package tarballs include their licenses and only intended files.

### TypeScript SDK

- Removed implicit workflow creation.
- Made workspace and workflow identifiers explicit in every relevant call.
- Added typed `ContextRouterError`.
- Added explicit connection and disconnection lifecycle.
- Aligned every SDK request with the MCP server contract.

### Tests and automation

- Added TypeScript SDK contract tests.
- Added the 22-tool surface test.
- Added PostgreSQL vertical-slice integration tests.
- Added an MCP stdio discovery smoke test.
- Added CI for generation, migration, formatting, type-checking, tests, build,
  integration tests, and package inspection.
- Added a release workflow using Changesets and npm provenance.

## Verification already completed

The following checks pass locally:

```text
npm run typecheck       PASS
npm test                PASS — 16 tests
npm run build           PASS
npm run format:check    PASS
npm run test:mcp        PASS — 22 tools discovered
npm run pack:check      PASS
npm audit --omit=dev    PASS — 0 vulnerabilities
```

Both npm tarballs were installed in an empty temporary project. The TypeScript
SDK and packaged generated server runtime imported successfully.

A high-confidence scan of the complete Git history found no private keys or
common API-token formats.

## Immediate remaining work

### 1. Run the PostgreSQL integration gate

This is the only code-verification gate not executed locally. Docker was not
installed on the development machine and nothing was listening on port 5432.

Run on a machine with Docker:

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate
npm run test:integration
```

Expected scenarios:

- schema versions increment;
- state writes and selective reads work;
- omitted handoff keys include all state;
- checkpoints restore exact prior state;
- cross-workspace access fails;
- terminal workflow transitions cannot repeat.

GitHub CI is already configured to execute this against PostgreSQL 16.

### 2. Review and commit the working tree

Before committing:

```bash
git status
git diff --check
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:mcp
npm run pack:check
```

Do not commit:

- `.env`;
- `node_modules`;
- `dist`;
- generated Prisma source under `packages/server/src/generated`;
- npm tarballs;
- local databases or logs.

### 3. Push the preview to GitHub

- Confirm `mindlever-strategy/context-router` is the intended public repository.
- Push the local `main` branch.
- Make the repository public only after reviewing its complete history.
- Enable branch protection and require CI, CodeQL, and secret-scan checks.
- Enable private vulnerability reporting and Dependabot alerts.
- Add repository topics such as `mcp`, `ai-agents`, `typescript`, `postgresql`,
  `state-management`, and `open-source`.

### 4. Configure npm ownership

The planned package names returned registry 404 responses and are not publicly
published from the current registry view.

- Create or claim the `@context-router` npm organization.
- Grant publish access for both planned packages.
- Configure the protected GitHub `npm` environment.
- Prefer npm trusted publishing; keep `NPM_TOKEN` only as a fallback.
- Do not publish until PostgreSQL CI passes.

### 5. Create the preview release

Recommended first public positioning:

```text
v0.1.0 — early open-source preview
```

If a prerelease tag is preferred, update package versions consistently before
tagging:

```text
0.1.0-alpha.1
v0.1.0-alpha.1
```

Do not tag the current uncommitted working tree. Create a signed tag only after
the release commit and all required CI checks pass.

## Known limitations

- Stdio is trusted-local only and must not be exposed directly to an untrusted network.
- `CONTEXT_ROUTER_OWNER_ID` scopes data but is not an authentication credential.
- PostgreSQL is the only supported storage backend.
- Context Router stores state but does not execute agents.
- State versions are visible but compare-and-set writes are not implemented.
- Idempotent execution keys are not implemented.
- Checkpoints are explicit, not automatically created around agent steps.
- Handoff token limits use a deterministic character approximation.
- The Python SDK connection method is incomplete and the package must not be published.
- No remote MCP transport, hosted dashboard, billing, Redis, RLS, or managed deployment exists.

## Recommended next milestones

### v0.1.x — stabilize the preview

- Run the project with two real MCP clients.
- Add end-to-end tests that execute tool calls against PostgreSQL through stdio.
- Add validation for unexpected schema fields if strict schemas are desired.
- Improve database error mapping without exposing internal details.
- Collect contributor feedback and stabilize tool names before `v1.0`.

### v0.2 candidate

- Complete and publish the Python SDK.
- Add optimistic compare-and-set state updates.
- Add idempotent execution keys.
- Add checkpoint metadata and retention controls.
- Evaluate SQLite or a storage adapter interface for simpler local adoption.

### Later evaluation

- Remote MCP transport and authentication.
- Production multi-tenancy and row-level security.
- Observability and operational metrics.
- Managed hosting and deployment.
- Billing and usage limits.

These later features require separate security and product designs. They should
not be implied in current public documentation.

## Important references

- `README.md` — public project landing page
- `docs/architecture.md` — system boundaries and ownership model
- `docs/api.md` — exact 22-tool MCP contract
- `docs/release-checklist.md` — owner-controlled release steps
- `docs/roadmap.md` — public roadmap
- `packages/server/prisma/schema.prisma` — current data model
- `packages/server/src/db/queries.ts` — scoped persistence and transactions
- `packages/server/src/tools/` — MCP tool implementations
- `packages/sdk-typescript/src/client.ts` — TypeScript SDK
- `.github/workflows/ci.yml` — required CI gates

## Handoff summary

The project is suitable for an honest open-source preview after the PostgreSQL
integration job passes. The next maintainer should focus on validating CI,
reviewing the final diff, pushing `main`, configuring repository protections and
npm ownership, and only then creating the release tag.
