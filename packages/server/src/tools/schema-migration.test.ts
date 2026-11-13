import { describe, expect, it, vi } from 'vitest';

describe('schema_migrate validation', () => {
  it('catches fromVersion === toVersion before Zod validation', async () => {
    const { registerSchemaMigrationTools } =
      await import('./schema-migration.js');
    const tools = registerSchemaMigrationTools({} as never, () => 'user');
    const migrate = tools.get('schema_migrate')!;

    const result = await migrate.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'test',
      fromVersion: 1,
      toVersion: 1,
      transforms: [{ type: 'add_field', field: 'x' }],
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error.code).toBe(
      'INVALID_VERSION_RANGE',
    );
  });

  it('catches fromVersion > toVersion with INVALID_VERSION_RANGE', async () => {
    const { registerSchemaMigrationTools } =
      await import('./schema-migration.js');
    const tools = registerSchemaMigrationTools({} as never, () => 'user');
    const migrate = tools.get('schema_migrate')!;

    const result = await migrate.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'test',
      fromVersion: 3,
      toVersion: 1,
      transforms: [{ type: 'add_field', field: 'x' }],
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error.code).toBe(
      'INVALID_VERSION_RANGE',
    );
  });

  it('returns INVALID_VERSION_RANGE when fromVersion equals toVersion', async () => {
    const { registerSchemaMigrationTools } =
      await import('./schema-migration.js');

    const tools = registerSchemaMigrationTools(
      {} as never,
      () => 'test-user-id',
    );
    const migrate = tools.get('schema_migrate');
    if (!migrate) throw new Error('schema_migrate was not registered');

    const result = await migrate.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'test-schema',
      fromVersion: 1,
      toVersion: 1,
      transforms: [{ type: 'add_field', field: 'newField', value: 'default' }],
      dryRun: true,
      batchSize: 100,
    });

    expect(result.isError).toBe(true);
    const response = JSON.parse(result.content[0].text);
    expect(response.error.code).toBe('INVALID_VERSION_RANGE');
    expect(response.error.message).toContain(
      'toVersion must be greater than fromVersion',
    );
  });

  it('does not return INVALID_VERSION_RANGE when fromVersion differs from toVersion', async () => {
    const { registerSchemaMigrationTools } =
      await import('./schema-migration.js');

    const tools = registerSchemaMigrationTools(
      {} as never,
      () => 'test-user-id',
    );
    const migrate = tools.get('schema_migrate');
    if (!migrate) throw new Error('schema_migrate was not registered');

    const result = await migrate.handler({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'test-schema',
      fromVersion: 1,
      toVersion: 2,
      transforms: [{ type: 'add_field', field: 'newField', value: 'default' }],
      dryRun: true,
      batchSize: 100,
    });

    // If there's an error, it should NOT be INVALID_VERSION_RANGE about version range
    if (result.isError) {
      const response = JSON.parse(result.content[0].text);
      expect(response.error.code).not.toBe('INVALID_VERSION_RANGE');
      expect(response.error.message).not.toContain(
        'toVersion must be greater than fromVersion',
      );
    }
  });
});
