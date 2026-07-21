# @context-router/mcp-server

Local stdio MCP server for structured workflow state, checkpoints, and handoffs.

See the [project repository](https://github.com/mindlever-strategy/context-router)
for SQLite and PostgreSQL setup, MCP configuration, tool contracts, and security
limitations.

```bash
npx -y @context-router/mcp-server
```

No environment is required; SQLite is created in the OS application-data
directory. Set `DATABASE_URL` to opt into PostgreSQL. Optional trusted-local
scope: `CONTEXT_ROUTER_OWNER_ID` (default `local`).
