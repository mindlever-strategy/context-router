# @context-router/mcp-server

Local stdio MCP server for structured workflow state, checkpoints, and handoffs.

See the [project repository](https://github.com/mindlever-strategy/context-router)
for PostgreSQL setup, migrations, MCP configuration, tool contracts, and
security limitations.

```bash
npx -y @context-router/mcp-server
```

Required environment: `DATABASE_URL`. Optional trusted-local scope:
`CONTEXT_ROUTER_OWNER_ID` (default `local`).
