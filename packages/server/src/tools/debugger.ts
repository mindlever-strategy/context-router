/**
 * CLI-based Visual Workflow Debugger
 *
 * Provides terminal-friendly visualization for debugging workflows:
 * - List workflows with status
 * - Inspect workflow state at each checkpoint
 * - Diff checkpoints
 * - Tail workflow updates in real-time
 */

import {
  listCheckpoints,
  getWorkflow,
  readStateFields,
} from '../db/queries.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Status colors
  running: '\x1b[32m',    // green
  completed: '\x1b[34m', // blue
  failed: '\x1b[31m',    // red
};

// Box drawing characters
const box = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
};

interface Workflow {
  id: string;
  workspaceId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
}

interface Checkpoint {
  id: string;
  workflowId: string;
  label: string | null;
  createdAt: Date;
  snapshot: Record<string, unknown>;
}

interface WorkflowInfo {
  workflow: Workflow;
  checkpoints: Checkpoint[];
  currentState: Record<string, unknown>;
}

/** Poll interval bounds for tail (ms). */
export const MIN_POLL_INTERVAL_MS = 500;
export const MAX_POLL_INTERVAL_MS = 10000;
export const DEFAULT_POLL_INTERVAL_MS = 2000;

export interface TailWorkflowOptions {
  /** Poll interval in ms (clamped to 500–10000). Default 2000. */
  intervalMs?: number;
  /**
   * When true, keep polling until workflow ends, AbortSignal, or SIGINT.
   * Default false (single-shot snapshot) — safe for MCP; never hangs the server.
   */
  continuous?: boolean;
  /** Optional abort for continuous CLI tails (no process.exit). */
  signal?: AbortSignal;
}

/**
 * Clamp poll interval to the allowed range.
 */
export function clampPollInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, intervalMs));
}

/**
 * Get colored status string
 */
function statusColor(status: string): string {
  switch (status) {
    case 'RUNNING': return colors.running;
    case 'COMPLETED': return colors.completed;
    case 'FAILED': return colors.failed;
    default: return colors.white;
  }
}

/**
 * Get status icon
 */
function statusIcon(status: string): string {
  switch (status) {
    case 'RUNNING': return '▶';  // play
    case 'COMPLETED': return '✓'; // check
    case 'FAILED': return '✗';   // x
    default: return '?';
  }
}

/**
 * Format timestamp for display
 */
