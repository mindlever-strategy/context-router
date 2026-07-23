import { describe, expect, it, vi } from 'vitest';

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
