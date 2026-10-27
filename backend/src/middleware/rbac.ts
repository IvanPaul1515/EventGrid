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

export type Permission =
  | 'COURTESY_AUTHORIZE'
  | 'PRICE_MODIFY'
  | 'REGISTRATION_CANCEL'
  | 'REGISTRATION_REACTIVATE'
  | 'ATTENDANCE_REVERT'
  | 'FINANCIAL_ADJUST'
  | 'PARTICIPANTS_EXPORT'
  | 'SETTINGS_MANAGE'
  | 'DEMO_MANAGE'
  | 'COMMUNICATIONS_MANAGE'
  | 'COMMUNICATIONS_SEND'
  | 'QR_SCAN'
  | 'QR_REVOKE';

export const ROLE_PERMISSIONS: Record<'ADMIN' | 'OPERATOR' | 'VIEWER', Permission[]> = {
  ADMIN: [
    'COURTESY_AUTHORIZE',
    'PRICE_MODIFY',
    'REGISTRATION_CANCEL',
    'REGISTRATION_REACTIVATE',
    'ATTENDANCE_REVERT',
    'FINANCIAL_ADJUST',
    'PARTICIPANTS_EXPORT',
    'SETTINGS_MANAGE',
    'DEMO_MANAGE',
    'COMMUNICATIONS_MANAGE',
    'COMMUNICATIONS_SEND',
    'QR_SCAN',
    'QR_REVOKE',
  ],
  OPERATOR: [
    'PARTICIPANTS_EXPORT',
    'COMMUNICATIONS_SEND',
    'QR_SCAN',
  ],
  VIEWER: [
    'PARTICIPANTS_EXPORT',
  ],
};

export function hasPermission(role: 'ADMIN' | 'OPERATOR' | 'VIEWER', permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Usuario no autenticado'));
    }

    if (!hasPermission(req.user.role, permission)) {
      return next(
        new ForbiddenError(
          `Acceso denegado. Permiso insuficiente: se requiere ${permission}`
        )
      );
    }

    next();
  };
}

export const requireAdmin = requireRole(['ADMIN']);
export const requireOperatorOrAdmin = requireRole(['ADMIN', 'OPERATOR']);
export const requireAnyRole = requireRole(['ADMIN', 'OPERATOR', 'VIEWER']);

export const requireGlobalAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN' || req.user.assignedEventId) return next(new ForbiddenError('Esta operación requiere un administrador global.'));
  next();
};