function formatTime(date: Date | string | null): string {
  if (!date) return colors.gray + 'not set' + colors.reset;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Print a box header
 */
function printBox(title: string, width: number = 60): void {
  console.log();
  console.log(colors.bold + colors.cyan + box.topLeft + box.horizontal.repeat(width - 2) + box.topRight + colors.reset);
  const padding = Math.max(0, width - 4 - title.length);
  console.log(colors.bold + colors.cyan + box.vertical + colors.reset + colors.bold + ' ' + title + ' ' + ' '.repeat(padding) + colors.bold + colors.cyan + box.vertical + colors.reset);
  console.log(colors.bold + colors.cyan + box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight + colors.reset);
}

/**
 * Print a horizontal divider
 */
function printDivider(): void {
  console.log(colors.gray + box.vertical + ' '.repeat(58) + box.vertical + colors.reset);
}

/**
 * Format JSON value for display
 */
function formatValue(value: unknown, maxLen: number = 50): string {
  if (value === null) return colors.gray + 'null' + colors.reset;
  if (value === undefined) return colors.gray + 'undefined' + colors.reset;
  if (typeof value === 'string') {
    const truncated = truncate(value, maxLen);
    return colors.green + '"' + truncated + '"' + (value.length > maxLen ? colors.gray + '...' : '') + colors.reset;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return colors.magenta + String(value) + colors.reset;
  }
  if (Array.isArray(value)) {
    return colors.cyan + `Array(${value.length})` + colors.reset;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return colors.cyan + `Object(${keys.length} keys)` + colors.reset;
  }
  return String(value);
}

/**
 * Print a key-value row
 */
function printRow(key: string, value: unknown, indent: number = 2): void {
  const prefix = ' '.repeat(indent);
  console.log(
    colors.bold + colors.white + prefix + box.vertical + ' ' + colors.yellow + key.padEnd(18) + colors.reset +
    colors.white + ' ' + box.vertical + ' ' + formatValue(value) + colors.reset
  );
}

/**
 * Visual Workflow Debugger class
 */
export class WorkflowDebugger {
  private ownerId: string;

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  /**
   * List all workflows with status
   */
  async listWorkflows(): Promise<void> {
    const { prisma } = await import('../db/client.js');

    const workflows = await prisma.workflow.findMany({
      where: { workspace: { ownerId: this.ownerId } },
      include: { workspace: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (workflows.length === 0) {
      console.log(colors.yellow + '\nNo workflows found. Create one with workflow_create().' + colors.reset);
      return;
    }

    printBox('WORKFLOW LIST', 80);

    // Header
    console.log(
      colors.bold + colors.gray + box.vertical + ' ' +
      'ID'.padEnd(38) + ' ' +
      'STATUS'.padEnd(10) + ' ' +
      'WORKSPACE'.padEnd(15) + ' ' +
      'CREATED'.padEnd(18) + ' ' +
      box.vertical + colors.reset
    );
    printDivider();

    // Rows
    for (const wf of workflows) {
      const statusCol = statusColor(wf.status);
      const icon = statusIcon(wf.status);
      const id = truncate(wf.id, 36);
      const wsName = truncate(wf.workspace.name, 13);
      const created = formatTime(wf.createdAt).replace(colors.gray, '').replace(colors.reset, '');

      console.log(
        box.vertical + ' ' +
        colors.dim + id + colors.reset + ' ' +
        statusCol + icon + ' ' + wf.status.padEnd(7) + colors.reset + ' ' +
        colors.blue + wsName.padEnd(15) + colors.reset + ' ' +
        colors.dim + created.padEnd(18) + colors.reset + ' ' +
        box.vertical
      );
    }

    printDivider();
    console.log(colors.dim + `\nShowing ${workflows.length} most recent workflows. Use inspectWorkflow(id) for details.` + colors.reset);
  }

  /**
   * Show workflow state at each checkpoint
   */
  async inspectWorkflow(workflowId: string): Promise<void> {
    const { prisma } = await import('../db/client.js');

    // Get workflow
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { ownerId: this.ownerId } },
      include: { workspace: { select: { name: true } } },
    });

    if (!workflow) {
      console.error(colors.red + `Workflow not found: ${workflowId}` + colors.reset);
      console.error(colors.dim + 'Use router_status() to see available workflows.' + colors.reset);
      return;
    }

    // Get checkpoints
    const checkpoints = await listCheckpoints(
      workflow.workspaceId,
      this.ownerId,
      workflowId,
    );

    // Get current state
    const currentState = await readStateFields(
      workflow.workspaceId,
      this.ownerId,
      workflowId,
    );

    // Print workflow header
    printBox('WORKFLOW INSPECTOR', 80);

    const statusCol = statusColor(workflow.status);
    const icon = statusIcon(workflow.status);

    console.log(box.vertical + colors.bold + '  Workflow Details' + ' '.repeat(52) + box.vertical + colors.reset);
    printDivider();
    printRow('ID', workflow.id);
    printRow('Workspace', workflow.workspace.name);
    printRow('Status', `${statusCol}${icon} ${workflow.status}${colors.reset}`);
    printRow('Created', workflow.createdAt);

    if (workflow.completedAt) {
      printRow('Completed', workflow.completedAt);
    }
    if (workflow.failureReason) {
      printRow('Failure Reason', workflow.failureReason, 2);
    }

    // Current state
    console.log();
    console.log(colors.bold + colors.cyan + box.vertical + '  Current State' + ' '.repeat(53) + box.vertical + colors.reset);
    printDivider();

    const stateEntries = Object.entries(currentState);
    if (stateEntries.length === 0) {
      console.log(box.vertical + '  ' + colors.dim + 'No state entries' + ' '.repeat(52) + box.vertical + colors.reset);
    } else {
      for (const [key, value] of stateEntries) {
        printRow(key, value);
      }
    }

    // Checkpoints
    console.log();
    console.log(colors.bold + colors.cyan + box.vertical + `  Checkpoints (${checkpoints.length})` + ' '.repeat(Math.max(0, 43 - checkpoints.length.toString().length)) + box.vertical + colors.reset);
    printDivider();

    if (checkpoints.length === 0) {
      console.log(box.vertical + '  ' + colors.dim + 'No checkpoints yet. Use checkpoint_create() to create one.' + ' '.repeat(17) + box.vertical + colors.reset);
    } else {
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const label = cp.label || `Checkpoint ${i + 1}`;
        const snapshot = cp.snapshot as Record<string, unknown>;
        const keys = Object.keys(snapshot);

        console.log(
          colors.bold + box.vertical + colors.magenta + ` #${(i + 1).toString().padStart(2)} ` + colors.reset +
          colors.yellow + truncate(label, 30).padEnd(32) + colors.reset +
          colors.dim + `[${keys.length} keys]` + colors.reset +
          colors.gray + formatTime(cp.createdAt).replace(colors.gray, '').replace(colors.reset, '') + ' ' +
          box.vertical + colors.reset
        );

        // Show snapshot keys (first 5)
        const displayKeys = keys.slice(0, 5);
        for (const key of displayKeys) {
          const value = snapshot[key];
          console.log(
            '     ' + colors.gray + box.vertical + ' ' + colors.white + key.padEnd(18) + colors.reset +
            ' ' + box.vertical + ' ' + formatValue(value, 35) + ' '.repeat(Math.max(0, 35 - JSON.stringify(value)?.length || 0)) +
            colors.gray + box.vertical + colors.reset
          );
        }
        if (keys.length > 5) {
          console.log('     ' + colors.gray + box.vertical + '  ' + colors.dim + `... and ${keys.length - 5} more keys` + ' '.repeat(35) + box.vertical + colors.reset);
        }
      }
    }

    printDivider();
    console.log(colors.dim + '\nUse diffCheckpoints(id, cp1, cp2) to compare checkpoints.' + colors.reset);
  }

  /**
   * Show diff between two checkpoints
   */
  async diffCheckpoints(workflowId: string, checkpointId1: string, checkpointId2: string): Promise<void> {
    const { prisma } = await import('../db/client.js');

    // Verify workflow exists
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { ownerId: this.ownerId } },
    });

    if (!workflow) {
      console.error(colors.red + `Workflow not found: ${workflowId}` + colors.reset);
      return;
    }

    // Get both checkpoints
    const [cp1, cp2] = await Promise.all([
      prisma.checkpoint.findFirst({
        where: { id: checkpointId1, workflowId, workspaceId: workflow.workspaceId },
      }),
      prisma.checkpoint.findFirst({
        where: { id: checkpointId2, workflowId, workspaceId: workflow.workspaceId },
      }),
    ]);

    if (!cp1 || !cp2) {
      console.error(colors.red + 'One or both checkpoints not found.' + colors.reset);
      console.error(colors.dim + 'Use inspectWorkflow() to see checkpoint IDs.' + colors.reset);
      return;
    }

    const snapshot1 = cp1.snapshot as Record<string, unknown>;
    const snapshot2 = cp2.snapshot as Record<string, unknown>;

    const label1 = cp1.label || `Checkpoint ${checkpointId1.substring(0, 8)}`;
    const label2 = cp2.label || `Checkpoint ${checkpointId2.substring(0, 8)}`;

    printBox('CHECKPOINT DIFF', 80);

    console.log(
      colors.bold + box.vertical + '  Comparing:' + ' '.repeat(49) + box.vertical + colors.reset
    );
    printDivider();
    console.log(
      colors.green + box.vertical + '  - ' + truncate(label1, 35).padEnd(37) + colors.dim + '(' + formatTime(cp1.createdAt) + ')' + ' '.repeat(Math.max(0, 18 - formatTime(cp1.createdAt).length)) + box.vertical + colors.reset
    );
    console.log(
      colors.red + box.vertical + '  + ' + truncate(label2, 35).padEnd(37) + colors.dim + '(' + formatTime(cp2.createdAt) + ')' + ' '.repeat(Math.max(0, 18 - formatTime(cp2.createdAt).length)) + box.vertical + colors.reset
    );
    printDivider();

    // Get all keys from both snapshots
    const allKeys = new Set([...Object.keys(snapshot1), ...Object.keys(snapshot2)]);
    let changesFound = false;

    for (const key of Array.from(allKeys).sort()) {
      const val1 = snapshot1[key];
      const val2 = snapshot2[key];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        changesFound = true;
        console.log();

        if (!(key in snapshot1)) {
          // New key added
          console.log(colors.green + box.vertical + '  + ' + colors.yellow + key.padEnd(18) + colors.reset + ' ' + box.vertical + ' ' + formatValue(val2) + ' '.repeat(Math.max(0, 30)) + box.vertical + colors.reset);
        } else if (!(key in snapshot2)) {
          // Key removed
          console.log(colors.red + box.vertical + '  - ' + colors.yellow + key.padEnd(18) + colors.reset + ' ' + box.vertical + ' ' + formatValue(val1) + ' '.repeat(Math.max(0, 30)) + box.vertical + colors.reset);
        } else {
          // Key modified
          console.log(colors.red + box.vertical + '  - ' + colors.yellow + key.padEnd(18) + colors.reset + ' ' + box.vertical + ' ' + formatValue(val1, 30) + ' '.repeat(Math.max(0, 20)) + box.vertical + colors.reset);
          console.log(colors.green + box.vertical + '  + ' + colors.yellow + key.padEnd(18) + colors.reset + ' ' + box.vertical + ' ' + formatValue(val2, 30) + ' '.repeat(Math.max(0, 20)) + box.vertical + colors.reset);
        }
      }
    }

    if (!changesFound) {
      console.log();
      console.log(box.vertical + '  ' + colors.dim + 'No differences found between checkpoints.' + ' '.repeat(25) + box.vertical + colors.reset);
    }

    printDivider();
  }

  /**
   * Stream or snapshot workflow updates.
   *
   * - Default / MCP: single-shot snapshot (one poll, then resolves). Never hangs.
   * - CLI continuous: pass `{ continuous: true }` to keep polling until the
   *   workflow ends, AbortSignal fires, or SIGINT. Never calls process.exit.
   */
  async tailWorkflow(
    workflowId: string,
    intervalMsOrOptions: number | TailWorkflowOptions = {},
  ): Promise<void> {
    const options: TailWorkflowOptions =
      typeof intervalMsOrOptions === 'number'
        ? { intervalMs: intervalMsOrOptions }
        : intervalMsOrOptions ?? {};

    const continuous = options.continuous === true;
    const intervalMs = clampPollInterval(options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    const { prisma } = await import('../db/client.js');

    // Verify workflow exists
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { ownerId: this.ownerId } },
    });

    if (!workflow) {
      console.error(colors.red + `Workflow not found: ${workflowId}` + colors.reset);
      return;
    }

    printBox('WORKFLOW TAIL', 80);
    if (continuous) {
      console.log(colors.bold + box.vertical + '  Tailing workflow (Ctrl+C to stop)' + ' '.repeat(32) + box.vertical + colors.reset);
    } else {
      console.log(colors.bold + box.vertical + '  Workflow snapshot (single-shot)' + ' '.repeat(33) + box.vertical + colors.reset);
    }
    printDivider();
    printRow('ID', workflowId);
    printRow('Status', workflow.status);

    let lastStateHash = '';
    let lastCheckpointCount = 0;
    let lastKnownStatus = workflow.status;

    const poll = async (): Promise<'continue' | 'stop'> => {
      const currentWorkflow = await prisma.workflow.findFirst({
        where: { id: workflowId, workspace: { ownerId: this.ownerId } },
      });

      if (!currentWorkflow) {
        console.log(colors.red + '\nWorkflow deleted!' + colors.reset);
        return 'stop';
      }

      // Assign into outer-tracked values (do not shadow with const)
      const state = await readStateFields(
        workflow.workspaceId,
        this.ownerId,
        workflowId,
      );
      const checkpoints = await listCheckpoints(
        workflow.workspaceId,
        this.ownerId,
        workflowId,
      );

      const currentStateHash = JSON.stringify(state);
      const checkpointCount = checkpoints.length;

      if (currentStateHash !== lastStateHash) {
        console.log();
        console.log(colors.cyan + box.vertical + '  [' + new Date().toLocaleTimeString() + '] State changed:' + ' '.repeat(24) + box.vertical + colors.reset);
        printDivider();

        for (const [key, value] of Object.entries(state)) {
          printRow(key, value);
        }

        lastStateHash = currentStateHash;
      }

      if (checkpointCount > lastCheckpointCount) {
        const newCount = checkpointCount - lastCheckpointCount;
        const newCPs = checkpoints.slice(0, newCount);

        console.log();
        console.log(colors.green + box.vertical + '  [' + new Date().toLocaleTimeString() + '] New checkpoint(s):' + ' '.repeat(31) + box.vertical + colors.reset);
        printDivider();

        for (const cp of newCPs.reverse()) {
          const label = cp.label || 'Unnamed checkpoint';
          const snapshot = cp.snapshot as Record<string, unknown>;
          printRow('Label', label);
          printRow('Keys', Object.keys(snapshot).length);
        }

        lastCheckpointCount = checkpointCount;
      }

      if (currentWorkflow.status !== lastKnownStatus) {
        const statusCol = statusColor(currentWorkflow.status);
        const icon = statusIcon(currentWorkflow.status);

        console.log();
        console.log(statusCol + box.vertical + '  [' + new Date().toLocaleTimeString() + `] Status: ${icon} ${currentWorkflow.status}` + ' '.repeat(Math.max(0, 38 - currentWorkflow.status.length)) + box.vertical + colors.reset);

        if (currentWorkflow.failureReason) {
          console.log(colors.red + box.vertical + '  Failure reason: ' + currentWorkflow.failureReason + ' '.repeat(Math.max(0, 42 - currentWorkflow.failureReason.length)) + box.vertical + colors.reset);
        }

        lastKnownStatus = currentWorkflow.status;

        if (currentWorkflow.status !== 'RUNNING') {
          console.log(colors.yellow + '\nWorkflow ended. Stopping tail.' + colors.reset);
          printDivider();
          return 'stop';
        }
      }

      return 'continue';
    };

    const firstResult = await poll();

    if (!continuous || firstResult === 'stop') {
      if (!continuous) {
        console.log(colors.dim + '\nSingle-shot snapshot complete. Call again to refresh.\n' + colors.reset);
      }
      return;
    }

    console.log(colors.dim + '\nPress Ctrl+C to stop...\n' + colors.reset);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearInterval(intervalId);
        options.signal?.removeEventListener('abort', onAbort);
        process.off('SIGINT', onSigint);
        resolve();
      };

      const intervalId = setInterval(() => {
        void poll().then((result) => {
          if (result === 'stop') {
            finish();
          }
        });
      }, intervalMs);

      const onAbort = () => {
        printDivider();
        console.log(colors.dim + 'Stopped tailing workflow.' + colors.reset);
        finish();
      };

      const onSigint = () => {
        printDivider();
        console.log(colors.dim + 'Stopped tailing workflow.' + colors.reset);
        finish();
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });
      process.on('SIGINT', onSigint);
    });
  }
}

/**
 * Format result for MCP tool response
 */
export function formatDebuggerOutput(output: string): string {
  return output;
}
