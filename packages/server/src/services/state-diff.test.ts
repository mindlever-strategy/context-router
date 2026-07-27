/**
 * State Diff Service Tests
 */

import { describe, it, expect } from 'vitest';
import { diffState, diffStateSummary, type StateDiffResponse } from './state-diff.js';

describe('diffState', () => {
  it('detects added keys', () => {
    const source = { a: 1 };
    const target = { a: 1, b: 2 };

    const result = diffState(source, target);

    expect(result.summary.addedKeys).toEqual(['b']);
    expect(result.summary.removedKeys).toEqual([]);
    expect(result.summary.modifiedKeys).toEqual([]);
    expect(result.stats.keysAdded).toBe(1);
    expect(result.stats.keysRemoved).toBe(0);
    expect(result.stats.keysModified).toBe(0);
  });

  it('detects removed keys', () => {
    const source = { a: 1, b: 2 };
    const target = { a: 1 };

    const result = diffState(source, target);

    expect(result.summary.addedKeys).toEqual([]);
    expect(result.summary.removedKeys).toEqual(['b']);
    expect(result.summary.modifiedKeys).toEqual([]);
  });

  it('detects modified values', () => {
    const source = { a: 1 };
    const target = { a: 2 };

    const result = diffState(source, target);

    expect(result.summary.modifiedKeys).toEqual(['a']);
    expect(result.changes).toContainEqual({
      key: 'a',
      changeType: 'modified',
      oldValue: 1,
      newValue: 2,
    });
  });

  it('detects multiple changes', () => {
    const source = { a: 1, b: 2, c: 3 };
    const target = { a: 1, b: 5, d: 4 };

    const result = diffState(source, target);

    expect(result.summary.addedKeys).toEqual(['d']);
    expect(result.summary.removedKeys).toEqual(['c']);
    expect(result.summary.modifiedKeys).toEqual(['b']);
    expect(result.stats.keysAdded).toBe(1);
    expect(result.stats.keysRemoved).toBe(1);
    expect(result.stats.keysModified).toBe(1);
  });

  it('handles empty objects', () => {
    const source: Record<string, unknown> = {};
    const target: Record<string, unknown> = {};

    const result = diffState(source, target);

    expect(result.summary.addedKeys).toEqual([]);
    expect(result.summary.removedKeys).toEqual([]);
    expect(result.summary.modifiedKeys).toEqual([]);
    expect(result.stats.totalKeys).toBe(0);
  });

  it('handles null and undefined values', () => {
    const source = { a: null };
    const target = { a: undefined };

    const result = diffState(source, target);

    // undefined and null are different values
    expect(result.summary.modifiedKeys).toEqual(['a']);
  });

  it('handles array values', () => {
    const source = { items: [1, 2, 3] };
    const target = { items: [1, 2, 3, 4] };

    const result = diffState(source, target);

    expect(result.summary.modifiedKeys).toEqual(['items']);
    expect(result.changes[0].oldValue).toEqual([1, 2, 3]);
    expect(result.changes[0].newValue).toEqual([1, 2, 3, 4]);
  });

  it('supports deep diff for nested objects', () => {
    const source = { nested: { a: 1, b: 2 } };
    const target = { nested: { a: 1, b: 3, c: 4 } };

    const result = diffState(source, target, { deepDiff: true });

    // With deep diff, nested changes are reported
    expect(result.changes.some(c => c.key === 'nested.b')).toBe(true);
    expect(result.changes.some(c => c.key === 'nested.c' && c.changeType === 'added')).toBe(true);
  });

  it('reports unchanged keys when includeUnchanged is true', () => {
    const source = { a: 1, b: 2 };
    const target = { a: 1, b: 2 };

    const result = diffState(source, target, { includeUnchanged: true });

    expect(result.summary.unchangedKeys).toEqual(['a', 'b']);
    expect(result.changes).toHaveLength(2);
  });

  it('hides unchanged keys when includeUnchanged is false (default)', () => {
    const source = { a: 1, b: 2 };
    const target = { a: 1, b: 2 };

    const result = diffState(source, target);

    expect(result.summary.unchangedKeys).toEqual([]);
    expect(result.changes).toHaveLength(0);
  });

  it('tracks total keys correctly', () => {
    const source = { a: 1 };
    const target = { a: 1, b: 2, c: 3 };

    const result = diffState(source, target);

    expect(result.stats.totalKeys).toBe(3);
  });
});

describe('diffStateSummary', () => {
  it('returns a summary object', () => {
    const source = { a: 1, b: 2 };
    const target = { a: 1, c: 3 };

    const result = diffStateSummary(source, target);

    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.modified).toBe(0);
    expect(result.unchanged).toBe(1);
  });

  it('handles empty objects', () => {
    const source: Record<string, unknown> = {};
    const target: Record<string, unknown> = {};

    const result = diffStateSummary(source, target);

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.modified).toBe(0);
    expect(result.unchanged).toBe(0);
  });
});

describe('deep diff nested objects', () => {
  it('detects added fields in nested objects', () => {
    const source = { user: { name: 'John' } };
    const target = { user: { name: 'John', email: 'john@example.com' } };

    const result = diffState(source, target, { deepDiff: true });

    expect(result.changes).toContainEqual(
      expect.objectContaining({
        key: 'user.email',
        changeType: 'added',
        newValue: 'john@example.com',
      })
    );
  });

  it('detects removed fields in nested objects', () => {
    const source = { user: { name: 'John', age: 30 } };
    const target = { user: { name: 'John' } };

    const result = diffState(source, target, { deepDiff: true });

    expect(result.changes).toContainEqual(
      expect.objectContaining({
        key: 'user.age',
        changeType: 'removed',
        oldValue: 30,
      })
    );
  });

  it('detects modified fields in deeply nested objects', () => {
    const source = { config: { db: { host: 'localhost' } } };
    const target = { config: { db: { host: 'production.db.com' } } };

    const result = diffState(source, target, { deepDiff: true });

    expect(result.changes).toContainEqual(
      expect.objectContaining({
        key: 'config.db.host',
        changeType: 'modified',
        oldValue: 'localhost',
        newValue: 'production.db.com',
      })
    );
  });

  it('reports path for nested changes', () => {
    const source = { data: { items: [1, 2] } };
    const target = { data: { items: [1, 2, 3] } };

    const result = diffState(source, target, { deepDiff: true });

    // Array change is reported at the key level
    const arrayChange = result.changes.find(c => c.key === 'data.items');
    expect(arrayChange).toBeDefined();
    expect(arrayChange?.changeType).toBe('modified');
  });
});
