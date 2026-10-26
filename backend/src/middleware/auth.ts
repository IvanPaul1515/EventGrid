import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';
import { enforceEditionAccess } from './editionAccess.js';
import { prisma } from '../config/db.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  assignedEventId?: string | null;
  expiresAt?: number;
  sessionVersion?: number;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      eventId?: string;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // 1. Extraer desde cabecera Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    // 2. Extraer desde cookies seguras
    else if (req.cookies && req.cookies.barcamp_token) {
      token = req.cookies.barcamp_token;
    }
    // 3. Extraer desde query parameter (EventSource / SSE)
    else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return next(new UnauthorizedError('Acceso no autorizado. Debe iniciar sesión'));
    }

    // Verificar firma del JWT
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as {
      id: string;
      exp?: number;
      sessionVersion?: number;
      email: string;
      role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
    };

    // Verificar que el usuario continúe activo en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, fullName: true, role: true, assignedEventId: true, isActive: true, accountStatus: true, sessionVersion: true },
    });

    if (user && (decoded.sessionVersion || 0) !== user.sessionVersion) return next(new UnauthorizedError('La sesión fue revocada. Inicie sesión nuevamente'));
    if (!user || !user.isActive || user.accountStatus === 'PENDING') {
      return next(new UnauthorizedError('Usuario inactivo o no encontrado'));
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as any,
      assignedEventId: user.assignedEventId,
      sessionVersion: user.sessionVersion,
      expiresAt: decoded.exp ? decoded.exp * 1000 : undefined,
    };

    await enforceEditionAccess(req, res, next);
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('La sesión ha expirado. Inicie sesión nuevamente'));
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') return next(new UnauthorizedError('Token de autenticación inválido'));
    return next(error); // Database/server failures must not invalidate a valid session.
  }
}
