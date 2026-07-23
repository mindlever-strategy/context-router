/**
 * Context Router - CREWAI Adapter
 *
 * Bridges CREWAI crews/agents with Context Router's structured state management.
 *
 * Benefits:
 * - Persistent memory across crew runs (survives process restarts)
 * - Agent-specific and shared memory storage
 * - Task output tracking with full provenance
 * - Workspace isolation for multi-tenant deployments
 * - Handoff summaries between agents
 *
 * Usage:
 * ```typescript
 * import { ContextRouterMemory, createCrewAdapter } from '@context-router/crewai-adapter';
 *
 * // Option 1: Use memory directly with Crew
 * const memory = new ContextRouterMemory({ workspaceName: 'my-project' });
 *
 * const crew = new Crew(
 *   agents=[researcher, writer],
 *   tasks=[researchTask, writeTask],
 *   memory=memory.crewaiMemory(),  // Returns CREWAI-compatible memory
 * );
 *
 * // Option 2: Use the adapter for more control
 * const adapter = createCrewAdapter({ workspaceName: 'my-project' });
 * const context = await adapter.getContext();
 * ```
 */

import {
  ContextRouter,
  WorkflowSession,
  type StateValue,
  type HandoffResult,
} from '@context-router/sdk';

// Re-export types for convenience
export type { StateValue, HandoffResult };

/**
 * Configuration for the CREWAI adapter
 */
export interface CrewAdapterConfig {
  /** Optional workspace name for isolation. Defaults to 'crewai' */
  workspaceName?: string;
  /** Optional Context Router instance. Creates new one if not provided */
  router?: ContextRouter;
  /** Auto-create checkpoint after each task (default: true) */
  autoCheckpoint?: boolean;
  /** Prefix for memory keys to avoid collisions (default: 'crewai') */
  keyPrefix?: string;
}

/**
 * Memory entry with metadata for CREWAI compatibility
 */
export interface MemoryEntry {
  key: string;
  value: unknown;
  agentRole?: string;
  taskId?: string;
  timestamp: number;
}

/**
 * CREWAI-compatible memory structure
 */
export interface CrewMemory {
  /** List of memories as strings (CREWAI format) */
  memories: string[];
  /** Optional additional context */
  context?: string;
}

/**
 * Context for an agent during execution
 */
export interface AgentContext {
  /** Agent's role/identifier */
  agentRole: string;
  /** Current task being executed */
  taskId?: string;
  /** Previous agent outputs (for handoffs) */
  previousOutputs: Record<string, unknown>;
  /** All memories for this agent */
  memories: MemoryEntry[];
}

/**
 * Task result stored in memory
 */
export interface TaskResult {
  taskId: string;
  taskDescription: string;
  output: unknown;
  agentRole: string;
  timestamp: number;
}

/**
 * Context Router Memory for CREWAI
 *
 * Provides persistent, structured memory storage for CREWAI crews.
 * Supports both shared memory (crew-level) and agent-specific memory.
 *
 * Example:
 * ```typescript
 * const memory = new ContextRouterMemory({ workspaceName: 'research-project' });
 *
 * // Store agent output
 * await memory.storeAgentOutput('researcher', { findings: '...' });
 *
 * // Get memories for a specific agent
 * const agentContext = await memory.getAgentContext('writer');
 *
 * // Share memories between agents
 * await memory.shareMemories('researcher', 'writer');
 * ```
 */
export class ContextRouterMemory {
  private router: ContextRouter;
  private workspaceName: string;
  private autoCheckpoint: boolean;
  private keyPrefix: string;
  private sessions: Map<string, WorkflowSession> = new Map();
  private currentSession: WorkflowSession | null = null;

  constructor(config: CrewAdapterConfig = {}) {
    this.workspaceName = config.workspaceName ?? 'crewai';
    this.autoCheckpoint = config.autoCheckpoint ?? true;
    this.keyPrefix = config.keyPrefix ?? 'crewai';
    this.router = config.router as ContextRouter;
  }

  /**
   * Get or create a router instance
   */
  private async getRouter(): Promise<ContextRouter> {
    if (!this.router) {
      this.router = await ContextRouter.local();
    }
    return this.router;
  }

  /**
   * Get or create a session for the current crew run
   */
  async getSession(runId?: string): Promise<WorkflowSession> {
    const sessionKey = runId ?? `${this.workspaceName}-default`;

    if (!this.sessions.has(sessionKey)) {
      const router = await this.getRouter();
      const session = await router.start(`${this.workspaceName}-${sessionKey}`);
      this.sessions.set(sessionKey, session);
      this.currentSession = session;
    }

    return this.sessions.get(sessionKey)!;
  }

