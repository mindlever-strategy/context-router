/**
 * Event Journal MCP Tools
 *
 * Provides MCP tools for querying, replaying, and exporting the event journal.
 * These tools enable debugging, auditing, and analytics on workflow events.
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { journalService } from '../services/journal-service.js';
import { journaledJournalExport, recordJournalDrop } from '../services/journal-hooks.js';
import type { EventType } from '../services/event-types.js';
import { EVENT_TYPE_VALUES } from '../services/event-types.js';
import { snapshotValues } from '../services/checkpoint-format.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

/**
 * Register all journal tools with the MCP server
 */
export function registerJournalTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  // =========================================================================
  // journal_query - Query events with filters
  // =========================================================================
  tools.set(
    'journal_query',
    defineTool(
      {
        name: 'journal_query',
        description:
          'Query the event journal with filters for debugging, auditing, or analytics. Returns events with pagination support.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            eventTypes: {
              type: 'array',
              description: 'Filter by event types',
              items: { type: 'string', enum: EVENT_TYPE_VALUES },
            },
            since: {
              type: 'string',
              description: 'Filter events after this ISO timestamp',
            },
            until: {
              type: 'string',
              description: 'Filter events before this ISO timestamp',
            },
            agentId: {
              type: 'string',
              description: 'Filter by agent ID',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 1000,
              default: 100,
              description: 'Maximum number of events to return',
            },
            cursor: {
              type: 'string',
              description: 'Pagination cursor (base64 encoded sequence number)',
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              default: 'desc',
              description: 'Sort order (asc = oldest first, desc = newest first)',
            },
          },
          required: ['workspaceId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid().optional(),
        eventTypes: z.array(z.enum(EVENT_TYPE_VALUES as [string, ...string[]])).optional(),
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
        agentId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(100).optional(),
        cursor: z.string().optional(),
        order: z.enum(['asc', 'desc']).default('desc').optional(),
      }),
      async ({
        workspaceId,
        workflowId,
        eventTypes,
        since,
        until,
        agentId,
        limit,
        cursor,
        order,
      }) => {
        // Decode cursor if provided
        let parsedCursor: { sequence: number } | undefined;
        if (cursor) {
          try {
            parsedCursor = JSON.parse(
              Buffer.from(cursor, 'base64').toString(),
            ) as { sequence: number };
          } catch {
            // Invalid cursor, ignore
          }
        }

        const result = await journalService.query({
          workspaceId,
          workflowId,
          eventTypes: eventTypes as EventType[] | undefined,
          since: since ? new Date(since) : undefined,
          until: until ? new Date(until) : undefined,
          agentId,
          limit,
          cursor: parsedCursor,
          order,
        });

        return {
          entries: result.entries,
          nextCursor: result.nextCursor
            ? Buffer.from(JSON.stringify(result.nextCursor)).toString('base64')
            : undefined,
          hasMore: result.hasMore,
          total: result.entries.length,
        };
      },
    ),
  );

  // =========================================================================
  // journal_replay - Reconstruct workflow state at a sequence point
  // =========================================================================
  tools.set(
    'journal_replay',
    defineTool(
      {
        name: 'journal_replay',
        description:
          'Reconstruct workflow state by replaying events up to a specific sequence number. Useful for debugging or state inspection.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            atSequence: {
              type: 'integer',
              minimum: 1,
              description: 'Replay events up to and including this sequence number',
            },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        atSequence: z.number().int().min(1).optional(),
      }),
      async ({ workspaceId, workflowId, atSequence }) => {
        // Import prisma here to avoid circular dependency
        const { prisma } = await import('../db/client.js');

        let initialState: Record<string, unknown> = {};

        // If atSequence is specified, find the latest checkpoint before or at that sequence
        if (atSequence) {
          // Get the journal entry at atSequence to find when it was created
          const entryAtSequence = await prisma.eventJournalEntry.findFirst({
            where: {
              workspaceId,
              workflowId,
              sequence: { lte: atSequence },
              eventType: 'checkpoint_created',
            },
            orderBy: { sequence: 'desc' },
          });

          if (entryAtSequence) {
            // Try to load the checkpoint snapshot from the payload
            const payload = entryAtSequence.payload as { checkpointId?: string };
            if (payload.checkpointId) {
              const checkpoint = await prisma.checkpoint.findUnique({
                where: { id: payload.checkpointId },
              });
              if (checkpoint) {
                initialState = snapshotValues(checkpoint.snapshot);
              }
            }
          }
        }

        // Replay events after the checkpoint
        const state = await journalService.replay(
          workspaceId,
          workflowId,
          atSequence,
        );

        return {
          state: { ...initialState, ...state },
          replayedSequence: atSequence,
          currentSequence: await journalService.getCurrentSequence(
            workspaceId,
            workflowId,
          ),
        };
      },
    ),
  );

  // =========================================================================
  // journal_stats - Get workflow/workspace statistics
  // =========================================================================
  tools.set(
    'journal_stats',
    defineTool(
      {
        name: 'journal_stats',
        description:
          'Get statistics about events in the journal including counts by type, workflow, and time range.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            since: {
              type: 'string',
              description: 'Filter stats to events after this ISO timestamp',
            },
          },
          required: ['workspaceId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
      }),
      async ({ workspaceId, workflowId, since }) => {
        const stats = await journalService.getStats(workspaceId, {
          workflowId,
          since: since ? new Date(since) : undefined,
        });

        return {
          totalEvents: stats.totalEvents,
          byEventType: stats.byEventType,
          byWorkflow: stats.byWorkflow,
          timeRange: stats.timeRange
            ? {
                oldest: stats.timeRange.oldest.toISOString(),
                newest: stats.timeRange.newest.toISOString(),
              }
            : null,
        };
      },
    ),
  );

  // =========================================================================
  // journal_export - Export events for compliance or backup
  // =========================================================================
  tools.set(
    'journal_export',
    defineTool(
      {
        name: 'journal_export',
        description:
          'Export the event journal for compliance, backup, or external analysis. Returns events in JSON or JSONL format.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            since: {
              type: 'string',
              description: 'Export events after this ISO timestamp',
            },
            until: {
              type: 'string',
              description: 'Export events before this ISO timestamp',
            },
            format: {
              type: 'string',
              enum: ['json', 'jsonl'],
              default: 'json',
              description: 'Export format (json = pretty printed, jsonl = newline delimited)',
            },
          },
          required: ['workspaceId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
        format: z.enum(['json', 'jsonl']).default('json').optional(),
      }),
      async ({ workspaceId, workflowId, since, until, format }) => {
        const sinceDate = since ? new Date(since) : undefined;
        const untilDate = until ? new Date(until) : undefined;

        const result = await journalService.export(workspaceId, {
          workflowId,
          since: sinceDate,
          until: untilDate,
          format,
        });

        // Journal the export operation itself (fire and forget)
        const entryCount = format === 'jsonl'
          ? result.data.split('\n').filter(Boolean).length
          : JSON.parse(result.data).length;

        journaledJournalExport(
          workspaceId,
          workflowId ?? 'unknown',
          entryCount,
          format ?? 'json',
          {
            since: since ?? new Date(0).toISOString(),
            until: until ?? new Date().toISOString(),
          },
        ).catch((error) => {
          recordJournalDrop('journal.exported', error);
        });

        return {
          data: result.data,
          contentType: result.contentType,
          size: result.size,
          eventCount: entryCount,
          format: format ?? 'json',
        };
      },
    ),
  );

  // =========================================================================
  // journal_append - Record a custom event (for external integrations)
  // =========================================================================
  tools.set(
    'journal_append',
    defineTool(
      {
        name: 'journal_append',
        description:
          'Append a custom event to the journal for external integrations or custom tracking. The event will be recorded with the current timestamp.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            eventType: {
              type: 'string',
              enum: EVENT_TYPE_VALUES,
              description: 'The type of event to record',
            },
            payload: {
              type: 'object',
              description: 'The event payload data',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata (agentId, source, etc.)',
            },
          },
          required: ['workspaceId', 'workflowId', 'eventType', 'payload'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        eventType: z.enum(EVENT_TYPE_VALUES as [string, ...string[]]),
        payload: z.record(z.string(), z.unknown()),
        metadata: z
          .object({
            agentId: z.string().optional(),
            source: z.string().optional(),
            userId: z.string().optional(),
          })
          .optional(),
      }),
      async ({ workspaceId, workflowId, eventType, payload, metadata }) => {
        const result = await journalService.append(
          workspaceId,
          workflowId,
          eventType as EventType,
          payload,
          metadata,
        );

        return {
          id: result.id,
          sequence: result.sequence,
          eventType,
          workspaceId,
          workflowId,
          timestamp: new Date().toISOString(),
        };
      },
    ),
  );

  // =========================================================================
  // journal_sequence - Get the current sequence number for a workflow
  // =========================================================================
  tools.set(
    'journal_sequence',
    defineTool(
      {
        name: 'journal_sequence',
        description:
          'Get the current sequence number for a workflow. Useful for tracking event count or creating cursors.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
      }),
      async ({ workspaceId, workflowId }) => {
        const sequence = await journalService.getCurrentSequence(
          workspaceId,
          workflowId,
        );

        return {
          workspaceId,
          workflowId,
          sequence,
          hasEvents: sequence > 0,
        };
      },
    ),
  );

  return tools;
}
