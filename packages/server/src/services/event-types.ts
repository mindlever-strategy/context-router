/**
 * Event Journal - Event Types
 *
 * Defines all event types that can be recorded in the journal.
 * The journal provides complete auditability, workflow replay,
 * debugging, and analytics foundation.
 */

// Workflow lifecycle events
export type WorkflowLifecycleEvent =
  'workflow_created' | 'workflow_completed' | 'workflow_failed';

// State mutation events
export type StateMutationEvent = 'state_written' | 'state_deleted';

// Checkpoint events
export type CheckpointEvent =
  'checkpoint_created' | 'checkpoint_restored' | 'checkpoint_deleted';

// Step execution events
export type StepExecutionEvent =
  'step_started' | 'step_completed' | 'step_failed';

// Handoff events
export type HandoffEvent = 'handoff_generated';

// Schema events
export type SchemaEvent = 'schema_created' | 'schema_validated';

// Journal events
export type JournalEvent = 'journal_exported';

// Union of all event types
export type EventType =
  | WorkflowLifecycleEvent
  | StateMutationEvent
  | CheckpointEvent
  | StepExecutionEvent
  | HandoffEvent
  | SchemaEvent
  | JournalEvent;

// All valid event type values
export const EVENT_TYPE_VALUES: EventType[] = [
  'workflow_created',
  'workflow_completed',
  'workflow_failed',
  'state_written',
  'state_deleted',
  'checkpoint_created',
  'checkpoint_restored',
  'checkpoint_deleted',
  'step_started',
  'step_completed',
  'step_failed',
  'handoff_generated',
  'schema_created',
  'schema_validated',
  'journal_exported',
];

/**
 * Check if a string is a valid EventType
 */
export function isValidEventType(value: string): value is EventType {
  return EVENT_TYPE_VALUES.includes(value as EventType);
}

/**
 * Get the category of an event type
 */
export function getEventCategory(eventType: EventType): string {
  if (
    ['workflow_created', 'workflow_completed', 'workflow_failed'].includes(
      eventType,
    )
  ) {
    return 'workflow';
  }
  if (['state_written', 'state_deleted'].includes(eventType)) {
    return 'state';
  }
  if (
    [
      'checkpoint_created',
      'checkpoint_restored',
      'checkpoint_deleted',
    ].includes(eventType)
  ) {
    return 'checkpoint';
  }
  if (['step_started', 'step_completed', 'step_failed'].includes(eventType)) {
    return 'step';
  }
  if (eventType === 'handoff_generated') {
    return 'handoff';
  }
  if (['schema_created', 'schema_validated'].includes(eventType)) {
    return 'schema';
  }
  if (eventType === 'journal_exported') {
    return 'journal';
  }
  return 'unknown';
}

/**
 * Human-readable descriptions for event types
 */
export const EVENT_TYPE_DESCRIPTIONS: Record<EventType, string> = {
  workflow_created: 'Workflow was initialized',
  workflow_completed: 'Workflow finished successfully',
  workflow_failed: 'Workflow ended with failure',
  state_written: 'State key was updated',
  state_deleted: 'State key was removed',
  checkpoint_created: 'Checkpoint snapshot was taken',
  checkpoint_restored: 'State was restored from checkpoint',
  checkpoint_deleted: 'Checkpoint was deleted',
  step_started: 'Step execution began',
  step_completed: 'Step finished successfully',
  step_failed: 'Step ended with failure',
  handoff_generated: 'Handoff summary was created',
  schema_created: 'Schema was created',
  schema_validated: 'Schema validation was performed',
  journal_exported: 'Journal was exported',
};