  /**
   * Read workflow state matching a prefix/glob pattern.
   *
   * `session.getMany` uses exact SQL `IN` matching — literal keys like
   * `crewai:*` never match stored keys. Use `state_snapshot` + client-side
   * prefix filtering instead (trailing `*` means "starts with").
   */
  private async getMatchingState(
    pattern: string
  ): Promise<Record<string, unknown>> {
    const session = await this.getSession();
    const router = await this.getRouter();
    const snapshot = await router.state.snapshot(
      session.workspace.id,
      session.workflow.id
    );
    return filterKeysByPattern(snapshot, pattern);
  }

  /**
   * Set the current session explicitly (for custom session management)
   */
  async setSession(session: WorkflowSession): Promise<void> {
    const sessionKey = `${this.workspaceName}-${session.workflow.id}`;
    this.sessions.set(sessionKey, session);
    this.currentSession = session;
  }

  /**
   * Store output from an agent
   *
   * @param agentRole - The agent's role identifier
   * @param output - The agent's output to store
   * @param taskId - Optional task ID this output relates to
   */
  async storeAgentOutput(
    agentRole: string,
    output: unknown,
    taskId?: string
  ): Promise<void> {
    const session = await this.getSession();
    const key = `${this.keyPrefix}:agent:${agentRole}:output`;

    const entry: MemoryEntry = {
      key,
      value: output,
      agentRole,
      taskId,
      timestamp: Date.now(),
    };

    await session.set(key, entry as unknown as Record<string, unknown>);

    if (this.autoCheckpoint) {
      await session.checkpoint(`agent-${agentRole}-output`);
    }
  }

  /**
   * Store task result
   *
   * @param taskId - The task identifier
   * @param description - Task description
   * @param output - Task execution output
   * @param agentRole - Agent that executed the task
   */
  async storeTaskResult(
    taskId: string,
    description: string,
    output: unknown,
    agentRole: string
  ): Promise<void> {
    const session = await this.getSession();
    const key = `${this.keyPrefix}:task:${taskId}`;

    const result: TaskResult = {
      taskId,
      taskDescription: description,
      output,
      agentRole,
      timestamp: Date.now(),
    };

    await session.set(key, result as unknown as Record<string, unknown>);

    if (this.autoCheckpoint) {
      await session.checkpoint(`task-${taskId}-complete`);
    }
  }

  /**
   * Get memories for a specific agent
   *
   * @param agentRole - The agent's role identifier
   */
  async getAgentContext(agentRole: string): Promise<AgentContext> {
    const session = await this.getSession();

    // Get agent output by exact key (getMany does not support wildcards)
    const agentKeys = [`${this.keyPrefix}:agent:${agentRole}:output`];
    const outputs = await session.getMany(agentKeys);

    return {
      agentRole,
      previousOutputs: outputs,
      memories: Object.entries(outputs).map(([key, value]) => ({
        key,
        value,
        timestamp: Date.now(),
      })),
    };
  }

  /**
   * Get memories to share with the next agent (handoff)
   *
   * @param fromAgent - Source agent role
   * @param toAgent - Target agent role
   */
  async getHandoffContext(fromAgent: string, toAgent: string): Promise<Record<string, unknown>> {
    const session = await this.getSession();
    const fromKey = `${this.keyPrefix}:agent:${fromAgent}:output`;

    try {
      const output = await session.get(fromKey);
      return { [fromAgent]: output.value };
    } catch {
      return {};
    }
  }

  /**
   * Generate a handoff summary for the next agent
   *
   * @param fromAgent - Source agent role
   * @param toAgent - Target agent role
   * @param nextGoals - Goals for the next agent
   */
  async generateHandoff(
    fromAgent: string,
    toAgent: string,
    nextGoals?: string[]
  ): Promise<HandoffResult> {
    const session = await this.getSession();

    const handoff = await session.handoff({
      keys: [`${this.keyPrefix}:agent:${fromAgent}:output`],
      nextGoals,
    });

    return handoff;
  }

