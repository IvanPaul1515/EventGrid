import { DeviceSessionService } from '../modules/auth/device-session.service.js';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { enforceEditionAccess } from './editionAccess.js';
import { prisma } from '../config/db.js';

export interface AuthUser {
  scannerOnly?: boolean;
  id: string;
  email: string;
  fullName: string;
  assignedEventId?: string | null;
  expiresAt?: number;
  sessionId?: string;
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
      sid?: string;
      id: string;
      exp?: number;
      sessionVersion?: number;
      email: string;
      role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
    };

    // Verificar que el usuario continúe activo en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, fullName: true, scannerOnly: true, role: true, assignedEventId: true, isActive: true, accountStatus: true, sessionVersion: true },
    });

    if (user && (decoded.sessionVersion || 0) !== user.sessionVersion) return next(new UnauthorizedError('La sesión fue revocada. Inicie sesión nuevamente'));
    if (!user || !user.isActive || user.accountStatus === 'PENDING') {
      return next(new UnauthorizedError('Usuario inactivo o no encontrado'));
    }

    const session = await DeviceSessionService.validate(token, decoded, user);
    req.user = {
      sessionId: session.id,
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as any,
      scannerOnly: user.scannerOnly,
      assignedEventId: user.assignedEventId,
      sessionVersion: user.sessionVersion,
      expiresAt: session.expiresAt,
    };

    if (user.scannerOnly) {
      const path = new URL(req.originalUrl, 'http://localhost').pathname;
      const prefix = ENV.API_PREFIX;
      const relative = path.startsWith(prefix) ? path.slice(prefix.length) : '';
      const allowed = /^(\/auth\/(me|logout|change-password))$/.test(relative) || /^(\/events\/[^/]+\/stream)$/.test(relative) && req.method === 'GET' || /^(\/events\/[^/]+\/reception-queue\/(state|stats|stations|discoverable|join|request|read|preview|devices\/[^/]+\/(confirm|unlink)))$/.test(relative);
      if (relative === '/events' && req.method === 'GET') {
        if (!user.assignedEventId) throw new ForbiddenError('El perfil Escáner QR requiere edición asignada.');
        const event = await prisma.event.findUnique({where:{id:user.assignedEventId},select:{id:true,name:true,year:true,slug:true,status:true,isDefault:true,startDate:true,endDate:true,settings:{select:{primaryColor:true,secondaryColor:true,logoUrl:true}}}});
        return res.json({data:event?[event]:[]});
      }
      if (!allowed) throw new ForbiddenError('El perfil Escáner QR solo puede leer para una cola autorizada.');
    }
    await enforceEditionAccess(req, res, next);
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('La sesión ha expirado. Inicie sesión nuevamente'));
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') return next(new UnauthorizedError('Token de autenticación inválido'));
    return next(error); // Database/server failures must not invalidate a valid session.
  }
}
