/**
 * Telemetry Module - Observability
 *
 * Provides tracing, metrics, and structured logging for Context Router.
 * Currently uses stub implementations - extend with full OpenTelemetry as needed.
 *
 * @example
 * ```typescript
 * import {
 *   initTracing, initMetrics, shutdownTracing,
 *   tracer, traceAsync, logger, recordStateWrite
 * } from './telemetry/index.js';
 *
 * // Initialize at startup
 * initTracing();
 * initMetrics();
 *
 * // Use in operations
 * await traceAsync('my.operation', async (span) => {
 *   span.setAttribute('custom.attr', 'value');
 *   return doWork();
 * });
 *
 * // Record metrics
 * recordStateWrite();
 *
 * // Log with context
 * logger.info('Operation completed', { workflowId, duration: 100 });
 *
 * // Cleanup at shutdown
 * await shutdownTracing();
 * ```
 */

// Tracing exports
export {
  initTracing,
  shutdownTracing,
  tracer,
  traceAsync,
  traceSync,
  createSpan,
} from './tracing.js';

// Metrics exports
export {
  initMetrics,
  recordWorkflowCreated,
  recordWorkflowCompleted,
  recordWorkflowFailed,
  recordStateWrite,
  recordHandoffGenerated,
  recordCheckpointCreated,
  recordJournalEntry,
  recordStateDiff,
  recordSchemaMigration,
  recordTTLCleanup,
  getActiveWorkflowsCount,
  setActiveWorkflowsCount,
} from './metrics.js';

// Logging exports
export {
  logger,
  createChildLogger,
  createWorkspaceLogger,
  createWorkflowLogger,
} from './logging.js';
