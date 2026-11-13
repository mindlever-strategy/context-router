import { describe, expect, it, vi } from 'vitest';

/**
 * The complete public MCP tool surface.
 *
 * This list is the contract. Adding or removing a tool must be a deliberate
 * edit here, reviewed alongside docs/api.md and the README tool count.
 */
const EXPECTED_TOOLS = [
  'agent_role_create',
  'agent_role_list',
  'checkpoint_create',
  'checkpoint_delete',
  'checkpoint_list',
  'checkpoint_restore',
  'debugger_inspect',
  'handoff_apply',
  'handoff_generate',
  'handoff_generate_ai',
  'journal_append',
  'journal_query',
  'router_status',
  'schema_create',
  'schema_diff',
  'schema_get',
  'schema_list',
  'schema_migrate',
  'schema_validate',
  'state_delete',
  'state_delete_expired',
  'state_diff',
  'state_read',
  'state_snapshot',
  'state_write',
  'step_run_complete',
  'step_run_fail',
  'step_run_start',
  'workflow_complete',
  'workflow_create',
  'workflow_fail',
  'workflow_status',
  'workspace_create',
  'workspace_delete',
  'workspace_ensure',
  'workspace_get',
  'workspace_list',
] as const;

describe('public MCP tool surface', () => {
  it('registers exactly the documented tools', async () => {
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
      { registerStateDiffTools },
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
      import('./state-diff.js'),
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
      ...registerStateDiffTools(server, owner).keys(),
      ...registerSchemaMigrationTools(server, owner).keys(),
    ];

    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...EXPECTED_TOOLS]);
    vi.unstubAllEnvs();
  });
});
