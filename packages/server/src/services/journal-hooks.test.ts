import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordJournalDrop,
  readJournalDrops,
  resetJournalDrops,
} from './journal-hooks.js';

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
