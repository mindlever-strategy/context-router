import { describe, expect, it } from 'vitest';
import {
  ContextRouter,
  ContextRouterError,
  type ToolTransport,
} from './client.js';

class FakeTransport implements ToolTransport {
  calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  async callTool(request: {
    name: string;
    arguments: Record<string, unknown>;
  }) {
    this.calls.push(request);
    if (request.name === 'workflow_status') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: 'WORKFLOW_NOT_FOUND',
                message: 'Missing workflow',
              },
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: { id: 'workflow-id', ...request.arguments },
          }),
        },
      ],
    };
  }
}

describe('ContextRouter SDK contract', () => {
  it('passes explicit workspace and workflow IDs', async () => {
    const transport = new FakeTransport();
    const client = new ContextRouter({ transport });
    await client.state.write('workspace-id', 'workflow-id', 'lead', {
      name: 'Acme',
    });

    expect(transport.calls[0]).toEqual({
      name: 'state_write',
      arguments: {
        workspaceId: 'workspace-id',
        workflowId: 'workflow-id',
        key: 'lead',
        value: { name: 'Acme' },
        schemaName: undefined,
      },
    });
  });

  it('does not create an implicit workflow', async () => {
    const transport = new FakeTransport();
    const client = new ContextRouter({ transport });
    await client.handoff.generate('workspace-id', 'workflow-id');
    expect(transport.calls.map((call) => call.name)).toEqual([
      'handoff_generate',
    ]);
  });

  it('throws typed errors from error envelopes', async () => {
    const client = new ContextRouter({ transport: new FakeTransport() });
    await expect(
      client.workflow.status('workspace-id', 'missing'),
    ).rejects.toMatchObject<Partial<ContextRouterError>>({
      code: 'WORKFLOW_NOT_FOUND',
    });
  });
});
