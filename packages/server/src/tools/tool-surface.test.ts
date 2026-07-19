import { describe, expect, it, vi } from 'vitest';

describe('public MCP tool surface', () => {
  it('registers the documented 22 unique tools', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const [
      { registerCheckpointTools },
      { registerHandoffTools },
      { registerSchemaTools },
      { registerStateTools },
      { registerWorkflowTools },
      { registerWorkspaceTools },
    ] = await Promise.all([
      import('./checkpoint.js'),
      import('./handoff.js'),
      import('./schema.js'),
      import('./state.js'),
      import('./workflow.js'),
      import('./workspace.js'),
    ]);
    const server = {} as never;
    const owner = () => 'local';
    const names = [
      ...registerWorkspaceTools(server, owner).keys(),
      ...registerSchemaTools(server, owner).keys(),
      ...registerWorkflowTools(server, owner).keys(),
      ...registerStateTools(server, owner).keys(),
      ...registerCheckpointTools(server, owner).keys(),
      ...registerHandoffTools(server, owner).keys(),
    ];

    expect(names).toHaveLength(22);
    expect(new Set(names).size).toBe(22);
  });
});
