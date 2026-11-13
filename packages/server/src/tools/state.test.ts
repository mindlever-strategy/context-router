import { describe, expect, it, vi } from 'vitest';

// Mock Prisma client
vi.mock('../db/client.js', () => ({
  prisma: {
    checkpoint: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('state_diff mode validation', () => {
  it('throws VALIDATION_ERROR when mode is missing with only workspaceId and workflowId', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateDiffTools } = await import('./state-diff.js');

    // @ts-expect-error - testing invalid input shape
    const tools = registerStateDiffTools({} as never, () => 'user-id');
    const stateDiffTool = tools.get('state_diff');
    if (!stateDiffTool) throw new Error('state_diff tool not registered');

    // Use valid UUIDs (with proper version/variant bits) but no mode
    const result = await stateDiffTool.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workflowId: '22222222-2222-4222-8222-222222222222',
      // mode is intentionally omitted
    });

    expect(result).toHaveProperty('content');
    const content = result.content as Array<{ type: string; text: string }>;
    const errorText = content[0]?.text ?? '';
    expect(errorText).toContain('VALIDATION_ERROR');
    expect(errorText).toContain('mode is required');
    vi.unstubAllEnvs();
  });

  it('throws VALIDATION_ERROR when mode is missing with no checkpoint IDs and no workflowId', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateDiffTools } = await import('./state-diff.js');

    // @ts-expect-error - testing invalid input shape
    const tools = registerStateDiffTools({} as never, () => 'user-id');
    const stateDiffTool = tools.get('state_diff');
    if (!stateDiffTool) throw new Error('state_diff tool not registered');

    // Use valid UUID (with proper version/variant bits) but no mode or other params
    const result = await stateDiffTool.handler({
      workspaceId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toHaveProperty('content');
    const content = result.content as Array<{ type: string; text: string }>;
    const errorText = content[0]?.text ?? '';
    expect(errorText).toContain('VALIDATION_ERROR');
    expect(errorText).toContain('mode is required');
    vi.unstubAllEnvs();
  });
});

describe('state_read consolidation', () => {
  it('exposes exactly one read tool', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateTools } = await import('./state.js');
    const names = [...registerStateTools({} as never, () => 'local').keys()];

    expect(names).toContain('state_read');
    expect(names).not.toContain('state_read_batch');
    expect(names).not.toContain('state_read_ttl');
    vi.unstubAllEnvs();
  });

  it('declares expiresAt on the read result schema', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateTools } = await import('./state.js');
    const read = registerStateTools({} as never, () => 'local').get(
      'state_read',
    );
    if (!read) throw new Error('state_read was not registered');

    expect(read.definition.description).toMatch(/expired/i);
    vi.unstubAllEnvs();
  });
});

describe('state_write batch entries value schema', () => {
  it('accepts any JSON value via anyOf in batch entries', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateTools } = await import('./state.js');
    const stateWrite = registerStateTools({} as never, () => 'local').get(
      'state_write',
    );
    expect(stateWrite).toBeDefined();

    const entriesSchema = stateWrite!.definition.inputSchema.properties
      .entries as Record<string, unknown>;
    const entryItemSchema = entriesSchema.items as Record<string, unknown>;
    const valueSchema = entryItemSchema.properties?.value as
      Record<string, unknown> | undefined;

    // Must not be the restrictive { type: 'object' } that rejects arrays/scalars
    expect(valueSchema).toBeDefined();
    expect(valueSchema!.type).toBeUndefined();
    expect(valueSchema!.anyOf).toEqual([
      { type: 'object' },
      { type: 'array' },
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ]);
    vi.unstubAllEnvs();
  });
});

describe('state_write batch entries schemaName optionality', () => {
  it('schemaName in batch entries is optional in MCP schema', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateTools } = await import('./state.js');
    const stateWrite = registerStateTools({} as never, () => 'local').get(
      'state_write',
    );
    expect(stateWrite).toBeDefined();

    const entriesSchema = stateWrite!.definition.inputSchema.properties
      .entries as Record<string, unknown>;
    const entryItemSchema = entriesSchema.items as Record<string, unknown>;
    const properties = entryItemSchema.properties as Record<string, unknown>;

    // schemaName should NOT be in required array
    expect(entryItemSchema.required).not.toContain('schemaName');
    // And should exist in properties
    expect(properties).toHaveProperty('schemaName');
    vi.unstubAllEnvs();
  });
});

describe('state_write provenance with batch entries', () => {
  it('rejects provenance with batch entries', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    vi.mock('../db/queries.js', () => ({
      writeStateBatch: vi.fn().mockResolvedValue({ results: [] }),
    }));

    const { registerStateTools } = await import('./state.js');
    const tools = registerStateTools({} as never, () => 'user');
    const stateWrite = tools.get('state_write')!;

    const result = await stateWrite.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workflowId: '22222222-2222-4222-8222-222222222222',
      entries: [{ key: 'k1', value: 'v1' }],
      provenance: { source: 'test' },
    });

    expect(result.isError).toBe(true);
    const content = JSON.parse(result.content[0].text);
    expect(content.error.code).toBe('VALIDATION_ERROR');
    // The message or details should contain the provenance error
    const errorText = JSON.stringify(content.error);
    expect(errorText).toContain('provenance');
    vi.unstubAllEnvs();
  });

  it('rejects provenanceMode with batch entries', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    vi.mock('../db/queries.js', () => ({
      writeStateBatch: vi.fn().mockResolvedValue({ results: [] }),
    }));

    const { registerStateTools } = await import('./state.js');
    const tools = registerStateTools({} as never, () => 'user');
    const stateWrite = tools.get('state_write')!;

    const result = await stateWrite.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workflowId: '22222222-2222-4222-8222-222222222222',
      entries: [{ key: 'k1', value: 'v1' }],
      provenanceMode: 'per-field',
    });

    expect(result.isError).toBe(true);
    const content = JSON.parse(result.content[0].text);
    expect(content.error.code).toBe('VALIDATION_ERROR');
    // The message or details should contain the provenance error
    const errorText = JSON.stringify(content.error);
    expect(errorText).toContain('provenance');
    vi.unstubAllEnvs();
  });
});

describe('state_write published MCP schema', () => {
  it('accepts any JSON value via anyOf (not object-only)', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerStateTools } = await import('./state.js');
    const stateWrite = registerStateTools({} as never, () => 'local').get(
      'state_write',
    );
    expect(stateWrite).toBeDefined();

    const valueSchema = stateWrite!.definition.inputSchema.properties
      .value as Record<string, unknown>;

    // Must not be the restrictive { type: 'object' } that rejects arrays/scalars
    expect(valueSchema.type).toBeUndefined();
    expect(valueSchema.anyOf).toEqual([
      { type: 'object' },
      { type: 'array' },
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ]);
  });
});
