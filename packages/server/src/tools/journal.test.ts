import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These will be set in beforeEach after importing
let registerJournalTools: typeof import('./journal.js').registerJournalTools;
let mockJournalService: {
  query: ReturnType<typeof vi.fn>;
  replay: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
  getCurrentSequence: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
};
let mockJournaledJournalExport: ReturnType<typeof vi.fn>;
let mockRecordJournalDrop: ReturnType<typeof vi.fn>;

// Mock the journal service before importing journal.ts
vi.mock('../services/journal-service.js', () => ({
  journalService: {
    query: vi.fn(),
    replay: vi.fn(),
    getStats: vi.fn(),
    export: vi.fn(),
    getCurrentSequence: vi.fn(),
    append: vi.fn(),
  },
}));

// Mock the journal hooks with all exports
vi.mock('../services/journal-hooks.js', () => ({
  journaledJournalExport: vi.fn(),
  recordJournalDrop: vi.fn(),
  resetJournalDrops: vi.fn(),
  readJournalDrops: vi.fn().mockReturnValue({ count: 0, lastError: null }),
}));

// Mock prisma
vi.mock('../db/client.js', () => ({
  prisma: {
    eventJournalEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    checkpoint: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));

// Valid UUIDs for testing (UUID v4 format)
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('journal_query tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules to get references
    const journalServiceModule = await import('../services/journal-service.js');
    mockJournalService = journalServiceModule.journalService as typeof mockJournalService;

    const hooksModule = await import('../services/journal-hooks.js');
    mockJournaledJournalExport = hooksModule.journaledJournalExport as ReturnType<typeof vi.fn>;
    mockRecordJournalDrop = hooksModule.recordJournalDrop as ReturnType<typeof vi.fn>;

    // Set up default mock behaviors
    mockJournaledJournalExport.mockResolvedValue(undefined);
    mockRecordJournalDrop.mockImplementation(() => {});

    vi.stubEnv('DATABASE_URL', 'sqlite://./test.sqlite');
    vi.stubEnv('JOURNAL_ENABLED', 'true');

    // Import fresh to get mocked modules
    const module = await import('./journal.js');
    registerJournalTools = module.registerJournalTools;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // =========================================================================
  // Bug 1: Invalid cursor should throw error, not silently swallow
  // =========================================================================
  describe('Bug 1: cursor validation', () => {
    it('should throw CURSOR_INVALID error for invalid base64 cursor', async () => {
      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const invalidCursor = Buffer.from('not-valid-json').toString('base64');

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        cursor: invalidCursor,
      });

      // The tool returns error response via ToolOperationError
      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('CURSOR_INVALID');
      expect(errorText.error.message).toContain('base64-encoded JSON');
    });

    it('should throw CURSOR_INVALID for valid JSON but missing sequence field', async () => {
      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const invalidCursor = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        cursor: invalidCursor,
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('CURSOR_INVALID');
    });

    it('should throw CURSOR_INVALID for non-numeric sequence value', async () => {
      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const invalidCursor = Buffer.from(JSON.stringify({ sequence: 'not-a-number' })).toString('base64');

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        cursor: invalidCursor,
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('CURSOR_INVALID');
    });

    it('should accept valid cursor with numeric sequence', async () => {
      mockJournalService.query.mockResolvedValue({
        entries: [],
        hasMore: false,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const validCursor = Buffer.from(JSON.stringify({ sequence: 42 })).toString('base64');

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        cursor: validCursor,
      });

      // Should succeed without error
      expect(result.isError).toBeFalsy();
      expect(mockJournalService.query).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Bug 2: stats view should respect eventTypes filter
  // =========================================================================
  describe('Bug 2: stats view with eventTypes', () => {
    it('should pass eventTypes and agentId to getStats', async () => {
      mockJournalService.getStats.mockResolvedValue({
        totalEvents: 5,
        byEventType: { state_written: 5 },
        byWorkflow: { [WORKFLOW_ID]: 5 },
        timeRange: null,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'stats',
        eventTypes: ['state_written', 'state_deleted'],
        agentId: 'agent-123',
      });

      expect(result.isError).toBeFalsy();
      expect(mockJournalService.getStats).toHaveBeenCalled();
      const callArgs = mockJournalService.getStats.mock.calls[0];
      // Check that eventTypes and agentId were passed
      expect(callArgs[1]).toMatchObject({
        eventTypes: ['state_written', 'state_deleted'],
        agentId: 'agent-123',
      });
    });
  });

  // =========================================================================
  // Bug 3: replay view should respect eventTypes and agentId
  // =========================================================================
  describe('Bug 3: replay view with filters', () => {
    it('should pass eventTypes and agentId to replay', async () => {
      mockJournalService.replay.mockResolvedValue({});
      mockJournalService.getCurrentSequence.mockResolvedValue(10);
      const { prisma } = await import('../db/client.js');
      (prisma.eventJournalEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'replay',
        eventTypes: ['state_written'],
        agentId: 'agent-123',
      });

      expect(mockJournalService.replay).toHaveBeenCalled();
      const callArgs = mockJournalService.replay.mock.calls[0];
      // Check that eventTypes and agentId were passed (3rd and 4th args)
      expect(callArgs[3]).toEqual(['state_written']);
      expect(callArgs[4]).toBe('agent-123');
    });
  });

  // =========================================================================
  // Bug 4: replay view should apply workspaceId filter on checkpoint lookup
  // =========================================================================
  describe('Bug 4: replay view workspace isolation', () => {
    it('should include workspaceId when looking up checkpoint', async () => {
      const mockCheckpoint = {
        snapshot: JSON.stringify({ key: 'initial' }),
      };
      const { prisma } = await import('../db/client.js');
      (prisma.checkpoint.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockCheckpoint);
      mockJournalService.replay.mockResolvedValue({ key: 'from-replay' });
      mockJournalService.getCurrentSequence.mockResolvedValue(10);

      // Also need to mock the entry lookup to return a checkpoint
      const mockEntry = {
        payload: { checkpointId: 'checkpoint-123' },
      };
      (prisma.eventJournalEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntry);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'replay',
        untilSequence: 10,
      });

      // After fix, should include workspaceId in the checkpoint lookup
      expect(prisma.checkpoint.findFirst).toHaveBeenCalledWith({
        where: { id: 'checkpoint-123', workspaceId: WORKSPACE_ID },
      });
    });

    it('should not query checkpoint if no checkpoint entry found', async () => {
      const { prisma } = await import('../db/client.js');
      (prisma.eventJournalEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      mockJournalService.replay.mockResolvedValue({});
      mockJournalService.getCurrentSequence.mockResolvedValue(10);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'replay',
        untilSequence: 10,
      });

      // Should not call checkpoint.findFirst when no checkpoint entry exists
      expect(prisma.checkpoint.findFirst).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Bug 5: export view should handle malformed JSON gracefully
  // =========================================================================
  describe('Bug 5: export view JSON parsing', () => {
    it('should handle malformed JSON export data without crashing', async () => {
      mockJournalService.export.mockResolvedValue({
        data: 'not-valid-json{{{{{',
        contentType: 'application/json',
        size: 20,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        exportFormat: 'json',
      });

      // After fix, should handle gracefully instead of crashing
      expect(result.isError).toBeFalsy();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data.data).toBe('not-valid-json{{{{{');
    });

    it('should handle valid JSON export data correctly', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([{ id: '1', eventType: 'state_written' }]),
        contentType: 'application/json',
        size: 50,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        exportFormat: 'json',
      });

      expect(result.isError).toBeFalsy();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.data.eventCount).toBe(1);
    });
  });

  // =========================================================================
  // Bug 6: journaledJournalExport error should be logged, not silently ignored
  // =========================================================================
  describe('Bug 6: journaledJournalExport error handling', () => {
    it('should log errors from journaledJournalExport via console.error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });
      mockJournaledJournalExport.mockRejectedValue(
        new Error('journal export failed'),
      );

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
      });

      // Bug 6 fix: should call console.error instead of just recordJournalDrop
      expect(mockJournaledJournalExport).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        '[journal] failed to record export:',
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it('should still return export data even if journaledJournalExport fails', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([{ id: '1' }]),
        contentType: 'application/json',
        size: 20,
      });
      mockJournaledJournalExport.mockRejectedValue(
        new Error('journal export failed'),
      );

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
      });

      // Should still succeed even if journaledJournalExport fails
      expect(result.isError).toBeFalsy();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
    });
  });

  // =========================================================================
  // Bug 7: workflowId should be null, not 'unknown'
  // =========================================================================
  describe('Bug 7: workflowId null vs unknown', () => {
    it('should pass null when workflowId is undefined', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        // No workflowId
      });

      // Verify journaledJournalExport was called with null instead of 'unknown'
      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[1]).toBeNull();
    });

    it('should pass workflowId when provided', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'export',
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[1]).toBe(WORKFLOW_ID);
    });
  });

  // =========================================================================
  // Bug 8: since should be null, not new Date(0).toISOString()
  // =========================================================================
  describe('Bug 8: since null vs new Date(0)', () => {
    it('should pass null when since is undefined', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        // No since
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[4].since).toBeNull();
    });

    it('should pass since when provided', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const sinceDate = '2024-01-15T10:00:00.000Z';
      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        since: sinceDate,
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[4].since).toBe(sinceDate);
    });

    it('should not use epoch date as default', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[4].since).not.toBe('1970-01-01T00:00:00.000Z');
    });
  });

  // =========================================================================
  // Bug 11: until should use null default for symmetry with since
  // =========================================================================
  describe('Bug 11: until null vs new Date().toISOString()', () => {
    it('should pass null when until is undefined', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        // No until
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[4].until).toBeNull();
    });

    it('should pass until when provided', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const untilDate = '2024-01-15T10:00:00.000Z';
      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
        until: untilDate,
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      expect(callArgs[4].until).toBe(untilDate);
    });

    it('should not use current date as default for until', async () => {
      mockJournalService.export.mockResolvedValue({
        data: JSON.stringify([]),
        contentType: 'application/json',
        size: 2,
      });

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        view: 'export',
      });

      expect(mockJournaledJournalExport).toHaveBeenCalled();
      const callArgs = mockJournaledJournalExport.mock.calls[0];
      // until should be null, not a current timestamp
      expect(callArgs[4].until).toBeNull();
      // Verify it's not a recent date (would fail if it was new Date().toISOString())
      expect(new Date(callArgs[4].until).getTime()).not.toBeGreaterThan(Date.now());
    });
  });

  // =========================================================================
  // Bug 9: currentSequence should use untilSequence atomically, not query separately
  // =========================================================================
  describe('Bug 9: atomic currentSequence from replay', () => {

  // =========================================================================
  // Bug 10: sequence view should reject incompatible filters
  // =========================================================================
  describe('Bug 10: sequence view filter validation', () => {
    it('rejects eventTypes filter with VALIDATION_ERROR', async () => {
      mockJournalService.getCurrentSequence.mockResolvedValue(5);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'sequence',
        eventTypes: ['checkpoint_created'],
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('VALIDATION_ERROR');
      expect(errorText.error.message).toContain('eventTypes');
    });

    it('rejects agentId filter with VALIDATION_ERROR', async () => {
      mockJournalService.getCurrentSequence.mockResolvedValue(5);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'sequence',
        agentId: 'agent-123',
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('VALIDATION_ERROR');
      expect(errorText.error.message).toContain('agentId');
    });

    it('rejects since filter with VALIDATION_ERROR', async () => {
      mockJournalService.getCurrentSequence.mockResolvedValue(5);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'sequence',
        since: '2024-01-15T10:00:00.000Z',
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('VALIDATION_ERROR');
      expect(errorText.error.message).toContain('since');
    });

    it('rejects until filter with VALIDATION_ERROR', async () => {
      mockJournalService.getCurrentSequence.mockResolvedValue(5);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'sequence',
        until: '2024-01-15T10:00:00.000Z',
      });

      expect(result.isError).toBe(true);
      const errorText = JSON.parse(result.content[0].text);
      expect(errorText.error.code).toBe('VALIDATION_ERROR');
      expect(errorText.error.message).toContain('until');
    });

    it('accepts sequence view with only workspaceId and workflowId', async () => {
      mockJournalService.getCurrentSequence.mockResolvedValue(10);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'sequence',
      });

      expect(result.isError).toBeFalsy();
      expect(mockJournalService.getCurrentSequence).toHaveBeenCalledWith(
        WORKSPACE_ID,
        WORKFLOW_ID,
      );
    });
  });
    it('returns currentSequence from replay entries, not a separate query', async () => {
      // Simulate entries returned from replay
      mockJournalService.replay.mockResolvedValue({ key: 'value' });
      mockJournalService.getCurrentSequence.mockResolvedValue(5); // stale value

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'replay',
        untilSequence: 7,
      });

      // After fix: getCurrentSequence should NOT be called when untilSequence is provided
      expect(mockJournalService.getCurrentSequence).not.toHaveBeenCalled();
      // Verify the result was successful (wrapped in content array format)
      expect(result.isError).toBeFalsy();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.data.currentSequence).toBe(7);
    });

    it('falls back to getCurrentSequence when untilSequence is not provided', async () => {
      mockJournalService.replay.mockResolvedValue({ key: 'value' });
      mockJournalService.getCurrentSequence.mockResolvedValue(10);

      const tools = registerJournalTools({} as never, () => 'test-user');
      const queryTool = tools.get('journal_query');
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        view: 'replay',
        // No untilSequence
      });

      // When no untilSequence, should fall back to getCurrentSequence
      expect(mockJournalService.getCurrentSequence).toHaveBeenCalled();
      expect(result.isError).toBeFalsy();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.data.currentSequence).toBe(10);
    });
  });
});
