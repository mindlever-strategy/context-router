import { describe, it, expect } from 'vitest';
import { SchemaValidator, FieldDefinition } from './schema-validator';

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  it('validates string fields', () => {
    const schema: Record<string, FieldDefinition> = {
      companyName: { type: 'string', required: true },
    };
    expect(validator.validate(schema, { companyName: 'Acme' })).toEqual([]);
    expect(validator.validate(schema, { companyName: 123 })).toHaveLength(1);
  });

  it('validates integer fields', () => {
    const schema: Record<string, FieldDefinition> = {
      age: { type: 'integer', required: true },
    };
    expect(validator.validate(schema, { age: 25 })).toEqual([]);
    expect(validator.validate(schema, { age: '25' })).toHaveLength(1);
  });

  it('validates enum fields', () => {
    const schema: Record<string, FieldDefinition> = {
      status: { type: 'enum', values: ['PENDING', 'DONE'], required: true },
    };
    expect(validator.validate(schema, { status: 'PENDING' })).toEqual([]);
    expect(validator.validate(schema, { status: 'UNKNOWN' })).toHaveLength(1);
  });

  it('validates nested objects', () => {
    const schema: Record<string, FieldDefinition> = {
      user: {
        type: 'object',
        required: true,
        fields: {
          name: { type: 'string', required: true },
        },
      },
    };
    expect(validator.validate(schema, { user: { name: 'Jane' } })).toEqual([]);
    expect(validator.validate(schema, { user: { name: 123 } })).toHaveLength(1);
  });

  it('checks required fields', () => {
    const schema: Record<string, FieldDefinition> = {
      name: { type: 'string', required: true },
    };
    expect(validator.validate(schema, {})).toHaveLength(1);
  });

  it('allows optional fields to be missing', () => {
    const schema: Record<string, FieldDefinition> = {
      name: { type: 'string', required: false },
    };
    expect(validator.validate(schema, {})).toEqual([]);
  });

  it('validates semantic requires rules', () => {
    const schema = {
      validationStatus: {
        type: 'enum' as const,
        values: ['PENDING', 'CONFIRMED'],
        required: true,
      },
      decisionMakerEmail: { type: 'string' as const, required: false },
      __semanticRules: [
        {
          type: 'requires' as const,
          when: { field: 'validationStatus', eq: 'CONFIRMED' },
          fields: ['decisionMakerEmail'],
        },
      ],
    };
    expect(
      validator.validate(schema, {
        validationStatus: 'CONFIRMED',
        decisionMakerEmail: 'jane@acme.com',
      }),
    ).toEqual([]);
    expect(
      validator.validate(schema, { validationStatus: 'CONFIRMED' }),
    ).toHaveLength(1);
  });
});

