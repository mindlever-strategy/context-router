/**
 * Context Router - LangGraph Adapter
 *
 * Bridges LangGraph workflows with Context Router's structured state management.
 *
 * Benefits:
 * - Persistent state across LangGraph runs
 * - Checkpoint/restore without LangGraph's checkpointing
 * - Selective context reads (handoffs) between nodes
 * - Workspace isolation for multi-tenant deployments
 *
 * Usage:
 * ```typescript
 * import { createContextRouterChecker } from '@context-router/langgraph-adapter';
 *
 * const checker = createContextRouterChecker();
 *
 * const graph = new StateGraph({ channels: {} })
 *   .addNode('research', researchNode)
 *   .addNode('write', writeNode)
 *   .addEdge('research', 'write')
 *   .addConditionalEdges('write', shouldContinue)
 *   .compile({ checkpointer: checker });
 * ```
 */

import { ContextRouter, WorkflowSession, type StateValue } from '@context-router/sdk';
import { randomUUID } from 'node:crypto';

// Re-export types for convenience
export type { StateValue };

/**
 * Configuration for the Context Router checkpointer
 */
export interface ContextRouterCheckerConfig {
  /** Optional workspace name for isolation. Defaults to 'langgraph' */
  workspaceName?: string;
  /** Optional Context Router instance. Creates new one if not provided */
  router?: ContextRouter;
  /** Auto-create checkpoint after each node (default: true) */
  autoCheckpoint?: boolean;
}

/**
 * LangGraph-style thread ID for workflow isolation
 */
export interface ThreadConfig {
  /** Thread/thread_id for LangGraph compatibility */
  thread_id?: string;
  /** Optional checkpoint ID to resume from */
  checkpoint_id?: string;
}

/** Checkpoint record returned by Context Router */
interface CheckpointRecord {
  id: string;
  label?: string;
  createdAt?: string;
}

/**
 * Process-wide default checkpointer so helper functions share one session map
 * (and therefore the same Context Router workflow) for a given thread.
 */
let defaultChecker: ContextRouterChecker | undefined;

function getDefaultChecker(): ContextRouterChecker {
  if (!defaultChecker) {
    defaultChecker = new ContextRouterChecker();
  }
  return defaultChecker;
}

/**
 * Resolve a checkpointer for helper APIs.
 * Prefer an explicitly passed checker (e.g. the compiled LangGraph checkpointer);
 * otherwise reuse the shared default instance.
 */
function resolveChecker(checker?: ContextRouterChecker): ContextRouterChecker {
  return checker ?? getDefaultChecker();
}

/** @internal — reset shared default (tests only) */
export function __resetDefaultCheckerForTests(): void {
  defaultChecker = undefined;
}

/** @internal — inject shared default (tests only) */
export function __setDefaultCheckerForTests(checker: ContextRouterChecker): void {
  defaultChecker = checker;
}

/**
 * Context Router Checkpointer for LangGraph
 *
 * Provides checkpoint/restore functionality using Context Router's
 * checkpoint system instead of LangGraph's built-in storage.
 */
export class ContextRouterChecker {
  private router: ContextRouter;
  private workspaceName: string;
  private autoCheckpoint: boolean;
  private sessions: Map<string, WorkflowSession> = new Map();
  /** Latest LangGraph checkpoint id per session key (workspace:thread) */
  private latestCheckpointIds: Map<string, string> = new Map();

  constructor(config: ContextRouterCheckerConfig = {}) {
    this.workspaceName = config.workspaceName ?? 'langgraph';
    this.autoCheckpoint = config.autoCheckpoint ?? true;
    // Note: In production, pass an existing router or use ContextRouter.local()
    // This is stored as any for flexibility with workspace:* dependency
    this.router = config.router as any;
  }

