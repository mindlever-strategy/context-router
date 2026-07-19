import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client(
  { name: 'context-router-smoke', version: '0.1.0' },
  { capabilities: {} },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['packages/server/dist/index.js'],
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    CONTEXT_ROUTER_OWNER_ID: 'smoke',
  },
});

try {
  await client.connect(transport);
  const result = await client.listTools();
  if (result.tools.length !== 22) {
    throw new Error(`Expected 22 tools, received ${result.tools.length}`);
  }
  console.log('MCP_SMOKE_OK tools=22');
} finally {
  await client.close();
}
