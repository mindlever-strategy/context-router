/**
 * Event Journal - Event Payloads
 *
 * Defines the payload structure for each event type.
 * Each event type has specific data that is recorded.
 */

import type { Prisma } from '../generated/postgresql/client.js';

// ============================================================================
// State Event Payloads
// ============================================================================

/**
 * Payload for state_written events
 */
export interface StateWrittenPayload {
  /** The state key that was written */
  key: string;
  /** The previous value before the write (null for new keys) */
  previousValue: Prisma.InputJsonValue | null;
  /** The new value that was written */
  newValue: Prisma.InputJsonValue;
  /** The version number after the write */
  version: number;
  /** Whether the value was validated against a schema */
  schemaValidated: boolean;
  /** The name of the schema if validated */
  schemaName?: string;
}

/**
 * Payload for state_deleted events
 */
export interface StateDeletedPayload {
  /** The state key that was deleted */
  key: string;
  /** The value that was deleted */
  previousValue: Prisma.InputJsonValue;
}

// ============================================================================
// Checkpoint Event Payloads
// ============================================================================

/**
 * Payload for checkpoint_created events
 */
export interface CheckpointCreatedPayload {
  /** The unique ID of the checkpoint */
  checkpointId: string;
  /** Optional label for the checkpoint */
  label?: string;
  /** The state keys included in the snapshot */
  stateKeys: string[];
  /** The approximate size of the snapshot in bytes */
  snapshotSize: number;
}

/**
 * Payload for checkpoint_restored events
 */
export interface CheckpointRestoredPayload {
  /** The unique ID of the checkpoint that was restored */
  checkpointId: string;
  /** The state keys that were restored */
  stateKeysRestored: string[];
}

/**
 * Payload for checkpoint_deleted events
 */
export interface CheckpointDeletedPayload {
  /** The unique ID of the checkpoint that was deleted */
  checkpointId: string;
  /** The label of the deleted checkpoint */
  label?: string;
}

// ============================================================================
// Step Execution Event Payloads
// ============================================================================

/**
 * Payload for step_started events
 */
export interface StepStartedPayload {
  /** The unique ID of the step */
  stepId: string;
  /** The unique execution ID */
  executionId: string;
  /** Optional agent ID that is executing the step */
  agentId?: string;
  /** The checkpoint ID created before starting */
  checkpointId: string;
  /** The attempt number (1 for first attempt, incremented on retry) */
  attempt: number;
}

/**
 * Payload for step_completed events
 */
export interface StepCompletedPayload {
  /** The unique ID of the step */
  stepId: string;
  /** The unique execution ID */
  executionId: string;
  /** Duration of the step execution in milliseconds */
  durationMs: number;
  /** The state keys that were written as results */
  resultKeys: string[];
}

/**
 * Payload for step_failed events
 */
export interface StepFailedPayload {
  /** The unique ID of the step */
  stepId: string;
  /** The unique execution ID */
  executionId: string;
  /** The reason for the failure */
  reason: string;
  /** The attempt number when the failure occurred */
  attempt: number;
}

// ============================================================================
// Workflow Lifecycle Event Payloads
// ============================================================================

/**
 * Payload for workflow_created events
 */
export interface WorkflowCreatedPayload {
  /** The initial status of the workflow */
  status: string;
}

/**
 * Payload for workflow_completed events
 */
export interface WorkflowCompletedPayload {
  /** The previous status before completion */
  previousStatus?: string;
}

/**
 * Payload for workflow_failed events
 */
export interface WorkflowFailedPayload {
  /** The previous status before failure */
  previousStatus?: string;
  /** The reason for the failure */
  failureReason: string;
}

// ============================================================================
// Handoff Event Payloads
// ============================================================================

/**
 * Payload for handoff_generated events
 */
export interface HandoffGeneratedPayload {
  /** The length of the generated summary in characters */
  summaryLength: number;
  /** The state keys included in the handoff */
  keysIncluded: string[];
  /** Estimated token count for the handoff */
  tokensEstimate: number;
  /** Optional ID of the recipient agent */
  recipientAgentId?: string;
  /** The format of the handoff (text, structured, or ai) */
  format: 'text' | 'structured' | 'ai';
  /** Optional AI-specific metadata */
  aiMetadata?: {
    /** The LLM model used */
    model: string;
    /** Time taken to generate in milliseconds */
    durationMs: number;
    /** Whether the result was served from cache */
    fromCache: boolean;
  };
}

// ============================================================================
// Schema Event Payloads
// ============================================================================

/**
 * Payload for schema_created events
 */
export interface SchemaCreatedPayload {
  /** The name of the created schema */
  schemaName: string;
  /** The version number of the schema */
  version: number;
  /** The number of fields in the schema */
  fieldCount: number;
}

/**
 * Payload for schema_validated events
 */
export interface SchemaValidatedPayload {
  /** The name of the schema used for validation */
  schemaName: string;
  /** Whether the validation passed */
  valid: boolean;
  /** The number of validation errors if any */
  errorCount?: number;
}

// ============================================================================
// Journal Event Payloads
// ============================================================================

/**
 * Payload for journal_exported events
 */
export interface JournalExportedPayload {
  /** The export format used */
  format: 'json' | 'jsonl';
  /** The number of events exported */
  eventCount: number;
  /** The date range of the export */
  dateRange: {
    /** Start of the export range (ISO timestamp) */
    since: string;
    /** End of the export range (ISO timestamp) */
    until: string;
  };
}

// ============================================================================
// Metadata
// ============================================================================

/**
 * Metadata included with every event
 */
export interface EventMetadata {
  /** Optional agent ID associated with this event */
  agentId?: string;
  /** Optional execution ID for step-related events */
  executionId?: string;
  /** Optional source identifier (e.g., tool name) */
  source?: string;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** The workspace ID this event belongs to */
  workspaceId: string;
  /** The workflow ID this event belongs to */
  workflowId: string;
  /** Optional user ID who triggered this event */
  userId?: string;
}

/**
 * Default metadata factory
 */
export function createEventMetadata(
  workspaceId: string,
  workflowId: string,
  additional?: Partial<EventMetadata>,
): EventMetadata {
  return {
    workspaceId,
    workflowId,
    timestamp: new Date().toISOString(),
    ...additional,
  };
}

// ============================================================================
// Union Type for All Payloads
// ============================================================================

/**
 * Union type for all possible event payloads
 */
export type EventPayload =
  | StateWrittenPayload
  | StateDeletedPayload
  | CheckpointCreatedPayload
  | CheckpointRestoredPayload
  | CheckpointDeletedPayload
  | StepStartedPayload
  | StepCompletedPayload
  | StepFailedPayload
  | WorkflowCreatedPayload
  | WorkflowCompletedPayload
  | WorkflowFailedPayload
  | HandoffGeneratedPayload
  | SchemaCreatedPayload
  | SchemaValidatedPayload
  | JournalExportedPayload;
