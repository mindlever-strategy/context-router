/**
 * Handoff Cache Service
 *
 * Provides in-memory caching for AI-generated handoff summaries to reduce API calls
 * and improve response times for repeated handoff requests.
 *
 * Note: This is an in-memory implementation. For production, add a HandoffCache model
 * to the Prisma schema:
 *
 * model HandoffCache {
 *   id          String   @id @default(uuid())
 *   key         String   @unique
 *   summary     String
 *   packet      Json
 *   metadata    Json
 *   stateHash   String
 *   optionsHash String
 *   createdAt   DateTime @default(now())
 *   expiresAt   DateTime
 * }
 */

export interface CachedHandoff {
  summary: string;
  packet: {
    facts: Record<string, unknown>;
    decisions: string[];
    openQuestions: string[];
    nextGoals: string[];
  };
  metadata: {
    model: string;
    tokensUsed: number;
    durationMs: number;
  };
}

interface CacheEntry {
  data: CachedHandoff;
  expiresAt: number;
}

export class HandoffCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly defaultTtlSeconds: number = 3600; // 1 hour
  private readonly maxEntries: number = 1000;

  /**
   * Get a cached handoff by key
   */
  async get(key: string): Promise<CachedHandoff | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set a handoff in the cache
   */
  async set(key: string, result: CachedHandoff): Promise<void> {
    const ttlSeconds = parseInt(
      process.env.HANDOFF_CACHE_TTL_SECONDS ?? String(this.defaultTtlSeconds),
      10,
    );

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data: result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Invalidate cache entries by state hash
   */
  async invalidateByState(stateHash: string): Promise<void> {
    const prefix = `${stateHash}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Compute a cache key from state and options
   */
  computeKey(
    state: Record<string, unknown>,
    options: Record<string, unknown>,
  ): string {
    const stateHash = this.hashState(state);
    const optionsHash = this.hashMetadata(options);
    return `${stateHash}:${optionsHash}`;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
    };
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Hash state object for cache key
   */
  private hashState(state: Record<string, unknown>): string {
    const str = JSON.stringify(state, Object.keys(state).sort());
    return this.hashString(str);
  }

  /**
   * Hash metadata object for cache key
   */
  private hashMetadata(meta: Record<string, unknown>): string {
    const str = JSON.stringify(meta, Object.keys(meta).sort());
    return this.hashString(str);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
