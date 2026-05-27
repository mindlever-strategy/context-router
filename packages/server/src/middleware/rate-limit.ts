import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';

type PlanLimits = {
  requestsPerMinute: number;
};

type CheckLimitResult = {
  remaining: number;
  resetAt: number;
};

type GetPlanLimitsFn = (plan: string) => PlanLimits;
type CheckLimitFn = (workspaceId: string) => Promise<CheckLimitResult>;

export function createRateLimitMiddleware(options: {
  getPlanLimits: GetPlanLimitsFn;
  checkLimit: CheckLimitFn;
}) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.workspace) {
      return next();
    }

    const limits = options.getPlanLimits(req.workspace.plan);
    const result = await options.checkLimit(req.workspace.id);

    res.setHeader('X-RateLimit-Limit', limits.requestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    const resetInSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (result.remaining <= 0) {
      res.setHeader('Retry-After', resetInSeconds.toString());
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please retry later.',
        retryAfter: resetInSeconds
      });
    }

    next();
  };
}
