import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

type ContextRouterConfig = {
  apiKey: string;
  workspaceId: string;
  serverUrl?: string;
};

export class ContextRouter {
  private client: Client;
  private workspaceId: string;

  constructor(config: ContextRouterConfig) {
    this.workspaceId = config.workspaceId;
    this.client = new Client(
      { name: 'context-router-sdk', version: '1.0.0' },
      { capabilities: {} }
    );
  }

  get schema() {
    return {
      create: async (name: string, fields: object) => {
        const result = await this.client.callTool(
          { name: 'schema_create', arguments: { workspaceId: this.workspaceId, name, fields } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      get: async (name: string) => {
        const result = await this.client.callTool(
          { name: 'schema_get', arguments: { workspaceId: this.workspaceId, name } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      list: async () => {
        const result = await this.client.callTool(
          { name: 'schema_list', arguments: { workspaceId: this.workspaceId } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      validate: async (schemaName: string, data: object) => {
        const result = await this.client.callTool(
          { name: 'schema_validate', arguments: { workspaceId: this.workspaceId, schemaName, data } }
        );
        return JSON.parse((result.content as any)[0].text);
      }
    };
  }

  get state() {
    return {
      write: async (key: string, value: object, schemaName?: string) => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'state_write', arguments: { workspaceId: this.workspaceId, workflowId, key, value, schemaName } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      read: async (key: string, options?: { fields?: string[] }) => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'state_read', arguments: { workflowId, key, ...options } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      delete: async (key: string) => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'state_delete', arguments: { workflowId, key } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      snapshot: async () => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'state_snapshot', arguments: { workflowId } }
        );
        return JSON.parse((result.content as any)[0].text);
      }
    };
  }

  get checkpoint() {
    return {
      create: async (workflowId: string, options?: { label?: string }) => {
        const result = await this.client.callTool(
          { name: 'checkpoint_create', arguments: { workspaceId: this.workspaceId, workflowId, ...options } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      list: async (workflowId: string) => {
        const result = await this.client.callTool(
          { name: 'checkpoint_list', arguments: { workflowId } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      restore: async (checkpointId: string) => {
        const result = await this.client.callTool(
          { name: 'checkpoint_restore', arguments: { checkpointId } }
        );
        return JSON.parse((result.content as any)[0].text);
      }
    };
  }

  get handoff() {
    return {
      generate: async (options?: { keys?: string[]; maxTokens?: number }) => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'handoff_generate', arguments: { workflowId, ...options } }
        );
        return (result.content as any)[0].text;
      },

      apply: async (options?: { keys?: string[]; prefix?: string; maxTokens?: number }) => {
        const workflowId = await this.getCurrentWorkflowId();
        const result = await this.client.callTool(
          { name: 'handoff_apply', arguments: { workflowId, ...options } }
        );
        return (result.content as any)[0].text;
      }
    };
  }

  get workflow() {
    return {
      create: async () => {
        const result = await this.client.callTool(
          { name: 'workflow_create', arguments: { workspaceId: this.workspaceId } }
        );
        const workflow = JSON.parse((result.content as any)[0].text);
        this.currentWorkflowId = workflow.id;
        return workflow;
      },

      status: async (workflowId: string) => {
        const result = await this.client.callTool(
          { name: 'workflow_status', arguments: { workflowId } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      complete: async (workflowId: string) => {
        const result = await this.client.callTool(
          { name: 'workflow_complete', arguments: { workflowId, workspaceId: this.workspaceId } }
        );
        return JSON.parse((result.content as any)[0].text);
      },

      fail: async (workflowId: string, reason: string) => {
        const result = await this.client.callTool(
          { name: 'workflow_fail', arguments: { workflowId, reason, workspaceId: this.workspaceId } }
        );
        return JSON.parse((result.content as any)[0].text);
      }
    };
  }

  private currentWorkflowId?: string;

  private async getCurrentWorkflowId(): Promise<string> {
    if (!this.currentWorkflowId) {
      const workflow = await this.workflow.create();
      this.currentWorkflowId = workflow.id;
    }
    return this.currentWorkflowId!;
  }

  async connect(serverCommand: string, args?: string[]): Promise<void> {
    const transport = new StdioClientTransport({
      command: serverCommand,
      args: args ?? [],
    });
    await this.client.connect(transport);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}

export { ContextRouter as default };
