type FieldDefinition = {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  required?: boolean;
  values?: string[];
  fields?: Record<string, FieldDefinition>;
  itemType?: FieldDefinition;
};

export type ValidationError = {
  path: string;
  expected: string;
  received: unknown;
};

export class SchemaValidator {
  validate(schema: Record<string, FieldDefinition>, data: unknown): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof data !== 'object' || data === null) {
      return [{ path: '', expected: 'object', received: data }];
    }

    const record = data as Record<string, unknown>;

    for (const [key, fieldDef] of Object.entries(schema)) {
      const value = record[key];

      if (value === undefined) {
        if (fieldDef.required) {
          errors.push({ path: key, expected: fieldDef.type, received: undefined });
        }
        continue;
      }

      const fieldErrors = this.validateField(key, value, fieldDef);
      errors.push(...fieldErrors);
    }

    return errors;
  }

  private validateField(path: string, value: unknown, fieldDef: FieldDefinition): ValidationError[] {
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
            received: value
          });
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push({ path, expected: 'object', received: value });
        } else if (fieldDef.fields) {
          const nestedErrors = this.validate(fieldDef.fields, value);
          errors.push(...nestedErrors.map(e => ({
            ...e,
            path: `${path}.${e.path}`
          })));
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push({ path, expected: 'array', received: value });
        } else if (fieldDef.itemType) {
          value.forEach((item, index) => {
            const itemErrors = this.validateField(`${path}[${index}]`, item, fieldDef.itemType!);
            errors.push(...itemErrors);
          });
        }
        break;
    }

    return errors;
  }
}
