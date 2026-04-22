import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';

export interface AuthRequest extends Request {
  userId?: string;
}

export function authMiddleware() {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.slice(7);
      const userId = await AuthService.verifyToken(token);
      req.userId = userId;
      next();
    } catch (err) {
      next();
    }
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}
