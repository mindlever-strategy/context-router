# Context Router Python SDK

Python client for the [Context Router](https://github.com/mindlever-strategy/context-router) MCP server.

Full Cursor + Python usage guide: **[USING.md](../../USING.md)**.

## Requirements

- Python 3.10+
- Node.js 20+ with a resolvable `@context-router/mcp-server` package, or a built server in this monorepo

## Install

From the monorepo:

```bash
cd packages/sdk-python
pip install -e ".[dev]"
```

Ensure the MCP server is built:

```bash
cd ../..
npm run build
```

## Quickstart

```python
import asyncio
from context_router import ContextRouter


async def main():
    async with await ContextRouter.local() as router:
        flow = await router.start("Research")
        await flow.set("findings", {"answer": 42})
        handoff = await flow.handoff(keys=["findings"])
        print(handoff.summary)
        await flow.complete()


asyncio.run(main())
```

Use an isolated SQLite directory in tests:

```python
async with await ContextRouter.local(data_dir="/tmp/my-router-data") as router:
    ...
```

## API surface

The Python SDK mirrors the TypeScript SDK:

- High-level: `ContextRouter.local()`, `router.start()`, `router.status()`, `router.discover_tools()`
- `WorkflowSession`: `set`, `get`, `get_many`, `checkpoint`, `handoff`, `complete`, `fail`
- Explicit namespaces: `router.workspace`, `router.schema`, `router.workflow`, `router.state`, `router.checkpoint`, `router.handoff`, `router.step`, `router.agent_role`

## Examples

- [examples/simple-pipeline.py](../../examples/simple-pipeline.py)

## Tests

```bash
pytest
```

Integration tests skip automatically when Node.js or the MCP server entry is unavailable.

## Server resolution

`ContextRouter.local()` resolves the server in this order:

1. `CONTEXT_ROUTER_MCP_ENTRY` environment variable
2. Installed npm package `@context-router/mcp-server/entry`
3. Monorepo fallback at `packages/server/dist/index.js`

## License

Apache-2.0
