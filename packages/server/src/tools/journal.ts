/**
 * Event Journal MCP Tools
 *
 * Provides MCP tools for querying, appending, and analyzing the event journal.
 * journal_query supports multiple views: entries, replay, stats, export, sequence.
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { journalService } from '../services/journal-service.js';
import { journaledJournalExport, recordJournalDrop } from '../services/journal-hooks.js';
import type { EventType } from '../services/event-types.js';
import { EVENT_TYPE_VALUES } from '../services/event-types.js';
import { snapshotValues } from '../services/checkpoint-format.js';
import { defineTool, ToolOperationError, uuid, type ToolRegistry } from './tool-kit.js';
import type { Prisma } from '@prisma/client';

/**
 * Register all journal tools with the MCP server
 */
export function registerJournalTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  // =========================================================================
  // journal_query - Query events with filters and view modes
  // =========================================================================
  tools.set(
    'journal_query',
    defineTool(
      {
        name: 'journal_query',
        description:
          'Query the event journal with filters. Supports multiple views: entries (raw rows), replay (state rebuilt from events), stats (counts by type), export (serialized entries), sequence (current sequence number).',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: {
              type: 'string',
              description: 'Filter to a specific workflow',
            },
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
            view: {
              type: 'string',
              enum: ['entries', 'replay', 'stats', 'export', 'sequence'],
              description: 'entries: raw journal rows (default). replay: state rebuilt from events. stats: counts by event type. export: serialized entries. sequence: current sequence number.',
            },
            untilSequence: {
              type: 'number',
              description: 'replay view: stop at this sequence number',
            },
            exportFormat: {
              type: 'string',
              enum: ['json', 'jsonl'],
              description: 'export view: output serialization',
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
        view: z
          .enum(['entries', 'replay', 'stats', 'export', 'sequence'])
          .default('entries'),
        untilSequence: z.number().int().min(1).optional(),
        exportFormat: z.enum(['json', 'jsonl']).default('json'),
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
        view,
        untilSequence,
        exportFormat,
      }) => {
        // Decode cursor if provided
        let parsedCursor: { sequence: number } | undefined;
        if (cursor) {
          try {
            const decoded = JSON.parse(
              Buffer.from(cursor, 'base64').toString(),
            );
            if (typeof decoded !== 'object' || decoded === null || typeof decoded.sequence !== 'number') {
              throw new Error('Invalid cursor format');
            }
            parsedCursor = decoded as { sequence: number };
          } catch {
            throw new ToolOperationError(
              'CURSOR_INVALID',
              'cursor must be base64-encoded JSON with numeric sequence field',
            );
          }
        }

        // View: entries (default - raw journal rows)
        if (view === 'entries') {
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
        }

        // View: replay (reconstruct state)
        if (view === 'replay') {
          if (!workflowId) {
            throw new Error('VALIDATION_ERROR: workflowId is required for replay view');
          }
          const { prisma } = await import('../db/client.js');

          let initialState: Record<string, unknown> = {};

          if (untilSequence) {
            // Build checkpoint lookup filter - apply eventTypes if provided,
            // otherwise default to 'checkpoint_created' for backward compatibility
            const checkpointWhere: Prisma.EventJournalEntryWhereInput = {
              workspaceId,
              workflowId,
              sequence: { lte: untilSequence },
              eventType: 'checkpoint_created',
            };

            if (eventTypes && eventTypes.length > 0) {
              checkpointWhere.eventType = { in: eventTypes };
            }

            const entryAtSequence = await prisma.eventJournalEntry.findFirst({
              where: checkpointWhere,
              orderBy: { sequence: 'desc' },
            });

            if (entryAtSequence) {
              const payload = entryAtSequence.payload as { checkpointId?: string };
              if (payload.checkpointId) {
                const checkpoint = await prisma.checkpoint.findFirst({
                  where: { id: payload.checkpointId, workspaceId },
                });
                if (checkpoint) {
                  initialState = snapshotValues(checkpoint.snapshot);
                }
              }
            }
          }

          const state = await journalService.replay(
            workspaceId,
            workflowId,
            untilSequence,
            eventTypes as EventType[] | undefined,
            agentId,
          );

          return {
            state: { ...initialState, ...state },
            replayedSequence: untilSequence,
            currentSequence: untilSequence ?? (await journalService.getCurrentSequence(
              workspaceId,
              workflowId,
            )),
          };
        }

        // View: stats
        if (view === 'stats') {
          const stats = await journalService.getStats(workspaceId, {
            workflowId,
            eventTypes: eventTypes as EventType[] | undefined,
            agentId,
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
        }

        // View: export
        if (view === 'export') {
          const sinceDate = since ? new Date(since) : undefined;
          const untilDate = until ? new Date(until) : undefined;

          const result = await journalService.export(workspaceId, {
            workflowId,
            since: sinceDate,
            until: untilDate,
            format: exportFormat,
          });

          let entryCount: number;
          let parseError = false;
          if (exportFormat === 'jsonl') {
            entryCount = result.data.split('\n').filter(Boolean).length;
          } else {
            try {
              entryCount = JSON.parse(result.data).length;
            } catch {
              entryCount = 0;
              parseError = true;
            }
          }

          journaledJournalExport(
            workspaceId,
            workflowId ?? null,
            entryCount,
            exportFormat,
            {
              since: since ?? null,
              until: until ?? null,
            },
          ).catch((error) => {
            console.error('[journal] failed to record export:', error);
          });

          return {
            data: result.data,
            contentType: result.contentType,
            size: result.size,
            eventCount: entryCount,
            format: exportFormat,
            ...(parseError ? { parseError: true } : {}),
          };
        }

        // View: sequence
        if (!workflowId) {
          throw new Error('VALIDATION_ERROR: workflowId is required for sequence view');
        }
        // Warn about unsupported filters - sequence view doesn't support these
        if (eventTypes || agentId || since || until) {
          throw new ToolOperationError(
            'VALIDATION_ERROR',
            'sequence view does not support eventTypes, agentId, since, or until filters',
          );
        }
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
            workflowId: {
              type: 'string',
              description: 'The workflow this event belongs to',
            },
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

  return tools;
}
