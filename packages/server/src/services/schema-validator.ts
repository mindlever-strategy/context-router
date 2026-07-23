export type FieldDefinition = {
  type:
    'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  required?: boolean;
  values?: string[];
  fields?: Record<string, FieldDefinition>;
  itemType?: FieldDefinition;
};

export type RequiresRule = {
  type: 'requires';
  when: { field: string; eq: unknown };
  fields: string[];
};

export type SemanticRule = RequiresRule;

export const SEMANTIC_RULES_KEY = '__semanticRules';

export type ValidationError = {
  path: string;
  expected: string;
  received: unknown;
  message?: string; // Human-readable message
};

export class SchemaValidator {
  validate(
    schema: Record<string, FieldDefinition>,
    data: unknown,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof data !== 'object' || data === null) {
      return [
        {
          path: '',
          expected: 'object',
          received: this.sanitizeReceived(data),
        },
      ];
    }

    const record = data as Record<string, unknown>;
    const fieldSchema = this.extractFieldSchema(schema);

    for (const [key, fieldDef] of Object.entries(fieldSchema)) {
      const value = record[key];

      if (value === undefined) {
        if (fieldDef.required) {
          errors.push({
            path: key,
            expected: fieldDef.type,
            received: this.sanitizeReceived(undefined),
          });
        }
        continue;
      }

      const fieldErrors = this.validateField(key, value, fieldDef);
      errors.push(...fieldErrors);
    }

    const semanticRules = this.extractSemanticRules(schema);
    errors.push(...this.validateSemanticRules(record, semanticRules));

    return errors;
  }

  extractFieldSchema(
    schema: Record<string, FieldDefinition | SemanticRule[] | unknown>,
  ): Record<string, FieldDefinition> {
    const entries = Object.entries(schema).filter(
      ([key]) => key !== SEMANTIC_RULES_KEY,
    );
    return Object.fromEntries(
      entries.filter(([, value]) => this.isFieldDefinition(value)),
    ) as Record<string, FieldDefinition>;
  }

  extractSemanticRules(
    schema: Record<string, FieldDefinition | SemanticRule[] | unknown>,
  ): SemanticRule[] {
    const rules = schema[SEMANTIC_RULES_KEY];
    if (!Array.isArray(rules)) return [];
    return rules.filter((rule): rule is SemanticRule =>
      this.isSemanticRule(rule),
    );
  }

  validateSemanticRules(
    data: Record<string, unknown>,
    rules: SemanticRule[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      if (rule.type !== 'requires') continue;
      const actual = data[rule.when.field];
      if (actual !== rule.when.eq) continue;

      for (const requiredField of rule.fields) {
        const value = data[requiredField];
        if (value === undefined || value === null || value === '') {
          errors.push({
            path: requiredField,
            expected: `required when ${rule.when.field}=${String(rule.when.eq)}`,
            received: this.sanitizeReceived(value),
          });
        }
      }
    }

    return errors;
  }

  private isFieldDefinition(value: unknown): value is FieldDefinition {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof (value as FieldDefinition).type === 'string'
    );
  }

  private isSemanticRule(value: unknown): value is SemanticRule {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as SemanticRule).type === 'requires'
    );
  }

  private validateField(
    path: string,
    value: unknown,
    fieldDef: FieldDefinition,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const valuePreview = this.previewValue(value);
    const received = this.sanitizeReceived(value);

    switch (fieldDef.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            path,
            expected: 'string',
            received,
            message: `Expected string but received ${typeof value}: ${valuePreview}`,
          });
        }
        break;

      case 'integer':
        if (!Number.isInteger(value)) {
          errors.push({
            path,
            expected: 'integer',
            received,
            message: `Expected integer but received ${typeof value} (${valuePreview}). Use Math.floor() or parseInt().`,
          });
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push({
            path,
            expected: 'number',
            received,
            message: `Expected number but received ${typeof value}: ${valuePreview}`,
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            path,
            expected: 'boolean',
            received,
            message: `Expected boolean (true/false) but received ${typeof value}: ${valuePreview}`,
          });
        }
        break;

      case 'enum':
        if (!fieldDef.values?.includes(value as string)) {
          errors.push({
            path,
            expected: `one of [${fieldDef.values?.join(', ')}]`,
            received,
            message: `Invalid enum value ${valuePreview}. Must be one of: ${fieldDef.values?.join(', ')}`,
          });
        }
        break;

      case 'object':
        if (value === null) {
          errors.push({
            path,
            expected: 'object',
            received,
            message: 'Object cannot be null. Use {} or omit the field.',
          });
        } else if (Array.isArray(value)) {
          errors.push({
            path,
            expected: 'object',
            received,
            message: `Expected object but received array. If you need an array, define it in the schema with type: "array".`,
          });
        } else if (typeof value !== 'object') {
          errors.push({
            path,
            expected: 'object',
            received,
            message: `Expected object but received ${typeof value}: ${valuePreview}`,
          });
        } else if (fieldDef.fields) {
          const nestedErrors = this.validate(fieldDef.fields, value);
          errors.push(
            ...nestedErrors.map((e) => ({
              ...e,
              path: `${path}.${e.path}`,
            })),
          );
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push({
            path,
            expected: 'array',
            received,
            message: `Expected array but received ${typeof value}: ${valuePreview}. Wrap the value in brackets [] if you intended an array.`,
          });
        } else if (fieldDef.itemType) {
          value.forEach((item, index) => {
            const itemErrors = this.validateField(
              `${path}[${index}]`,
              item,
              fieldDef.itemType!,
            );
            errors.push(...itemErrors);
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Safe descriptor for error messages — type/length only, never content.
   * Avoids leaking tokens, API keys, or PII into MCP client context.
   */
  private previewValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return `string(length=${value.length})`;
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (Array.isArray(value)) {
      return `Array(length=${value.length})`;
    }
    if (typeof value === 'object') {
      return `Object(keys=${Object.keys(value as object).length})`;
    }
    return typeof value;
  }

  /**
   * Sanitize `received` for MCP responses so raw values are not echoed.
   * null/undefined kept as-is (no content to leak).
   */
  private sanitizeReceived(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return { type: 'string', length: value.length };
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return { type: typeof value };
    }
    if (Array.isArray(value)) {
      return { type: 'array', length: value.length };
    }
    if (typeof value === 'object') {
      return {
        type: 'object',
        keyCount: Object.keys(value as object).length,
      };
    }
    return { type: typeof value };
  }
}