describe('SchemaValidator - Error Messages', () => {
  const validator = new SchemaValidator();

  describe('string validation errors', () => {
    it('provides helpful message for wrong type', () => {
      const schema: Record<string, FieldDefinition> = {
        name: { type: 'string', required: true },
      };
      const errors = validator.validate(schema, { name: 123 });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('string');
      expect(errors[0].message).toContain('number');
    });

    it('shows value preview for wrong type values', () => {
      const schema: Record<string, FieldDefinition> = {
        name: { type: 'string', required: true },
      };
      // Pass a number instead of string
      const errors = validator.validate(schema, { name: 123 });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('string');
      expect(errors[0].message).toContain('number');
    });
  });

  describe('integer validation errors', () => {
    it('provides helpful message with type hint', () => {
      const schema: Record<string, FieldDefinition> = {
        count: { type: 'integer', required: true },
      };
      const errors = validator.validate(schema, { count: 3.14 });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('integer');
      expect(errors[0].message).toContain('number');
      expect(errors[0].message).toMatch(/(Math\.floor|parseInt)/);
    });

    it('shows string values with hint', () => {
      const schema: Record<string, FieldDefinition> = {
        count: { type: 'integer', required: true },
      };
      const errors = validator.validate(schema, { count: '42' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('integer');
    });
  });

  describe('number validation errors', () => {
    it('provides helpful message for non-numbers', () => {
      const schema: Record<string, FieldDefinition> = {
        price: { type: 'number', required: true },
      };
      const errors = validator.validate(schema, { price: 'free' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('number');
    });
  });

  describe('boolean validation errors', () => {
    it('provides helpful message for non-booleans', () => {
      const schema: Record<string, FieldDefinition> = {
        active: { type: 'boolean', required: true },
      };
      const errors = validator.validate(schema, { active: 'yes' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('boolean');
      expect(errors[0].message).toContain('true/false');
    });
  });

  describe('enum validation errors', () => {
    it('shows allowed values in message', () => {
      const schema: Record<string, FieldDefinition> = {
        status: { type: 'enum', values: ['A', 'B', 'C'], required: true },
      };
      const errors = validator.validate(schema, { status: 'X' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('A, B, C');
      // Invalid value content is redacted — only type/length shown
      expect(errors[0].message).toContain('string(length=1)');
      expect(errors[0].message).not.toContain('"X"');
    });
  });

  describe('object validation errors', () => {
    it('provides helpful message for null objects', () => {
      const schema: Record<string, FieldDefinition> = {
        config: { type: 'object', required: true },
      };
      const errors = validator.validate(schema, { config: null });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('null');
      expect(errors[0].message).toContain('{}');
    });

    it('provides helpful message for arrays when object expected', () => {
      const schema: Record<string, FieldDefinition> = {
        config: { type: 'object', required: true },
      };
      const errors = validator.validate(schema, { config: [1, 2, 3] });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('array');
      expect(errors[0].message).toContain('object');
    });

    it('suggests using array type for array values', () => {
      const schema: Record<string, FieldDefinition> = {
        items: { type: 'object', required: true },
      };
      const errors = validator.validate(schema, { items: ['a', 'b'] });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('array');
    });

    it('handles nested validation with paths', () => {
      const schema: Record<string, FieldDefinition> = {
        user: {
          type: 'object',
          required: true,
          fields: {
            email: { type: 'string', required: true },
          },
        },
      };
      const errors = validator.validate(schema, { user: { email: 123 } });
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('user.email');
    });
  });

  describe('array validation errors', () => {
    it('provides helpful message for non-arrays', () => {
      const schema: Record<string, FieldDefinition> = {
        items: { type: 'array', required: true },
      };
      const errors = validator.validate(schema, { items: 'not an array' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('array');
      expect(errors[0].message).toContain('[]');
    });

    it('validates array items with path including index', () => {
      const schema: Record<string, FieldDefinition> = {
        numbers: { type: 'array', required: true, itemType: { type: 'number' } },
      };
      const errors = validator.validate(schema, { numbers: [1, 'two', 3] });
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('numbers[1]');
      expect(errors[0].message).toContain('number');
    });
  });

  describe('semantic rules error messages', () => {
    it('shows which field triggered the requirement', () => {
      const schema = {
        isActive: { type: 'boolean' as const },
        activationReason: { type: 'string' as const },
        __semanticRules: [
          {
            type: 'requires' as const,
            when: { field: 'isActive', eq: true },
            fields: ['activationReason'],
          },
        ],
      };
      const errors = validator.validate(schema, { isActive: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('activationReason');
      expect(errors[0].expected).toContain('isActive=true');
    });
  });

  describe('required field error messages', () => {
    it('shows missing required fields', () => {
      const schema: Record<string, FieldDefinition> = {
        email: { type: 'string', required: true },
        name: { type: 'string', required: true },
      };
      const errors = validator.validate(schema, {});
      expect(errors).toHaveLength(2);
      expect(errors.map((e) => e.path)).toContain('email');
      expect(errors.map((e) => e.path)).toContain('name');
    });
  });
});

describe('SchemaValidator - previewValue (private, via error messages)', () => {
  const validator = new SchemaValidator();

  // The previewValue function is private but we can test it indirectly
  // through the error messages it generates

  it('redacts string content and shows length only', () => {
    const schema: Record<string, FieldDefinition> = {
      description: { type: 'number', required: true }, // wrong type to trigger error
    };
    const secret = 'sk-live-super-secret-api-key-value-here';
    const errors = validator.validate(schema, { description: secret });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(`string(length=${secret.length})`);
    expect(errors[0].message).not.toContain('sk-live');
    expect(errors[0].message).not.toContain(secret.slice(0, 10));
    expect(errors[0].received).toEqual({
      type: 'string',
      length: secret.length,
    });
  });

  it('shows null received value in previews', () => {
    const schema: Record<string, FieldDefinition> = {
      value: { type: 'string', required: true },
    };
    // Pass null instead of string - should fail
    const errors = validator.validate(schema, { value: null });
    expect(errors).toHaveLength(1);
    // The received value should be null
    expect(errors[0].received).toBeNull();
  });

  it('shows undefined for missing required fields', () => {
    const schema: Record<string, FieldDefinition> = {
      name: { type: 'string', required: true },
    };
    const errors = validator.validate(schema, {});
    expect(errors).toHaveLength(1);
    expect(errors[0].received).toBeUndefined();
  });

  it('shows arrays with Array(length=N) notation in previews', () => {
    const schema: Record<string, FieldDefinition> = {
      tags: { type: 'string', required: true }, // wrong type, should fail
    };
    const errors = validator.validate(schema, { tags: ['a', 'b', 'c'] });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Array(length=3)');
  });

  it('shows objects with key count only (no key names)', () => {
    const schema: Record<string, FieldDefinition> = {
      config: { type: 'string', required: true }, // wrong type
    };
    const errors = validator.validate(schema, {
      config: { apiKey: 'secret', token: 'x' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Object(keys=2)');
    expect(errors[0].message).not.toContain('apiKey');
    expect(errors[0].message).not.toContain('token');
  });
});

describe('SchemaValidator - edge cases', () => {
  const validator = new SchemaValidator();

  it('handles null input data', () => {
    const schema: Record<string, FieldDefinition> = {
      name: { type: 'string', required: true },
    };
    const errors = validator.validate(schema, null);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('');
    expect(errors[0].expected).toBe('object');
  });

  it('handles non-object input data', () => {
    const schema: Record<string, FieldDefinition> = {
      name: { type: 'string', required: true },
    };
    expect(validator.validate(schema, 'string')).toHaveLength(1);
    expect(validator.validate(schema, 123)).toHaveLength(1);
    expect(validator.validate(schema, [])).toHaveLength(1);
  });

  it('handles empty schema', () => {
    const errors = validator.validate({}, { anyKey: 'anyValue' });
    expect(errors).toHaveLength(0);
  });

  it('ignores __semanticRules in field schema extraction', () => {
    const schema = {
      name: { type: 'string' as const, required: true },
      __semanticRules: [{ type: 'requires', when: { field: 'x', eq: 1 }, fields: ['name'] }],
    };
    const errors = validator.validate(schema, { name: 'test' });
    expect(errors).toHaveLength(0);
  });

  it('handles deeply nested objects', () => {
    const schema: Record<string, FieldDefinition> = {
      level1: {
        type: 'object',
        fields: {
          level2: {
            type: 'object',
            fields: {
              level3: { type: 'string', required: true },
            },
          },
        },
      },
    };
    expect(validator.validate(schema, { level1: { level2: { level3: 'deep' } } })).toHaveLength(0);
    const errors = validator.validate(schema, { level1: { level2: { level3: 123 } } });
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('level1.level2.level3');
  });
});
