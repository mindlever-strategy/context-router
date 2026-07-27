/**
 * Event Journal Service
 *
 * Provides the core functionality for recording, querying, and replaying
 * workflow events. The journal is an append-only audit trail that records
 * every state mutation, step execution, checkpoint, and handoff.
 */

import type { Prisma } from '../generated/postgresql/client.js';
import { prisma } from '../db/client.js';
import type { EventType } from './event-types.js';
import type { EventMetadata } from './event-payloads.js';

export interface JournalQueryParams {
  workspaceId: string;
  workflowId?: string;
  eventTypes?: EventType[];
  since?: Date;
  until?: Date;
  agentId?: string;
  limit?: number;
  cursor?: { sequence: number };
  order?: 'asc' | 'desc';
}

export interface JournalEntry {
  id: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
  sequence: number;
  createdAt: Date;
}

export interface JournalQueryResult {
  entries: JournalEntry[];
  nextCursor?: { sequence: number };
  hasMore: boolean;
}

export interface JournalStats {
  totalEvents: number;
  byEventType: Record<string, number>;
  byWorkflow: Record<string, number>;
  timeRange: { oldest: Date; newest: Date } | null;
}

export interface JournalExportParams {
  workflowId?: string;
  since?: Date;
  until?: Date;
  format?: 'json' | 'jsonl';
}

/**
 * Journal Service
 *
 * Provides core journal operations:
 * - append: Record a new event
 * - query: Query events with filters
 * - replay: Reconstruct state by replaying events
 * - stats: Get journal statistics
 * - export: Export events for compliance
 */
export class JournalService {
  /**
   * Append a new event to the journal
   *
   * @param workspaceId - The workspace ID
   * @param workflowId - The workflow ID
   * @param eventType - The type of event
   * @param payload - The event-specific payload data
   * @param metadata - Additional metadata to include
   * @returns The created entry with its ID and sequence number
   */
  async append(
    workspaceId: string,
    workflowId: string,
    eventType: EventType,
    payload: Record<string, unknown>,
    metadata: Partial<EventMetadata> = {},
  ): Promise<{ id: string; sequence: number }> {
    // Get current max sequence for this workflow
    const maxSequence = await prisma.eventJournalEntry.aggregate({
      where: { workspaceId, workflowId },
      _max: { sequence: true },
    });

    const nextSequence = (maxSequence._max.sequence ?? 0) + 1;

    const entry = await prisma.eventJournalEntry.create({
      data: {
        workspaceId,
        workflowId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        metadata: {
          workspaceId,
          workflowId,
          timestamp: new Date().toISOString(),
          ...metadata,
        } as unknown as Prisma.InputJsonValue,
        sequence: nextSequence,
      },
    });

    return { id: entry.id, sequence: entry.sequence };
  }

  /**
   * Query events from the journal with filters
   *
   * @param params - Query parameters
   * @returns Matching entries with pagination info
   */
  async query(params: JournalQueryParams): Promise<JournalQueryResult> {
    const where: Prisma.EventJournalEntryWhereInput = {
      workspaceId: params.workspaceId,
    };

    if (params.workflowId) {
      where.workflowId = params.workflowId;
    }

    if (params.eventTypes?.length) {
      where.eventType = { in: params.eventTypes };
    }

    if (params.since || params.until) {
      where.createdAt = {};
      if (params.since) where.createdAt.gte = params.since;
      if (params.until) where.createdAt.lte = params.until;
    }

    // Filter by agentId if provided (stored in metadata JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (params.agentId) {
      (where as any).metadata = {
        path: ['agentId'],
        string_equals: params.agentId,
      };
    }

    // Apply cursor for pagination
    if (params.cursor) {
      where.sequence =
        params.order === 'asc'
          ? { gt: params.cursor.sequence }
          : { lt: params.cursor.sequence };
    }

    const limit = params.limit ?? 100;
    const entries = await prisma.eventJournalEntry.findMany({
      where,
      orderBy: { sequence: params.order === 'asc' ? 'asc' : 'desc' },
      take: limit + 1, // Fetch one extra to determine if there are more
    });

    const hasMore = entries.length > limit;
    const results = hasMore ? entries.slice(0, -1) : entries;

