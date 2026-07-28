import { describe, expect, it, vi } from 'vitest';

describe('schema_migrate validation', () => {
  it('returns VALIDATION_ERROR when fromVersion equals toVersion', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerSchemaMigrationTools } = await import('./schema-migration.js');

    const tools = registerSchemaMigrationTools({} as never, () => 'test-user-id');
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
    expect(response.error.code).toBe('VALIDATION_ERROR');
    expect(response.error.message).toContain('fromVersion and toVersion must be different');
    vi.unstubAllEnvs();
  });

  it('does not return VALIDATION_ERROR when fromVersion differs from toVersion', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://contextrouter:password@localhost:5432/contextrouter',
    );
    const { registerSchemaMigrationTools } = await import('./schema-migration.js');

    const tools = registerSchemaMigrationTools({} as never, () => 'test-user-id');
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

    // If there's an error, it should NOT be a VALIDATION_ERROR about fromVersion/toVersion
    if (result.isError) {
      const response = JSON.parse(result.content[0].text);
      expect(response.error.code).not.toBe('VALIDATION_ERROR');
      expect(response.error.message).not.toContain('fromVersion and toVersion must be different');
    }
    vi.unstubAllEnvs();
  });
});
