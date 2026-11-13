import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordJournalDrop,
  readJournalDrops,
  resetJournalDrops,
  journaledJournalExport,
} from './journal-hooks.js';

// We need to mock the journal service module
vi.mock('./journal-service.js', () => ({
  journalService: {
    isEnabled: vi.fn().mockResolvedValue(true),
    append: vi.fn().mockRejectedValue(new Error('DB connection failed')),
  },
}));

describe('journal drop accounting', () => {
  beforeEach(() => {
    resetJournalDrops();
  });

  it('starts with a clean slate', () => {
    expect(readJournalDrops()).toEqual({ count: 0, lastError: null });
  });

  it('counts drops and remembers the most recent reason', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    recordJournalDrop('state.written', new Error('db offline'));
    recordJournalDrop('state.deleted', new Error('constraint failed'));

    expect(readJournalDrops()).toEqual({
      count: 2,
      lastError: 'state.deleted: constraint failed',
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

describe('journaledJournalExport error handling', () => {
  it('logs error when journal append fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await journaledJournalExport('workspace-id', 'workflow-id', 10, 'json', {
      since: '2024-01-01',
      until: '2024-01-02',
    });

    // Verify that errors are logged (not silently ignored)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to journal journal_exported'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