    return {
      entries: results.map((e) => ({
        id: e.id,
        eventType: e.eventType as EventType,
        payload: e.payload as Record<string, unknown>,
        metadata: e.metadata as unknown as EventMetadata,
        sequence: e.sequence,
        createdAt: e.createdAt,
      })),
      nextCursor: hasMore
        ? { sequence: results[results.length - 1].sequence }
        : undefined,
      hasMore,
    };
  }

  /**
   * Replay events to reconstruct workflow state
   *
   * Applies state mutations in sequence order to build up the state.
   * Only handles state_written and state_deleted events.
   *
   * @param workspaceId - The workspace ID
   * @param workflowId - The workflow ID
   * @param untilSequence - Only replay events up to this sequence number
   * @returns The reconstructed state
   */
  async replay(
    workspaceId: string,
    workflowId: string,
    untilSequence?: number,
  ): Promise<Record<string, unknown>> {
    const where: Prisma.EventJournalEntryWhereInput = {
      workspaceId,
      workflowId,
    };

    if (untilSequence !== undefined) {
      where.sequence = { lte: untilSequence };
    }

    const entries = await prisma.eventJournalEntry.findMany({
      where,
      orderBy: { sequence: 'asc' },
    });

    // Apply events in sequence order
    const state: Record<string, unknown> = {};

    for (const entry of entries) {
      const payload = entry.payload as Record<string, unknown>;

      switch (entry.eventType as EventType) {
        case 'state_written':
          state[payload.key as string] = payload.newValue;
          break;
        case 'state_deleted':
          delete state[payload.key as string];
          break;
        // Other event types don't affect state reconstruction
      }
    }

    return state;
  }

  /**
   * Get journal statistics for a workspace
   *
   * @param workspaceId - The workspace ID
   * @param options - Optional filters
   * @returns Statistics including total events, breakdown by type, etc.
   */
  async getStats(
    workspaceId: string,
    options?: {
      workflowId?: string;
      since?: Date;
    },
  ): Promise<JournalStats> {
    const where: Prisma.EventJournalEntryWhereInput = { workspaceId };

    if (options?.workflowId) {
      where.workflowId = options.workflowId;
    }
    if (options?.since) {
      where.createdAt = { gte: options.since };
    }

    const [total, byType, byWorkflow, oldest, newest] = await Promise.all([
      prisma.eventJournalEntry.count({ where }),
      prisma.eventJournalEntry.groupBy({
        by: ['eventType'],
        where,
        _count: true,
      }),
      prisma.eventJournalEntry.groupBy({
        by: ['workflowId'],
        where,
        _count: true,
      }),
      prisma.eventJournalEntry.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.eventJournalEntry.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      totalEvents: total,
      byEventType: Object.fromEntries(
        byType.map((t) => [t.eventType, t._count]),
      ),
      byWorkflow: Object.fromEntries(
        byWorkflow.map((w) => [w.workflowId, w._count]),
      ),
      timeRange:
        oldest && newest
          ? { oldest: oldest.createdAt, newest: newest.createdAt }
          : null,
    };
  }

  /**
   * Export journal events
   *
   * @param workspaceId - The workspace ID
   * @param params - Export parameters
   * @returns The exported data as a string
   */
  async export(
    workspaceId: string,
    params: JournalExportParams,
  ): Promise<{ data: string; contentType: string; size: number }> {
    const entries = await this.query({
      workspaceId,
      workflowId: params.workflowId,
      since: params.since,
      until: params.until,
      limit: 10000,
      order: 'asc',
    });

    const format = params.format ?? 'json';
    let data: string;

    if (format === 'jsonl') {
      data = entries.entries.map((e) => JSON.stringify(e)).join('\n');
    } else {
      data = JSON.stringify(entries.entries, null, 2);
    }

    return {
      data,
      contentType: format === 'jsonl' ? 'application/jsonl' : 'application/json',
      size: data.length,
    };
  }

  /**
   * Check if journaling is enabled for a workspace
   *
   * @param workspaceId - The workspace ID
   * @returns Whether journaling is enabled
   */
  async isEnabled(workspaceId: string): Promise<boolean> {
    // Check environment variable first
    if (process.env.JOURNAL_ENABLED === 'false') {
      return false;
    }

    // Check workspace setting
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { journalEnabled: true },
    });

    return workspace?.journalEnabled ?? true;
  }

  /**
   * Get the current sequence number for a workflow
   *
   * @param workspaceId - The workspace ID
   * @param workflowId - The workflow ID
   * @returns The current max sequence or 0 if no events exist
   */
  async getCurrentSequence(
    workspaceId: string,
    workflowId: string,
  ): Promise<number> {
    const maxSequence = await prisma.eventJournalEntry.aggregate({
      where: { workspaceId, workflowId },
      _max: { sequence: true },
    });
    return maxSequence._max.sequence ?? 0;
  }
}

// Singleton instance for convenience
export const journalService = new JournalService();
