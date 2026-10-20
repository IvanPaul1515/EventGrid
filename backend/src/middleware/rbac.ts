import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requireRole(allowedRoles: Array<'ADMIN' | 'OPERATOR' | 'VIEWER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Usuario no autenticado'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Acceso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
}

export const requireAdmin = requireRole(['ADMIN']);
export const requireOperatorOrAdmin = requireRole(['ADMIN', 'OPERATOR']);
export const requireAnyRole = requireRole(['ADMIN', 'OPERATOR', 'VIEWER']);
