import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware } from './auth';

describe('Auth Middleware', () => {
  it('rejects request without authorization header', async () => {
    const middleware = createAuthMiddleware();
    const req = { headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid API key', async () => {
    const validateKey = vi.fn().mockResolvedValue({ id: 'ws-123', plan: 'pro' });
    const middleware = createAuthMiddleware({ validateKey });

    const req = { headers: { authorization: 'Bearer test-key' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.workspace).toBeDefined();
  });

  it('rejects invalid API key', async () => {
    const validateKey = vi.fn().mockResolvedValue(null);
    const middleware = createAuthMiddleware({ validateKey });

    const req = { headers: { authorization: 'Bearer invalid' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
