/**
 * State Diff Service
 * Compares state between snapshots, checkpoints, or current state
 */

export interface StateDiffOptions {
  deepDiff?: boolean; // Compare nested object fields
  includeUnchanged?: boolean; // Include keys with same value
}

export interface StateDiffChange {
  key: string;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: unknown;
  newValue?: unknown;
  path?: string[]; // For nested fields
}

export interface StateDiffResponse {
  summary: {
    addedKeys: string[];
    removedKeys: string[];
    modifiedKeys: string[];
    unchangedKeys: string[];
  };
  changes: StateDiffChange[];
  stats: {
    totalKeys: number;
    keysAdded: number;
    keysRemoved: number;
    keysModified: number;
  };
}

/**
 * Check if a value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep equality check for values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Compare two state snapshots and return the differences
 */
export function diffState(
  sourceSnapshot: Record<string, unknown>,
  targetSnapshot: Record<string, unknown>,
  options: StateDiffOptions = {},
): StateDiffResponse {
  const deepDiff = options.deepDiff ?? false;
  const includeUnchanged = options.includeUnchanged ?? false;

  const sourceKeys = new Set(Object.keys(sourceSnapshot));
  const targetKeys = new Set(Object.keys(targetSnapshot));

  const addedKeys = [...targetKeys].filter((k) => !sourceKeys.has(k));
  const removedKeys = [...sourceKeys].filter((k) => !targetKeys.has(k));
  const commonKeys = [...sourceKeys].filter((k) => targetKeys.has(k));

  const changes: StateDiffChange[] = [];
  const unchangedKeys: string[] = [];

  // Check modifications for common keys
  for (const key of commonKeys) {
    const oldValue = sourceSnapshot[key];
    const newValue = targetSnapshot[key];

    if (deepDiff && isObject(oldValue) && isObject(newValue)) {
      // Deep compare nested objects
      const fieldDiffs = diffNestedObjects(
        oldValue as Record<string, unknown>,
        newValue as Record<string, unknown>,
        key,
      );

      if (fieldDiffs.length > 0) {
        changes.push(...fieldDiffs);
      } else if (includeUnchanged) {
        // Nested objects are equal, but include unchanged
        unchangedKeys.push(key);
        changes.push({
          key,
          changeType: 'unchanged',
          oldValue,
          newValue,
        });
      } else {
        unchangedKeys.push(key);
      }
    } else if (!deepEqual(oldValue, newValue)) {
      changes.push({
        key,
        changeType: 'modified',
        oldValue,
        newValue,
      });
    } else if (includeUnchanged) {
      // Values are equal, but include unchanged
      unchangedKeys.push(key);
      changes.push({
        key,
        changeType: 'unchanged',
        oldValue,
        newValue,
      });
    } else {
      unchangedKeys.push(key);
    }
  }

  // Add new keys
  for (const key of addedKeys) {
    changes.push({
      key,
      changeType: 'added',
      newValue: targetSnapshot[key],
    });
  }

  // Add removed keys
  for (const key of removedKeys) {
    changes.push({
      key,
      changeType: 'removed',
      oldValue: sourceSnapshot[key],
    });
  }

  // Extract modified keys (only 'modified' type, not 'unchanged')
  const modifiedKeys = changes
    .filter((c) => c.changeType === 'modified')
    .map((c) => c.key);

  // Return unchanged keys only if requested
  const finalUnchangedKeys = includeUnchanged ? unchangedKeys : [];

  return {
    summary: {
      addedKeys,
      removedKeys,
      modifiedKeys,
      unchangedKeys: finalUnchangedKeys,
    },
    changes,
    stats: {
      totalKeys: targetKeys.size,
      keysAdded: addedKeys.length,
      keysRemoved: removedKeys.length,
      keysModified: modifiedKeys.length,
    },
  };
}

/**
 * Recursively diff nested objects
 */
function diffNestedObjects(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  prefix: string,
): StateDiffChange[] {
  const changes: StateDiffChange[] = [];

  const sourceKeys = new Set(Object.keys(source));
  const targetKeys = new Set(Object.keys(target));

  // Added fields
  for (const key of targetKeys) {
    if (!sourceKeys.has(key)) {
      changes.push({
        key: `${prefix}.${key}`,
        changeType: 'added',
        newValue: target[key],
        path: [prefix, key],
      });
    }
  }

  // Removed fields
  for (const key of sourceKeys) {
    if (!targetKeys.has(key)) {
      changes.push({
        key: `${prefix}.${key}`,
        changeType: 'removed',
        oldValue: source[key],
        path: [prefix, key],
      });
    }
  }

  // Modified fields
  for (const key of [...sourceKeys].filter((k) => targetKeys.has(k))) {
    const oldVal = source[key];
    const newVal = target[key];

    if (isObject(oldVal) && isObject(newVal)) {
      // Recurse into nested objects
      const nested = diffNestedObjects(
        oldVal as Record<string, unknown>,
        newVal as Record<string, unknown>,
        `${prefix}.${key}`,
      );
      changes.push(...nested);
    } else if (!deepEqual(oldVal, newVal)) {
      changes.push({
        key: `${prefix}.${key}`,
        changeType: 'modified',
        oldValue: oldVal,
        newValue: newVal,
        path: [prefix, key],
      });
    }
  }

  return changes;
}

/**
 * Create a summary diff result
 */
export function diffStateSummary(
  sourceSnapshot: Record<string, unknown>,
  targetSnapshot: Record<string, unknown>,
): {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
} {
  const result = diffState(sourceSnapshot, targetSnapshot, {
    includeUnchanged: true,
  });
  return {
    added: result.stats.keysAdded,
    removed: result.stats.keysRemoved,
    modified: result.stats.keysModified,
    unchanged: result.summary.unchangedKeys.length,
  };
}
