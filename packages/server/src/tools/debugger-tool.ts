import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  WorkflowDebugger,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from './debugger.js';
import { defineTool, type ToolRegistry } from './tool-kit.js';

/**
 * Register the debugger tool with the MCP server
 */
export function registerDebuggerTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'debugger_inspect',
    defineTool(
      {
        name: 'debugger_inspect',
        description:
          'Visual workflow debugger: list workflows, inspect workflow state at checkpoints, diff checkpoints, and take a single-shot tail snapshot. Use action "list" to show all workflows, "inspect" to see workflow details with checkpoints, "diff" to compare two checkpoints, or "tail" for a one-poll snapshot of current state/checkpoints (does not block).',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'inspect', 'diff', 'tail'],
              description: 'Debugger action to perform',
            },
            workflowId: {
              type: 'string',
              format: 'uuid',
              description: 'Workflow ID (required for inspect, diff, tail)',
            },
            checkpointId1: {
              type: 'string',
              format: 'uuid',
              description: 'First checkpoint ID for diff',
            },
            checkpointId2: {
              type: 'string',
              format: 'uuid',
              description: 'Second checkpoint ID for diff',
            },
            pollInterval: {
              type: 'number',
              minimum: MIN_POLL_INTERVAL_MS,
              maximum: MAX_POLL_INTERVAL_MS,
              description: `Poll interval in ms for tail (default: ${DEFAULT_POLL_INTERVAL_MS}, allowed: ${MIN_POLL_INTERVAL_MS}–${MAX_POLL_INTERVAL_MS}). MCP tail is single-shot; interval is reserved for CLI continuous mode.`,
            },
          },
          required: ['action'],
        },
      },
      z.object({
        action: z.enum(['list', 'inspect', 'diff', 'tail']),
        workflowId: z.string().uuid().optional(),
        checkpointId1: z.string().uuid().optional(),
        checkpointId2: z.string().uuid().optional(),
        pollInterval: z
          .number()
          .min(MIN_POLL_INTERVAL_MS)
          .max(MAX_POLL_INTERVAL_MS)
          .optional(),
      }).refine(
        (data) => {
          if (data.action === 'inspect' && !data.workflowId) return false;
          if (data.action === 'diff' && (!data.workflowId || !data.checkpointId1 || !data.checkpointId2)) return false;
          if (data.action === 'tail' && !data.workflowId) return false;
          return true;
        },
        {
          message: 'Missing required parameters for this action',
        },
      ),
      async ({ action, workflowId, checkpointId1, checkpointId2, pollInterval }) => {
        const ownerId = getCurrentUserId();
        const workflowDebugger = new WorkflowDebugger(ownerId);

        // Capture console output
        let output = '';
        const originalLog = console.log;
        const originalError = console.error;

        console.log = (...args: unknown[]) => {
          output += args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
          originalLog.apply(console, args);
        };

        console.error = (...args: unknown[]) => {
          output += args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
          originalError.apply(console, args);
        };

        try {
          switch (action) {
            case 'list':
              await workflowDebugger.listWorkflows();
              break;

            case 'inspect':
              if (!workflowId) {
                throw new Error('workflowId is required for inspect action');
              }
              await workflowDebugger.inspectWorkflow(workflowId);
              break;

            case 'diff':
              if (!workflowId || !checkpointId1 || !checkpointId2) {
                throw new Error('workflowId, checkpointId1, and checkpointId2 are required for diff action');
              }
              await workflowDebugger.diffCheckpoints(workflowId, checkpointId1, checkpointId2);
              break;

            case 'tail':
              if (!workflowId) {
                throw new Error('workflowId is required for tail action');
              }
              // MCP: single-shot snapshot only — never continuous loop or process.exit
              await workflowDebugger.tailWorkflow(workflowId, {
                intervalMs: pollInterval ?? DEFAULT_POLL_INTERVAL_MS,
                continuous: false,
              });
              break;

            default:
              throw new Error(`Unknown action: ${action}`);
          }

          return {
            output,
            action,
            workflowId,
          };
        } finally {
          // Restore console
          console.log = originalLog;
          console.error = originalError;
        }
      },
    ),
  );

  return tools;
}
