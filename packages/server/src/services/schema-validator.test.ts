import { describe, it, expect } from 'vitest';
import { SchemaValidator } from './schema-validator';

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  it('validates string fields', () => {
    const schema = { companyName: { type: 'string', required: true } };
    expect(validator.validate(schema, { companyName: 'Acme' })).toEqual([]);
    expect(validator.validate(schema, { companyName: 123 })).toHaveLength(1);
  });

  it('validates integer fields', () => {
    const schema = { age: { type: 'integer', required: true } };
    expect(validator.validate(schema, { age: 25 })).toEqual([]);
    expect(validator.validate(schema, { age: '25' })).toHaveLength(1);
  });

  it('validates enum fields', () => {
    const schema = {
      status: { type: 'enum', values: ['PENDING', 'DONE'], required: true }
    };
    expect(validator.validate(schema, { status: 'PENDING' })).toEqual([]);
    expect(validator.validate(schema, { status: 'UNKNOWN' })).toHaveLength(1);
  });

  it('validates nested objects', () => {
    const schema = {
      user: {
        type: 'object',
        required: true,
        fields: {
          name: { type: 'string', required: true }
        }
      }
    };
    expect(validator.validate(schema, { user: { name: 'Jane' } })).toEqual([]);
    expect(validator.validate(schema, { user: { name: 123 } })).toHaveLength(1);
  });

  it('checks required fields', () => {
    const schema = { name: { type: 'string', required: true } };
    expect(validator.validate(schema, {})).toHaveLength(1);
  });

  it('allows optional fields to be missing', () => {
    const schema = { name: { type: 'string', required: false } };
    expect(validator.validate(schema, {})).toEqual([]);
  });
});
