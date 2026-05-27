import { describe, it, expect } from 'vitest';
import { HandoffGenerator } from './handoff-generator';

describe('HandoffGenerator', () => {
  const generator = new HandoffGenerator();

  it('formats snake_case keys to Title Case', () => {
    const result = generator.formatKey('company_name');
    expect(result).toBe('Company name');
  });

  it('formats camelCase keys to Title Case', () => {
    const result = generator.formatKey('companyName');
    expect(result).toBe('Company name');
  });

  it('formats enum values to lowercase', () => {
    const result = generator.formatValue('CONFIRMED');
    expect(result).toBe('CONFIRMED');
  });

  it('formats numbers with USD suffix', () => {
    const result = generator.formatValue(12000000, 'revenue_usd');
    expect(result).toBe('12000000');
  });

  it('truncates long strings', () => {
    const longString = 'a'.repeat(60);
    const result = generator.formatValue(longString);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('generates summary from state', () => {
    const state = {
      company_name: 'Acme Corp',
      domain: 'acme.com',
      status: 'CONFIRMED'
    };
    const result = generator.generate(state, { maxTokens: 100 });
    expect(result).toContain('Acme Corp');
    expect(result).toContain('acme.com');
    expect(result).toContain('CONFIRMED');
  });
});
