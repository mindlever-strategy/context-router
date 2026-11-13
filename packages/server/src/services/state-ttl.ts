/**
 * State TTL Service
 * Manages automatic expiration of state entries
 */

import { cleanupExpiredStates } from '../db/queries.js';
import { logger } from '../telemetry/logging.js';
import { recordTTLCleanup } from '../telemetry/metrics.js';

let cleanupInterval: NodeJS.Timeout | null = null;

export interface TTLCleanupConfig {
  intervalMs: number; // Default: 60000 (1 minute)
  batchSize: number; // Default: 100
  enabled: boolean; // Default: true
}

/**
 * Start the TTL cleanup background job
 */
export function startTTLCleanup(config: Partial<TTLCleanupConfig> = {}): void {
  const intervalMs = config.intervalMs ?? 60000;
  const batchSize = config.batchSize ?? 100;
  const enabled = config.enabled ?? true;

  if (!enabled) {
    logger.info('[TTL] Cleanup disabled by configuration');
    return;
  }

  // Clear any existing interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  // Run cleanup on startup
  runCleanup(batchSize);

  // Schedule periodic cleanup
  cleanupInterval = setInterval(async () => {
    await runCleanup(batchSize);
  }, intervalMs);

  logger.info('[TTL] Cleanup service started', { intervalMs, batchSize });
}

/**
 * Stop the TTL cleanup background job
 */
export function stopTTLCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('[TTL] Cleanup service stopped');
  }
}

/**
 * Run a single cleanup pass
 */
async function runCleanup(batchSize: number): Promise<void> {
  const startTime = Date.now();
  try {
    const deleted = await cleanupExpiredStates(batchSize);
    const durationMs = Date.now() - startTime;
    if (deleted > 0) {
      logger.debug('[TTL] Cleaned up expired states', {
        count: deleted,
        durationMs,
      });
      recordTTLCleanup(deleted, durationMs);
    }
  } catch (error) {
    logger.error('[TTL] Cleanup failed', error as Error);
  }
}

/**
 * Check if TTL cleanup is currently running
 */
export function isTTLCleanupRunning(): boolean {
  return cleanupInterval !== null;
}

/**
 * Get configuration from environment
 */
export function getTTLCleanupConfig(): TTLCleanupConfig {
  return {
    intervalMs: parseInt(process.env.TTL_CLEANUP_INTERVAL_MS ?? '60000', 10),
    batchSize: parseInt(process.env.TTL_CLEANUP_BATCH_SIZE ?? '100', 10),
    enabled: process.env.TTL_CLEANUP_ENABLED !== 'false',
  };
}

/**
 * Calculate expiration date from seconds or timestamp
 */
export function calculateExpiresAt(
  expiresIn?: number,
  expiresAt?: string | Date,
): Date | null {
  if (expiresAt) {
    const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    return isNaN(date.getTime()) ? null : date;
  }

  if (expiresIn !== undefined && expiresIn > 0) {
    return new Date(Date.now() + expiresIn * 1000);
  }

  return null;
}
