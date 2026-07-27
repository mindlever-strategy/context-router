/**
 * Event Journal Hooks
 *
 * Provides wrapper functions that automatically journal operations.
 * These hooks should be called alongside the regular operations
 * to maintain a complete audit trail.
 *
 * Usage: Call these hooks AFTER successful operations to record events.
 */

import { journalService, type JournalService } from './journal-service.js';
import type { EventType } from './event-types.js';
import type {
  StateWrittenPayload,
  StateDeletedPayload,
  CheckpointCreatedPayload,
  CheckpointRestoredPayload,
  CheckpointDeletedPayload,
  StepStartedPayload,
  StepCompletedPayload,
  StepFailedPayload,
  WorkflowCreatedPayload,
  WorkflowCompletedPayload,
  WorkflowFailedPayload,
  HandoffGeneratedPayload,
} from './event-payloads.js';

// Cache for journal enabled status per workspace (with TTL)
const journalEnabledCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Check if journal is enabled (cached)
 */
async function isJournalEnabled(workspaceId: string): Promise<boolean> {
  const now = Date.now();
  const cached = journalEnabledCache.get(workspaceId);

  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  const enabled = await journalService.isEnabled(workspaceId);
  journalEnabledCache.set(workspaceId, { enabled, expiresAt: now + CACHE_TTL_MS });
  return enabled;
}

/**
 * Invalidate the journal enabled cache for a workspace
 */
export function invalidateJournalEnabledCache(workspaceId: string): void {
  journalEnabledCache.delete(workspaceId);
}

// ============================================================================
// State Hooks
// ============================================================================

/**
 * Journal a state write operation
 */
export async function journaledStateWrite(
  workspaceId: string,
  workflowId: string,
  payload: StateWrittenPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'state_written', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'state_write',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    // Log but don't fail the main operation
    console.error('[journal] Failed to journal state_written:', error);
  }
}

/**
 * Journal a state delete operation
 */
export async function journaledStateDelete(
  workspaceId: string,
  workflowId: string,
  payload: StateDeletedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'state_deleted', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'state_delete',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal state_deleted:', error);
  }
}

// ============================================================================
// Checkpoint Hooks
// ============================================================================

/**
 * Journal a checkpoint creation
 */
export async function journaledCheckpointCreate(
  workspaceId: string,
  workflowId: string,
  payload: CheckpointCreatedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'checkpoint_created', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'checkpoint_create',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal checkpoint_created:', error);
  }
}

/**
 * Journal a checkpoint restore
 */
export async function journaledCheckpointRestore(
  workspaceId: string,
  workflowId: string,
  payload: CheckpointRestoredPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'checkpoint_restored', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'checkpoint_restore',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal checkpoint_restored:', error);
  }
}

/**
 * Journal a checkpoint deletion
 */
export async function journaledCheckpointDelete(
  workspaceId: string,
  workflowId: string,
  payload: CheckpointDeletedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'checkpoint_deleted', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'checkpoint_delete',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal checkpoint_deleted:', error);
  }
}

// ============================================================================
// Step Execution Hooks
// ============================================================================

/**
 * Journal a step start
 */
export async function journaledStepStart(
  workspaceId: string,
  workflowId: string,
  payload: StepStartedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'step_started', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'step_run_start',
      agentId: metadata?.agentId ?? payload.agentId,
      executionId: payload.executionId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal step_started:', error);
  }
}

/**
 * Journal a step completion
 */
export async function journaledStepComplete(
  workspaceId: string,
  workflowId: string,
  payload: StepCompletedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'step_completed', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'step_run_complete',
      agentId: metadata?.agentId,
      executionId: payload.executionId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal step_completed:', error);
  }
}

/**
 * Journal a step failure
 */
export async function journaledStepFail(
  workspaceId: string,
  workflowId: string,
  payload: StepFailedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'step_failed', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'step_run_fail',
      agentId: metadata?.agentId,
      executionId: payload.executionId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal step_failed:', error);
  }
}

// ============================================================================
// Workflow Lifecycle Hooks
// ============================================================================

/**
 * Journal workflow creation
 */
export async function journaledWorkflowCreated(
  workspaceId: string,
  workflowId: string,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    const payload: WorkflowCreatedPayload = { status: 'RUNNING' };
    await journalService.append(workspaceId, workflowId, 'workflow_created', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'workflow_create',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal workflow_created:', error);
  }
}

/**
 * Journal workflow completion
 */
export async function journaledWorkflowComplete(
  workspaceId: string,
  workflowId: string,
  previousStatus: string,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    const payload: WorkflowCompletedPayload = { previousStatus };
    await journalService.append(workspaceId, workflowId, 'workflow_completed', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'workflow_complete',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal workflow_completed:', error);
  }
}

/**
 * Journal workflow failure
 */
export async function journaledWorkflowFail(
  workspaceId: string,
  workflowId: string,
  previousStatus: string,
  failureReason: string,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    const payload: WorkflowFailedPayload = { previousStatus, failureReason };
    await journalService.append(workspaceId, workflowId, 'workflow_failed', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'workflow_fail',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal workflow_failed:', error);
  }
}

// ============================================================================
// Handoff Hooks
// ============================================================================

/**
 * Journal handoff generation
 */
export async function journaledHandoffGenerate(
  workspaceId: string,
  workflowId: string,
  payload: HandoffGeneratedPayload,
  metadata?: { agentId?: string; source?: string },
): Promise<void> {
  if (!(await isJournalEnabled(workspaceId))) return;

  try {
    await journalService.append(workspaceId, workflowId, 'handoff_generated', payload as unknown as Record<string, unknown>, {
      source: metadata?.source ?? 'handoff_generate',
      agentId: metadata?.agentId,
    });
  } catch (error) {
    console.error('[journal] Failed to journal handoff_generated:', error);
  }
}

// ============================================================================
// Journal Export Hook
// ============================================================================

/**
 * Journal a journal export operation
 */
export async function journaledJournalExport(
  workspaceId: string,
  workflowId: string,
  eventCount: number,
  format: 'json' | 'jsonl',
  dateRange: { since: string; until: string },
): Promise<void> {
  try {
    await journalService.append(workspaceId, workflowId, 'journal_exported', {
      format,
      eventCount,
      dateRange,
    }, {
      source: 'journal_export',
    });
  } catch (error) {
    // Don't log here to avoid infinite recursion
    console.error('[journal] Failed to journal journal_exported:', error);
  }
}

// ============================================================================
// Drop accounting
// ============================================================================

let droppedEvents = 0;
let lastDropError: string | null = null;

/**
 * Records a journal write that failed.
 *
 * Journaling is deliberately non-blocking — a failed audit write must not fail
 * the operation it describes — but silent loss makes the journal untrustworthy.
 * Drops are counted and surfaced through `router_status`.
 */
export function recordJournalDrop(eventType: string, error: unknown): void {
  droppedEvents += 1;
  const reason = error instanceof Error ? error.message : String(error);
  lastDropError = `${eventType}: ${reason}`;
  console.error(`[context-router] journal drop (${lastDropError})`);
}

export function readJournalDrops(): {
  count: number;
  lastError: string | null;
} {
  return { count: droppedEvents, lastError: lastDropError };
}

export function resetJournalDrops(): void {
  droppedEvents = 0;
  lastDropError = null;
}

// ============================================================================
// Re-export journal service for convenience
// ============================================================================

export { journalService };
export type { JournalService };