  /**
   * Get all memories for the crew (CREWAI-compatible format)
   */
  async getAllMemories(): Promise<CrewMemory> {
    const snapshot = await this.getMatchingState(`${this.keyPrefix}:*`);

    const memories: string[] = [];

    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === 'object' && value !== null) {
        const entry = value as Record<string, unknown>;
        if ('value' in entry) {
          memories.push(JSON.stringify(entry.value));
        } else {
          memories.push(`${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    return { memories };
  }

  /**
   * Get memories formatted as context string
   */
  async getContextString(maxMemories?: number): Promise<string> {
    const { memories } = await this.getAllMemories();

    if (maxMemories && memories.length > maxMemories) {
      return memories.slice(-maxMemories).join('\n\n');
    }

    return memories.join('\n\n');
  }

  /**
   * Store a shared memory accessible by all agents
   */
  async storeSharedMemory(key: string, value: unknown): Promise<void> {
    const session = await this.getSession();
    const fullKey = `${this.keyPrefix}:shared:${key}`;

    await session.set(fullKey, value as Record<string, unknown>);

    if (this.autoCheckpoint) {
      await session.checkpoint(`shared-${key}`);
    }
  }

  /**
   * Get shared memory
   */
  async getSharedMemory(key: string): Promise<unknown> {
    const session = await this.getSession();
    const fullKey = `${this.keyPrefix}:shared:${key}`;

    try {
      const result = await session.get(fullKey);
      return result.value;
    } catch {
      return null;
    }
  }

  /**
   * Get all shared memories
   */
  async getAllSharedMemories(): Promise<Record<string, unknown>> {
    return this.getMatchingState(`${this.keyPrefix}:shared:*`);
  }

  /**
   * Create a CREWAI-compatible memory object
   *
   * Returns a memory instance that CREWAI can use directly.
   * The memory is backed by Context Router for persistence.
   *
   * Example:
   * ```typescript
   * const memory = new ContextRouterMemory({ workspaceName: 'my-project' });
   * const crewMemory = memory.crewaiMemory();
   *
   * const crew = new Crew({
   *   agents: [researcher, writer],
   *   tasks: [researchTask, writeTask],
   *   memory: crewMemory,
   * });
   * ```
   */
  crewaiMemory(): CrewMemoryAdapter {
    return new CrewMemoryAdapter(this);
  }

  /**
   * List all agents that have stored outputs
   */
  async listAgents(): Promise<string[]> {
    const snapshot = await this.getMatchingState(`${this.keyPrefix}:agent:*`);

    const agents = new Set<string>();
    const agentKeyPrefix = `${this.keyPrefix}:agent:`;
    const agentKeySuffix = ':output';
    for (const key of Object.keys(snapshot)) {
      if (key.startsWith(agentKeyPrefix) && key.endsWith(agentKeySuffix)) {
        const role = key.slice(
          agentKeyPrefix.length,
          key.length - agentKeySuffix.length
        );
        if (role.length > 0 && !role.includes(':')) {
          agents.add(role);
        }
      }
    }

    return Array.from(agents);
  }

  /**
   * List all task results
   */
  async listTasks(): Promise<TaskResult[]> {
    const snapshot = await this.getMatchingState(`${this.keyPrefix}:task:*`);

    const results: TaskResult[] = [];
    for (const [key, value] of Object.entries(snapshot)) {
      if (key.includes(':task:')) {
        results.push(value as unknown as TaskResult);
      }
    }

    return results;
  }

  /**
   * Clear all memories (use with caution)
   */
  async clear(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.complete();
    }
    this.sessions.clear();
    this.currentSession = null;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.clear();
    if (this.router) {
      await this.router.close();
    }
  }
}

/**
 * CREWAI-compatible memory adapter
 *
 * Wraps ContextRouterMemory to provide the interface CREWAI expects.
 */
export class CrewMemoryAdapter {
  constructor(private memory: ContextRouterMemory) {}

  /**
   * Get memories in CREWAI format
   */
  async load(): Promise<CrewMemory> {
    return this.memory.getAllMemories();
  }

  /**
   * Save memories (called by CREWAI after agent execution)
   */
  async save(memory: CrewMemory): Promise<void> {
    // Store each memory entry
    for (let i = 0; i < memory.memories.length; i++) {
      await this.memory.storeSharedMemory(`memory_${i}`, memory.memories[i]);
    }
  }

  /**
   * Get context string for agent prompts
   */
  async getContext(): Promise<string> {
    return this.memory.getContextString();
  }

  /**
   * Store agent output
   */
  async storeAgentOutput(agentRole: string, output: unknown): Promise<void> {
    await this.memory.storeAgentOutput(agentRole, output);
  }

  /**
   * Get agent context
   */
  async getAgentContext(agentRole: string): Promise<AgentContext> {
    return this.memory.getAgentContext(agentRole);
  }
}

/**
 * Create a CREWAI adapter instance
 *
 * Factory function that creates a configured CREWAI adapter.
 *
 * @example
 * ```typescript
 * import { createCrewAdapter } from '@context-router/crewai-adapter';
 *
 * const adapter = createCrewAdapter({
 *   workspaceName: 'my-project',
 *   autoCheckpoint: true,
 * });
 *
 * // Use with crew
 * const crew = new Crew({
 *   agents,
 *   tasks,
 *   memory: adapter.getMemory().crewaiMemory(),
 * });
 * ```
 */
export function createCrewAdapter(config?: CrewAdapterConfig): CrewAIAdapter {
  const memory = new ContextRouterMemory(config);
  return new CrewAIAdapter(memory);
}

/**
 * High-level CREWAI adapter
 *
 * Provides a complete interface for CREWAI integration with Context Router.
 */
export class CrewAIAdapter {
  private memory: ContextRouterMemory;
  private memoryAdapter: CrewMemoryAdapter;

  constructor(memory: ContextRouterMemory) {
    this.memory = memory;
    this.memoryAdapter = new CrewMemoryAdapter(memory);
  }

  /**
   * Get the ContextRouterMemory instance for direct access
   */
  getMemory(): ContextRouterMemory {
    return this.memory;
  }

  /**
   * Get the CREWAI-compatible memory adapter
   */
  getCrewMemory(): CrewMemoryAdapter {
    return this.memoryAdapter;
  }

  /**
   * Get context for an agent
   */
  async getAgentContext(agentRole: string): Promise<AgentContext> {
    return this.memory.getAgentContext(agentRole);
  }

  /**
   * Store agent output
   */
  async storeAgentOutput(
    agentRole: string,
    output: unknown,
    taskId?: string
  ): Promise<void> {
    return this.memory.storeAgentOutput(agentRole, output, taskId);
  }

  /**
   * Store task result
   */
  async storeTaskResult(
    taskId: string,
    description: string,
    output: unknown,
    agentRole: string
  ): Promise<void> {
    return this.memory.storeTaskResult(taskId, description, output, agentRole);
  }

  /**
   * Generate handoff between agents
   */
  async generateHandoff(
    fromAgent: string,
    toAgent: string,
    nextGoals?: string[]
  ): Promise<HandoffResult> {
    return this.memory.generateHandoff(fromAgent, toAgent, nextGoals);
  }

  /**
   * Get all crew memories
   */
  async getAllMemories(): Promise<CrewMemory> {
    return this.memory.getAllMemories();
  }

  /**
   * Get context string
   */
  async getContextString(maxMemories?: number): Promise<string> {
    return this.memory.getContextString(maxMemories);
  }

  /**
   * Get shared memory
   */
  async getSharedMemory(key: string): Promise<unknown> {
    return this.memory.getSharedMemory(key);
  }

  /**
   * Store shared memory
   */
  async storeSharedMemory(key: string, value: unknown): Promise<void> {
    return this.memory.storeSharedMemory(key, value);
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<string[]> {
    return this.memory.listAgents();
  }

  /**
   * List all tasks
   */
  async listTasks(): Promise<TaskResult[]> {
    return this.memory.listTasks();
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    await this.memory.close();
  }
}

/**
 * Helper to wrap a CREWAI task with memory tracking
 *
 * Example:
 * ```typescript
 * const trackedTask = withMemoryTracking(
 *   researchTask,
 *   adapter,
 *   { agentRole: 'researcher' }
 * );
 * ```
 */
export function withMemoryTracking(
  task: { id: string; description: string },
  adapter: CrewAIAdapter,
  options: { agentRole: string }
): typeof task & { _memoryTracked: true } {
  // Return task with tracking metadata
  return {
    ...task,
    _memoryTracked: true as const,
  };
}

/**
 * Create a memory-based agent callback
 *
 * Example:
 * ```typescript
 * const memoryEnhancedAgent = withAgentMemory(
 *   baseAgent,
 *   adapter,
 *   { role: 'researcher' }
 * );
 * ```
 */
export function withAgentMemory<T extends object>(
  agent: T,
  adapter: CrewAIAdapter,
  options: { role: string }
): T {
  // Attach memory helpers to agent
  return {
    ...agent,
    _memoryRole: options.role,
    _storeOutput: async (output: unknown) => {
      await adapter.storeAgentOutput(options.role, output);
    },
    _getContext: async () => {
      return adapter.getAgentContext(options.role);
    },
  } as T;
}

/**
 * Filter a state snapshot to keys matching an exact key or trailing-* prefix glob.
 */
function filterKeysByPattern(
  snapshot: Record<string, unknown>,
  pattern: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const isPrefix = pattern.endsWith('*');
  const prefix = isPrefix ? pattern.slice(0, -1) : pattern;

  for (const [key, value] of Object.entries(snapshot)) {
    if (isPrefix ? key.startsWith(prefix) : key === pattern) {
      result[key] = value;
    }
  }

  return result;
}

export default ContextRouterMemory;