  private sessionKey(threadId: string): string {
    return `${this.workspaceName}:${threadId}`;
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
   * Get or create a workflow session for a thread.
   * Reuses the same session (and Context Router workflow) for a given thread.
   */
  async getSessionDetails(threadId: string): Promise<{
    session: WorkflowSession;
    router: ContextRouter;
  }> {
    const key = this.sessionKey(threadId);

    if (!this.sessions.has(key)) {
      const router = await this.getRouter();
      const session = await router.start(`${this.workspaceName}-${threadId}`);
      this.sessions.set(key, session);
    }

    const session = this.sessions.get(key)!;
    const router = await this.getRouter();
    return { session, router };
  }

  /**
   * Get a checkpoint (retrieve state from Context Router)
   */
  async get(config: ThreadConfig): Promise<{ data: Record<string, unknown>; config: Record<string, unknown> } | null> {
    const threadId = config?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required for Context Router checkpointer');
    }

    try {
      const key = this.sessionKey(threadId);
      const { session } = await this.getSessionDetails(threadId);
      const snapshot = await session.getMany(['__state__']);

      if (!snapshot['__state__']) {
        return null; // No checkpoint exists
      }

      return {
        data: snapshot['__state__'] as Record<string, unknown>,
        config: {
          thread_id: threadId,
          checkpoint_id: this.latestCheckpointIds.get(key) ?? config.checkpoint_id,
        },
      };
    } catch (error) {
      if ((error as any)?.code === 'STATE_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Put a checkpoint (store state in Context Router)
   */
  async put(
    config: ThreadConfig,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const threadId = config?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required for Context Router checkpointer');
    }

    const key = this.sessionKey(threadId);
    const { session } = await this.getSessionDetails(threadId);

    // Store the entire graph state as a single key
    await session.set('__state__', data);

    // LangGraph expects a unique checkpoint_id per put — use the real CR checkpoint id
    let checkpointId: string;
    if (this.autoCheckpoint) {
      const checkpoint = (await session.checkpoint(
        `checkpoint-${Date.now()}`
      )) as CheckpointRecord;
      checkpointId = checkpoint.id;
    } else {
      checkpointId = randomUUID();
    }

    this.latestCheckpointIds.set(key, checkpointId);

    return {
      thread_id: threadId,
      checkpoint_id: checkpointId,
    };
  }

  /**
   * List available checkpoints for a thread
   */
  async list(config: ThreadConfig): Promise<Array<{ id: string; metadata?: unknown }>> {
    const threadId = config?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required');
    }

    try {
      const { session, router } = await this.getSessionDetails(threadId);
      const checkpoints = await router.checkpoint.list(
        session.workspace.id,
        session.workflow.id
      ) as Array<{ id: string; label?: string; createdAt: string }>;

      return checkpoints.map((cp) => ({
        id: cp.id,
        metadata: { label: cp.label, createdAt: cp.createdAt },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Restore from a specific checkpoint
   */
  async restore(config: ThreadConfig & { checkpoint_id: string }): Promise<void> {
    const { thread_id, checkpoint_id } = config;
    if (!thread_id || !checkpoint_id) {
      throw new Error('thread_id and checkpoint_id are required');
    }

    const { session, router } = await this.getSessionDetails(thread_id);
    await router.checkpoint.restore(session.workspace.id, checkpoint_id);
  }

  /**
   * Close all sessions and connections
   */
  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.complete();
    }
    this.sessions.clear();
    this.latestCheckpointIds.clear();
    if (this.router) {
      await this.router.close();
    }
  }
}

/**
 * Create a Context Router checkpointer for LangGraph
 */
export function createContextRouterChecker(config?: ContextRouterCheckerConfig): ContextRouterChecker {
  return new ContextRouterChecker(config);
}

/**
 * LangGraph node that reads from Context Router
 *
 * Example:
 * ```typescript
 * const researchNode: NodeLike = async (state, config) => {
 *   const ctxState = await contextRouterNode(state, config, {
 *     keys: ['research_query'],  // Only read these keys
 *     nodeName: 'research'
 *   });
 *   // ... process and return updated state
 * };
 * ```
 */
export interface ContextRouterNodeOptions {
  /** Keys to read from Context Router (selective context) */
  keys?: string[];
  /** Node name for logging/checkpoint labels */
  nodeName?: string;
  /**
   * Shared checkpointer (e.g. the one passed to `graph.compile`).
   * When omitted, helpers reuse a process-wide default instance so
   * reads/writes for the same thread stay on one workflow.
   */
  checker?: ContextRouterChecker;
}

export async function contextRouterNode(
  graphState: Record<string, unknown>,
  config: ThreadConfig,
  options: ContextRouterNodeOptions = {}
): Promise<Partial<Record<string, unknown>>> {
  const { keys, nodeName = 'node', checker: checkerOpt } = options;

  try {
    const checker = resolveChecker(checkerOpt);
    const { session } = await checker.getSessionDetails(config.thread_id!);

    if (keys && keys.length > 0) {
      const selected = await session.getMany(keys);
      return selected as Partial<Record<string, unknown>>;
    }

    // Return full state snapshot
    const snapshot = await session.getMany(['__state__']);
    return snapshot['__state__'] as Partial<Record<string, unknown>>;
  } catch (error) {
    console.warn(`[${nodeName}] Context Router read failed:`, error);
    return {};
  }
}

/**
 * LangGraph node that writes to Context Router
 *
 * Example:
 * ```typescript
 * const writeNode: NodeLike = async (state, config) => {
 *   const updated = { ...state, draft: 'Generated content...' };
 *   await writeContextRouterNode(updated, config, { nodeName: 'write' });
 *   return updated;
 * };
 * ```
 */
export async function writeContextRouterNode(
  graphState: Record<string, unknown>,
  config: ThreadConfig,
  options: ContextRouterNodeOptions = {}
): Promise<void> {
  const { nodeName = 'node', checker: checkerOpt } = options;

  try {
    const checker = resolveChecker(checkerOpt);
    const { session } = await checker.getSessionDetails(config.thread_id!);
    await session.set('__state__', graphState);
    await session.checkpoint(`${nodeName}-completed`);
  } catch (error) {
    console.warn(`[${nodeName}] Context Router write failed:`, error);
  }
}

/**
 * Generate a handoff summary for the next agent in the chain
 *
 * Example:
 * ```typescript
 * const supervisorNode: NodeLike = async (state, config) => {
 *   const handoff = await generateHandoff(state, config, {
 *     keys: ['analysis', 'findings'],
 *     maxTokens: 500,
 *     nextGoals: ['Write the report', 'Review for errors']
 *   });
 *   return { ...state, handoff_summary: handoff.summary };
 * };
 * ```
 */
export async function generateHandoff(
  graphState: Record<string, unknown>,
  config: ThreadConfig,
  options: {
    /** State keys to include in handoff */
    keys?: string[];
    /** Max tokens for the summary */
    maxTokens?: number;
    /** Goals for the next agent */
    nextGoals?: string[];
    /** Shared checkpointer — see ContextRouterNodeOptions.checker */
    checker?: ContextRouterChecker;
  } = {}
): Promise<{ summary: string; keysIncluded: string[]; packet?: unknown }> {
  const { keys, maxTokens = 300, nextGoals = [], checker: checkerOpt } = options;

  try {
    const checker = resolveChecker(checkerOpt);
    const { session } = await checker.getSessionDetails(config.thread_id!);

    // Store current state first
    await session.set('__state__', graphState);

    // Generate handoff
    const handoff = await session.handoff({
      keys: keys ?? ['__state__'],
      maxTokens,
      nextGoals,
    });

    return {
      summary: handoff.summary,
      keysIncluded: handoff.keysIncluded,
      packet: handoff.packet,
    };
  } catch (error) {
    console.warn('Handoff generation failed:', error);
    return {
      summary: JSON.stringify(graphState).substring(0, maxTokens),
      keysIncluded: [],
    };
  }
}

/**
 * Helper to create a LangGraph state channel that syncs with Context Router
 *
 * Usage in StateGraph:
 * ```typescript
 * import { contextRouterChannel } from '@context-router/langgraph-adapter';
 *
 * const graph = new StateGraph({
 *   channels: {
 *     ...MANDATORY_CHANNELS,
 *     context_router: contextRouterChannel('thread_id_123'),
 *   }
 * })
 * ```
 */
export function contextRouterChannel(
  threadId: string,
  checker?: ContextRouterChecker
) {
  // Capture once so reader/writer share the same session map (same workflow)
  const shared = resolveChecker(checker);

  return {
    __type__: 'channel',
    reader: async () => {
      const { session } = await shared.getSessionDetails(threadId);
      const snapshot = await session.getMany(['__state__']);
      return snapshot['__state__'] ?? {};
    },
    writer: async (value: Record<string, unknown>) => {
      const { session } = await shared.getSessionDetails(threadId);
      await session.set('__state__', value);
    },
  };
}

export default ContextRouterChecker;
