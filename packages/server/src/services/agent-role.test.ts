import { describe, expect, it } from 'vitest';
import { filterReadableState, matchesKeyPattern } from './agent-role.js';

describe('agent role patterns', () => {
  it('matches exact and wildcard patterns', () => {
    expect(matchesKeyPattern('lead', ['lead'])).toBe(true);
    expect(matchesKeyPattern('leadScore', ['lead*'])).toBe(true);
    expect(matchesKeyPattern('score', ['lead*'])).toBe(false);
    expect(matchesKeyPattern('anything', ['*'])).toBe(true);
  });

  it('filters readable state by role patterns', () => {
    const filtered = filterReadableState(
      { lead: { name: 'Acme' }, score: { value: 90 }, secret: 'x' },
      ['lead', 'score'],
    );
    expect(filtered).toEqual({
      lead: { name: 'Acme' },
      score: { value: 90 },
    });
  });
});
