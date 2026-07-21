# Cursor Setup

Use Context Router as a local MCP server inside Cursor for structured multi-agent
workflow state.

For the full cookbook (Cursor Agent prompts + Python SDK), see
**[USING.md](../USING.md)**.

## Requirements

- Node.js 20+
- No database or Docker setup required for the default SQLite path

## 1. Zero-config MCP (recommended)

Add the published server to your Cursor MCP config. SQLite is created
automatically in your OS application-data directory.

```json
{
  "mcpServers": {
    "context-router": {
      "command": "npx",
      "args": ["-y", "@context-router/mcp-server"]
    }
  }
}
```

Restart Cursor or refresh MCP tools after saving the config.

For PostgreSQL, set `DATABASE_URL` in the server environment and run the
included Prisma migrations before starting the server.

## 2. Monorepo / contributor path

If you are developing Context Router from this repository:

```bash
npm ci
npm run db:generate
npm run build
npm test
```

Then point Cursor at the built server (adjust the path to your checkout):

```json
{
  "mcpServers": {
    "context-router": {
      "command": "node",
      "args": ["path/to/context-router/packages/server/dist/index.js"]
    }
  }
}
```

## 3. Multi-agent prompt pattern

When running a multi-step workflow in Cursor Agent:

1. `workspace_ensure` once per project or feature area
2. `schema_create` when you want validated state (optional on first use)
3. `agent_role_create` for each agent (`research`, `validation`, `outreach`)
4. `workflow_create` at the start of each run
5. For each step:
   - `step_run_start` with a stable `executionId`
   - `state_write` with `agentRole`, optional `provenance`, and `expectedVersion`
   - `handoff_generate` with `agentRole` and `format: "structured"`
   - `step_run_complete`
6. `checkpoint_create` before risky external calls if needed
7. `workflow_complete` when finished

Do not paste full chat history into the next agent prompt. Read only the keys
that agent role is allowed to see.

Schema-free writes are accepted; the response includes `warning: UNVALIDATED_STATE`
when no `schemaName` is supplied. Set `CONTEXT_ROUTER_LOG_UNVALIDATED_STATE=true`
to also log those writes to stderr.

## 4. Smoke test

Ask Cursor Agent to call:

- `workspace_ensure`
- `workflow_create`
- `state_write`
- `handoff_generate`

If all four succeed, the MCP wiring is working.

## Security note

The stdio server is trusted-local only. Do not expose it directly to an
untrusted network.
