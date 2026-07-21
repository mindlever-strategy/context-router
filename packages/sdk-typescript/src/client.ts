import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';

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

export interface LocalContextRouterOptions {
  dataDir?: string;
  databaseUrl?: string;
  ownerId?: string;
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

export interface StateWriteOptions {
  schemaName?: string;
  expectedVersion?: number;
  agentRole?: string;
  provenance?: ProvenanceMeta;
  provenanceMode?: 'per-field' | 'whole-object';
}

export interface StateReadOptions {
  agentRole?: string;
  unwrap?: boolean;
}

export interface ProvenanceMeta {
  agentRole?: string;
  executionId?: string;
  source?: string;
  confidence?: number;
}

export interface HandoffPacket {
  facts: Record<string, unknown>;
  decisions: string[];
  openQuestions: string[];
  nextGoals: string[];
}

export interface HandoffOptions {
  keys?: string[];
  maxTokens?: number;
  agentRole?: string;
  priorityKeys?: string[];
  nextGoals?: string[];
  format?: 'text' | 'structured';
}

export interface HandoffResult {
  summary: string;
  keysIncluded: string[];
  packet?: HandoffPacket;
}

export interface RouterStatus {
  version: string;
  storage: { engine: 'sqlite' | 'postgresql'; location?: string };
  totals: {
    workspaces: number;
    workflows: number;
    runningWorkflows: number;
    checkpoints: number;
  };
  recentWorkflows: Workflow[];
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
      { name: options.clientName ?? 'context-router-sdk', version: '0.3.1' },
      { capabilities: {} },
    );
    this.transport = this.mcpClient;
  }

  static async local(
    options: LocalContextRouterOptions = {},
  ): Promise<ContextRouter> {
    if (options.dataDir && options.databaseUrl) {
      throw new Error('dataDir and databaseUrl cannot be used together');
    }
    const serverEntry = createRequire(import.meta.url).resolve(
      '@context-router/mcp-server/entry',
    );
    const router = new ContextRouter();
    const env = processEnvironment();
    if (options.dataDir) {
      delete env.DATABASE_URL;
      env.STORAGE_ENGINE = 'sqlite';
      env.CONTEXT_ROUTER_DATA_DIR = options.dataDir;
    }
    if (options.databaseUrl) {
      delete env.CONTEXT_ROUTER_DATA_DIR;
      delete env.STORAGE_ENGINE;
      env.DATABASE_URL = options.databaseUrl;
    }
    if (options.ownerId) env.CONTEXT_ROUTER_OWNER_ID = options.ownerId;
    await router.connect(process.execPath, [serverEntry], env);
    return router;
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

  async close(): Promise<void> {
    await this.disconnect();
  }

  async start(workspaceName: string): Promise<WorkflowSession> {
    const workspace = await this.workspace.ensure(workspaceName);
    const workflow = await this.workflow.create(workspace.id);
    return new WorkflowSession(this, workspace, workflow);
  }

  status(): Promise<RouterStatus> {
    return this.call<RouterStatus>('router_status', {});
  }

  async discoverTools(): Promise<string[]> {
    if (!this.mcpClient) {
      throw new Error('Tool discovery requires the built-in MCP transport');
    }
    const result = await this.mcpClient.listTools();
    return result.tools.map((tool) => tool.name);
  }

  readonly workspace = {
    create: (name: string) =>
      this.call<Workspace>('workspace_create', { name }),
    ensure: (name: string) =>
      this.call<Workspace>('workspace_ensure', { name }),
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
      rules?: Record<string, unknown>[],
    ) => this.call('schema_create', { workspaceId, name, fields, rules }),
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

  readonly agentRole = {
    create: (
      workspaceId: string,
      name: string,
      allowedWriteKeys: string[],
      allowedReadKeys: string[],
    ) =>
      this.call('agent_role_create', {
        workspaceId,
        name,
        allowedWriteKeys,
        allowedReadKeys,
      }),
    list: (workspaceId: string) =>
      this.call('agent_role_list', { workspaceId }),
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
      options: StateWriteOptions = {},
    ) =>
      this.call('state_write', {
        workspaceId,
        workflowId,
        key,
        value,
        ...options,
      }),
    read: (
      workspaceId: string,
      workflowId: string,
      key: string,
      options: StateReadOptions = {},
    ) =>
      this.call<StateValue>('state_read', {
        workspaceId,
        workflowId,
        key,
        ...options,
      }),
    readMany: (
      workspaceId: string,
      workflowId: string,
      keys: string[],
      options: StateReadOptions = {},
    ) =>
      this.call<{ values: Record<string, unknown> }>('state_read', {
        workspaceId,
        workflowId,
        keys,
        ...options,
      }),
    delete: (workspaceId: string, workflowId: string, key: string) =>
      this.call('state_delete', { workspaceId, workflowId, key }),
    snapshot: (
      workspaceId: string,
      workflowId: string,
      options: StateReadOptions = {},
    ) =>
      this.call<Record<string, unknown>>('state_snapshot', {
        workspaceId,
        workflowId,
        ...options,
      }),
  };

  readonly step = {
    start: (
      workspaceId: string,
      workflowId: string,
      stepId: string,
      executionId: string,
      agentId?: string,
    ) =>
      this.call('step_run_start', {
        workspaceId,
        workflowId,
        stepId,
        executionId,
        agentId,
      }),
    complete: (
      workspaceId: string,
      workflowId: string,
      stepId: string,
      executionId: string,
      result?: Record<string, unknown>,
    ) =>
      this.call('step_run_complete', {
        workspaceId,
        workflowId,
        stepId,
        executionId,
        result,
      }),
    fail: (
      workspaceId: string,
      workflowId: string,
      stepId: string,
      executionId: string,
      reason: string,
    ) =>
      this.call('step_run_fail', {
        workspaceId,
        workflowId,
        stepId,
        executionId,
        reason,
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
      options: HandoffOptions = {},
    ) =>
      this.call<HandoffResult>('handoff_generate', {
        workspaceId,
        workflowId,
        ...options,
      }),
    apply: (
      workspaceId: string,
      workflowId: string,
      options: {
        keys?: string[];
        prefix?: string;
        maxTokens?: number;
        agentRole?: string;
        priorityKeys?: string[];
        nextGoals?: string[];
        format?: 'text' | 'structured';
      } = {},
    ) =>
      this.call<{
        context: string;
        keysIncluded: string[];
        packet?: HandoffPacket;
      }>('handoff_apply', {
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

export class WorkflowSession {
  constructor(
    private readonly router: ContextRouter,
    public readonly workspace: Workspace,
    public readonly workflow: Workflow,
  ) {}

  set(
    key: string,
    value: Record<string, unknown>,
    options: StateWriteOptions = {},
  ): Promise<unknown> {
    return this.router.state.write(
      this.workspace.id,
      this.workflow.id,
      key,
      value,
      options,
    );
  }

  get(key: string, options: StateReadOptions = {}): Promise<StateValue> {
    return this.router.state.read(
      this.workspace.id,
      this.workflow.id,
      key,
      options,
    );
  }

  async getMany(
    keys: string[],
    options: StateReadOptions = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.router.state.readMany(
      this.workspace.id,
      this.workflow.id,
      keys,
      options,
    );
    return result.values;
  }

  checkpoint(label?: string): Promise<unknown> {
    return this.router.checkpoint.create(this.workspace.id, this.workflow.id, {
      label,
    });
  }

  handoff(options: HandoffOptions = {}): Promise<HandoffResult> {
    return this.router.handoff.generate(
      this.workspace.id,
      this.workflow.id,
      options,
    );
  }

  complete(): Promise<Workflow> {
    return this.router.workflow.complete(this.workspace.id, this.workflow.id);
  }

  fail(reason: string): Promise<Workflow> {
    return this.router.workflow.fail(
      this.workspace.id,
      this.workflow.id,
      reason,
    );
  }
}

function processEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export default ContextRouter;
