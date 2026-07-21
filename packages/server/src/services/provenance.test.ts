import { describe, expect, it } from 'vitest';
import { unwrapState, wrapStateValue } from './provenance.js';

describe('provenance envelopes', () => {
  it('wraps and unwraps per-field values', () => {
    const wrapped = wrapStateValue(
      { companySize: 150 },
      { agentRole: 'research', source: 'web_search', confidence: 0.9 },
    );
    expect(wrapped.companySize).toMatchObject({
      value: 150,
      provenance: {
        agentRole: 'research',
        source: 'web_search',
        confidence: 0.9,
      },
    });
    expect(unwrapState(wrapped as Record<string, unknown>)).toEqual({
      companySize: 150,
    });
  });
});
