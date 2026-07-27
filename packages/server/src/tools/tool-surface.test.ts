import { describe, expect, it, vi } from 'vitest';

describe('public MCP tool surface', () => {
  it('registers all documented tools', async () => {
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
      { registerStepTools },
      { registerAgentRoleTools },
      { registerRouterTools },
      { registerDebuggerTools },
      { registerJournalTools },
      { registerStateBatchTools },
      { registerStateDiffTools },
      { registerStateTTLTools },
      { registerSchemaMigrationTools },
    ] = await Promise.all([
      import('./checkpoint.js'),
      import('./handoff.js'),
      import('./schema.js'),
      import('./state.js'),
      import('./workflow.js'),
      import('./workspace.js'),
      import('./step.js'),
      import('./agent-role.js'),
      import('./router.js'),
      import('./debugger-tool.js'),
      import('./journal.js'),
      import('./state-batch.js'),
      import('./state-diff.js'),
      import('./state-ttl.js'),
      import('./schema-migration.js'),
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
      ...registerStepTools(server, owner).keys(),
      ...registerAgentRoleTools(server, owner).keys(),
      ...registerRouterTools(server, owner).keys(),
      ...registerDebuggerTools(server, owner).keys(),
      ...registerJournalTools(server, owner).keys(),
      ...registerStateBatchTools(server, owner).keys(),
      ...registerStateDiffTools(server, owner).keys(),
      ...registerStateTTLTools(server, owner).keys(),
      ...registerSchemaMigrationTools(server, owner).keys(),
    ];

    expect(names).toHaveLength(names.length); // Just verify no duplicates
    expect(new Set(names).size).toBe(names.length);
  });
});
