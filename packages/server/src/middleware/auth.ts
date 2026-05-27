import { Request, Response, NextFunction } from 'express';

export type Workspace = {
  id: string;
  plan: string;
};

export type ValidateKeyFn = (key: string) => Promise<Workspace | null>;

export interface AuthenticatedRequest extends Request {
  workspace?: Workspace;
  apiKey?: { id: string; permissions: string };
}

export function createAuthMiddleware(options: { validateKey?: ValidateKeyFn } = {}) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing authorization header'
      });
    }

    const [scheme, key] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !key) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid authorization format. Use: Bearer <api-key>'
      });
    }

    // If validateKey is provided, use it for authentication
    if (options.validateKey) {
      const workspace = await options.validateKey(key);

      if (!workspace) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid API key'
        });
      }

      req.workspace = workspace;
    }

    next();
  };
}
