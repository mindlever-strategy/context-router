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
};

export class SchemaValidator {
  validate(
    schema: Record<string, FieldDefinition>,
    data: unknown,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof data !== 'object' || data === null) {
      return [{ path: '', expected: 'object', received: data }];
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
            received: undefined,
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
            received: value,
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

    switch (fieldDef.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({ path, expected: 'string', received: value });
        }
        break;

      case 'integer':
        if (!Number.isInteger(value)) {
          errors.push({ path, expected: 'integer', received: value });
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push({ path, expected: 'number', received: value });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({ path, expected: 'boolean', received: value });
        }
        break;

      case 'enum':
        if (!fieldDef.values?.includes(value as string)) {
          errors.push({
            path,
            expected: `enum(${fieldDef.values?.join(' | ')})`,
            received: value,
          });
        }
        break;

      case 'object':
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          errors.push({ path, expected: 'object', received: value });
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
          errors.push({ path, expected: 'array', received: value });
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
}
