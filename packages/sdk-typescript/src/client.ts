import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface ToolTransport {
  callTool(request: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
  close?(): Promise<void>;
}

export interface ContextRouterOptions {
  clientName?: string;
  transport?: ToolTransport;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  workspaceId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

export interface StateValue {
  key: string;
  value: Record<string, unknown>;
  version: number;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export class ContextRouterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ContextRouterError';
  }
}

export class ContextRouter {
  private readonly mcpClient?: Client;
  private readonly transport: ToolTransport;

  constructor(options: ContextRouterOptions = {}) {
    if (options.transport) {
      this.transport = options.transport;
      return;
    }
    this.mcpClient = new Client(
      { name: options.clientName ?? 'context-router-sdk', version: '0.1.0' },
      { capabilities: {} },
    );
    this.transport = this.mcpClient;
  }

  async connect(
    command: string,
    args: string[] = [],
    env?: Record<string, string>,
  ): Promise<void> {
    if (!this.mcpClient) {
      throw new Error(
        'connect() is unavailable when a custom transport is supplied',
      );
    }
    await this.mcpClient.connect(
      new StdioClientTransport({ command, args, env }),
    );
  }

  async disconnect(): Promise<void> {
    await this.transport.close?.();
  }

  readonly workspace = {
    create: (name: string) =>
      this.call<Workspace>('workspace_create', { name }),
    list: () => this.call<Workspace[]>('workspace_list', {}),
    get: (workspaceId: string) =>
      this.call<Workspace>('workspace_get', { workspaceId }),
    delete: (workspaceId: string) =>
      this.call<Workspace>('workspace_delete', { workspaceId }),
  };

  readonly schema = {
    create: (
      workspaceId: string,
      name: string,
      fields: Record<string, unknown>,
    ) => this.call('schema_create', { workspaceId, name, fields }),
    get: (workspaceId: string, name: string) =>
      this.call('schema_get', { workspaceId, name }),
    list: (workspaceId: string) => this.call('schema_list', { workspaceId }),
    validate: (
      workspaceId: string,
      schemaName: string,
      data: Record<string, unknown>,
    ) =>
      this.call<{ valid: boolean; errors: unknown[]; schemaVersion: number }>(
        'schema_validate',
        { workspaceId, schemaName, data },
      ),
  };

  readonly workflow = {
    create: (workspaceId: string) =>
      this.call<Workflow>('workflow_create', { workspaceId }),
    status: (workspaceId: string, workflowId: string) =>
      this.call<Workflow>('workflow_status', { workspaceId, workflowId }),
    complete: (workspaceId: string, workflowId: string) =>
      this.call<Workflow>('workflow_complete', { workspaceId, workflowId }),
    fail: (workspaceId: string, workflowId: string, reason: string) =>
      this.call<Workflow>('workflow_fail', { workspaceId, workflowId, reason }),
  };

  readonly state = {
    write: (
      workspaceId: string,
      workflowId: string,
      key: string,
      value: Record<string, unknown>,
      schemaName?: string,
    ) =>
      this.call('state_write', {
        workspaceId,
        workflowId,
        key,
        value,
        schemaName,
      }),
    read: (workspaceId: string, workflowId: string, key: string) =>
      this.call<StateValue>('state_read', { workspaceId, workflowId, key }),
    readMany: (workspaceId: string, workflowId: string, keys: string[]) =>
      this.call<{ values: Record<string, unknown> }>('state_read', {
        workspaceId,
        workflowId,
        keys,
      }),
    delete: (workspaceId: string, workflowId: string, key: string) =>
      this.call('state_delete', { workspaceId, workflowId, key }),
    snapshot: (workspaceId: string, workflowId: string) =>
      this.call<Record<string, unknown>>('state_snapshot', {
        workspaceId,
        workflowId,
      }),
  };

  readonly checkpoint = {
    create: (
      workspaceId: string,
      workflowId: string,
      options: { label?: string } = {},
    ) =>
      this.call('checkpoint_create', { workspaceId, workflowId, ...options }),
    list: (workspaceId: string, workflowId: string) =>
      this.call('checkpoint_list', { workspaceId, workflowId }),
    restore: (workspaceId: string, checkpointId: string) =>
      this.call('checkpoint_restore', { workspaceId, checkpointId }),
    delete: (workspaceId: string, checkpointId: string) =>
      this.call('checkpoint_delete', { workspaceId, checkpointId }),
  };

  readonly handoff = {
    generate: (
      workspaceId: string,
      workflowId: string,
      options: { keys?: string[]; maxTokens?: number } = {},
    ) =>
      this.call<{ summary: string; keysIncluded: string[] }>(
        'handoff_generate',
        {
          workspaceId,
          workflowId,
          ...options,
        },
      ),
    apply: (
      workspaceId: string,
      workflowId: string,
      options: { keys?: string[]; prefix?: string; maxTokens?: number } = {},
    ) =>
      this.call<{ context: string; keysIncluded: string[] }>('handoff_apply', {
        workspaceId,
        workflowId,
        ...options,
      }),
  };

  private async call<T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = (await this.transport.callTool({
      name,
      arguments: args,
    })) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = result.content?.find((item) => item.type === 'text')?.text;
    if (!text)
      throw new ContextRouterError(
        'INVALID_RESPONSE',
        'MCP tool returned no text',
      );

    let envelope: SuccessEnvelope<T> | ErrorEnvelope;
    try {
      envelope = JSON.parse(text) as SuccessEnvelope<T> | ErrorEnvelope;
    } catch {
      throw new ContextRouterError(
        'INVALID_RESPONSE',
        'MCP tool returned invalid JSON',
        text,
      );
    }
    if (!envelope.success) {
      throw new ContextRouterError(
        envelope.error.code,
        envelope.error.message,
        envelope.error.details,
      );
    }
    return envelope.data;
  }
}

export default ContextRouter;
