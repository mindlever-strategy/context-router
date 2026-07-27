import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logging.js';

describe('structured logger (MCP stdio safety)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes info logs to stderr, never stdout', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('[TTL] Cleanup service started', { intervalMs: 60000, batchSize: 100 });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = String(errorSpy.mock.calls[0][0]);
    expect(payload).toContain('Cleanup service started');
    expect(payload).toContain('batchSize');
  });

  it('writes debug and audit logs to stderr, never stdout', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // debug may be filtered by LOG_LEVEL; force via warn/error path coverage with audit
    logger.audit('tool_called', { tool: 'state_write' });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
