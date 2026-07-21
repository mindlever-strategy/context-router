import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const client = new Client(
  { name: 'context-router-smoke', version: '0.1.0' },
  { capabilities: {} },
);
const dataDirectory = await mkdtemp(join(tmpdir(), 'context-router-smoke-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['packages/server/dist/index.js'],
  env: {
    ...process.env,
    DATABASE_URL: '',
    STORAGE_ENGINE: 'sqlite',
    CONTEXT_ROUTER_DATA_DIR: dataDirectory,
    CONTEXT_ROUTER_OWNER_ID: 'smoke',
  },
});

try {
  await client.connect(transport);
  const result = await client.listTools();
  if (result.tools.length !== 29) {
    throw new Error(`Expected 29 tools, received ${result.tools.length}`);
  }
  console.log('MCP_SMOKE_OK tools=29');
} finally {
  await client.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
