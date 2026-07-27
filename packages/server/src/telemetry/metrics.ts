/**
 * Metrics Module
 * Stub implementation - extend with full OpenTelemetry when needed
 */

import { Attributes } from '@opentelemetry/api';

export function initMetrics(): void {
  if (process.env.METRICS_ENABLED === 'true') {
    console.log('[Metrics] Metrics enabled (stub - extend for full implementation)');
  }
}

export async function shutdownMetrics(): Promise<void> {
  // Stub
}

// Counter functions
export function recordWorkflowCreated(attributes?: Attributes): void {}
export function recordWorkflowCompleted(attributes?: Attributes): void {}
export function recordWorkflowFailed(attributes?: Attributes): void {}
export function recordStateWrite(attributes?: Attributes): void {}
export function recordHandoffGenerated(attributes?: Attributes): void {}
export function recordCheckpointCreated(attributes?: Attributes): void {}
export function recordJournalEntry(attributes?: Attributes): void {}
export function recordSchemaMigration(sourceVersion: number, targetVersion: number, fieldsTransformed: number, attributes?: Attributes): void {}
export function recordStateDiff(fieldsCompared: number, fieldsChanged: number, attributes?: Attributes): void {}
export function recordTTLCleanup(expiredCount: number, durationMs: number, attributes?: Attributes): void {}

// Histogram functions
export function recordStateWriteDuration(durationMs: number, attributes?: Attributes): void {}
export function recordDbQueryDuration(durationMs: number, attributes?: Attributes): void {}
export function recordHandoffTokens(tokens: number, attributes?: Attributes): void {}

// Gauge helpers
let activeWorkflowsCount = 0;
export function getActiveWorkflowsCount(): number {
  return activeWorkflowsCount;
}
export function setActiveWorkflowsCount(count: number): void {
  activeWorkflowsCount = count;
}

export function isInitialized(): boolean {
  return false;
}
