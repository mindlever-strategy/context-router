import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimitMiddleware } from './rate-limit';

describe('Rate Limit Middleware', () => {
  const getPlanLimits = vi.fn().mockReturnValue({ requestsPerMinute: 100 });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests within limit', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ remaining: 99, resetAt: Date.now() + 60000 });
    const middleware = createRateLimitMiddleware({ getPlanLimits, checkLimit });

    const req = { workspace: { id: 'ws-123' } } as any;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
  });

  it('rejects requests over limit', async () => {
    const resetAt = Date.now() + 30000;
    const checkLimit = vi.fn().mockResolvedValue({ remaining: 0, resetAt });
    const middleware = createRateLimitMiddleware({ getPlanLimits, checkLimit });

    const req = { workspace: { id: 'ws-123' } } as any;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });
});
