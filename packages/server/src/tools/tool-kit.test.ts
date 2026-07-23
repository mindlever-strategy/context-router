import { describe, it, expect } from 'vitest';
import { success, failure, ToolOperationError } from './tool-kit.js';

describe('tool-kit - success/failure helpers', () => {
  describe('success', () => {
    it('wraps data correctly', () => {
      const result = success({ key: 'value' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ key: 'value' });
    });

    it('handles null data', () => {
      const result = success(null);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeNull();
    });

    it('handles arrays', () => {
      const result = success([1, 2, 3]);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual([1, 2, 3]);
    });
  });

  describe('failure', () => {
    it('creates error response with code and message', () => {
      const result = failure('TEST_ERROR', 'Something went wrong');

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('TEST_ERROR');
      expect(parsed.error.message).toBe('Something went wrong');
    });

    it('includes details when provided', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const result = failure('VALIDATION_ERROR', 'Invalid input', details);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.details).toEqual(details);
    });

    it('does not include details when undefined', () => {
      const result = failure('TEST_ERROR', 'Error message');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.details).toBeUndefined();
    });

    it('includes suggestion for actionable errors', () => {
      const result = failure('STATE_NOT_FOUND', 'State key not found');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toBeDefined();
      expect(parsed.error.suggestion).toContain('Tip:');
    });

    it('includes hint for VALIDATION_ERROR with field errors', () => {
      const fieldErrors = {
        fieldErrors: {
          email: ['Invalid email format'],
          name: ['Required field'],
        },
      };
      const result = failure('VALIDATION_ERROR', 'Validation failed', fieldErrors);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.hint).toBeDefined();
      expect(parsed.error.hint).toContain('email');
      expect(parsed.error.hint).toContain('name');
    });
  });

  describe('error code messages', () => {
    const errorCodes = [
      // Workspace errors
      'WORKSPACE_NOT_FOUND',
      'WORKSPACE_NAME_AMBIGUOUS',
      'WORKSPACE_ALREADY_EXISTS',
      'WORKSPACE_DELETE_FORBIDDEN',

      // Workflow errors
      'WORKFLOW_NOT_FOUND',
      'WORKFLOW_NOT_RUNNING',
      'WORKFLOW_ALREADY_COMPLETED',
      'WORKFLOW_ALREADY_FAILED',

      // State errors
      'STATE_NOT_FOUND',
      'STATE_VERSION_MISMATCH',
      'SCHEMA_NOT_FOUND',
      'SCHEMA_VALIDATION_FAILED',

      // Checkpoint errors
      'CHECKPOINT_NOT_FOUND',
      'CHECKPOINT_RESTORE_FAILED',
      'CHECKPOINT_LIMIT_EXCEEDED',

      // Concurrency errors
      'VERSION_CONFLICT',

      // Permission errors
      'WRITE_FORBIDDEN',
      'READ_FORBIDDEN',
      'AGENT_ROLE_NOT_FOUND',

      // Step errors
      'STEP_EXECUTION_NOT_FOUND',
      'STEP_ALREADY_COMPLETED',
      'STEP_ALREADY_FAILED',

      // Validation errors
      'VALIDATION_ERROR',

      // Handoff errors
      'HANDOFF_GENERATION_FAILED',
      'HANDOFF_INVALID_KEYS',

      // Generic
      'INTERNAL_ERROR',
      'TOOL_NOT_FOUND',
    ];

    errorCodes.forEach((code) => {
      it(`provides message for ${code}`, () => {
        const result = failure(code, 'test');
        const parsed = JSON.parse(result.content[0].text);

        // Should have a meaningful message (not the generic fallback)
        expect(parsed.error.message).toBeTruthy();
        expect(parsed.error.message).not.toBe(`Operation failed: ${code}`);
      });
    });

    it('returns fallback message for unknown error codes', () => {
      // Unknown codes use the custom message passed in
      const result = failure('UNKNOWN_ERROR_CODE', 'Custom error message');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.message).toBe('Custom error message');
      expect(parsed.error.code).toBe('UNKNOWN_ERROR_CODE');
    });
  });

  describe('error suggestions', () => {
    it('provides suggestion for STATE_NOT_FOUND', () => {
      const result = failure('STATE_NOT_FOUND', 'State not found');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('state_write()');
    });

    it('provides suggestion for WORKFLOW_NOT_RUNNING', () => {
      const result = failure('WORKFLOW_NOT_RUNNING', 'Workflow is not running');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('router.start()');
    });

    it('provides suggestion for VERSION_CONFLICT', () => {
      const result = failure('VERSION_CONFLICT', 'Version conflict');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('expectedVersion');
    });

    it('provides suggestion for SCHEMA_VALIDATION_FAILED', () => {
      const result = failure('SCHEMA_VALIDATION_FAILED', 'Schema validation failed');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('schema_validate()');
    });

    it('provides suggestion for CHECKPOINT_NOT_FOUND', () => {
      const result = failure('CHECKPOINT_NOT_FOUND', 'Checkpoint not found');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('checkpoint_list()');
    });

    it('provides suggestion for WRITE_FORBIDDEN', () => {
      const result = failure('WRITE_FORBIDDEN', 'Write forbidden');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toContain('agentRole');
    });

    it('does not provide suggestion for errors without suggestions', () => {
      const result = failure('TOOL_NOT_FOUND', 'Tool not found');
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.suggestion).toBeUndefined();
    });
  });
});

describe('ToolOperationError', () => {
  it('creates error with code, message, and details', () => {
    const error = new ToolOperationError('TEST_CODE', 'Test message', { extra: 'data' });

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.details).toEqual({ extra: 'data' });
  });

  it('works without details', () => {
    const error = new ToolOperationError('TEST_CODE', 'Test message');

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.details).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const error = new ToolOperationError('TEST_CODE', 'Test message');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof ToolOperationError).toBe(true);
  });
});

describe('defineTool', () => {
  it('should be importable', async () => {
    const module = await import('./tool-kit.js');
    expect(typeof module.defineTool).toBe('function');
    expect(typeof module.success).toBe('function');
    expect(typeof module.failure).toBe('function');
    expect(typeof module.ToolOperationError).toBe('function');
  });
});
