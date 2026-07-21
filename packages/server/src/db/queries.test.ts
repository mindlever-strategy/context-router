import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceName } from '../services/workspace.js';

describe('database-neutral query helpers', () => {
  it('normalizes workspace names for stable get-or-create behavior', () => {
    expect(normalizeWorkspaceName('  Ｒesearch  ')).toBe('research');
  });
});
