import { Request, Response, NextFunction } from 'express';
import { recordAuditLog } from './audit.js';

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

const loginAttemptsByIp = new Map<string, AttemptRecord>();
const loginAttemptsByEmail = new Map<string, AttemptRecord>();

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos de ventana
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * QA-19: Middleware de limitación de tasa para inicio de sesión
 */
export function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : null;
  const now = Date.now();

  // 1. Verificar bloqueo por IP
  const ipRecord = loginAttemptsByIp.get(ip);
  if (ipRecord && ipRecord.blockedUntil && now < ipRecord.blockedUntil) {
    const remainingSeconds = Math.ceil((ipRecord.blockedUntil - now) / 1000);
    res.setHeader('Retry-After', remainingSeconds);
    return res.status(429).json({
      status: 'error',
      message: `Demasiados intentos fallidos desde esta dirección IP. Intente nuevamente en ${remainingSeconds} segundos.`,
    });
  }

  // 2. Verificar bloqueo por Cuenta
  if (email) {
    const emailRecord = loginAttemptsByEmail.get(email);
    if (emailRecord && emailRecord.blockedUntil && now < emailRecord.blockedUntil) {
      const remainingSeconds = Math.ceil((emailRecord.blockedUntil - now) / 1000);
      res.setHeader('Retry-After', remainingSeconds);
      return res.status(429).json({
        status: 'error',
        message: `La cuenta se encuentra temporalmente protegida por intentos fallidos repetidos. Intente nuevamente en ${remainingSeconds} segundos.`,
      });
    }
  }

  next();
}

/**
 * QA-19: Registrar intento fallido de autenticación
 */
export function recordFailedLogin(req: Request, email?: string) {
  const ip = getClientIp(req);
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const now = Date.now();

  // Actualizar por IP
  const ipRec = loginAttemptsByIp.get(ip) || { count: 0, firstAttemptAt: now };
  if (now - ipRec.firstAttemptAt > WINDOW_MS) {
    ipRec.count = 1;
    ipRec.firstAttemptAt = now;
    ipRec.blockedUntil = undefined;
  } else {
    ipRec.count++;
  }

  if (ipRec.count >= MAX_FAILED_ATTEMPTS) {
    ipRec.blockedUntil = now + BLOCK_DURATION_MS;
  }
  loginAttemptsByIp.set(ip, ipRec);

  // Actualizar por Email
  if (cleanEmail) {
    const emailRec = loginAttemptsByEmail.get(cleanEmail) || { count: 0, firstAttemptAt: now };
    if (now - emailRec.firstAttemptAt > WINDOW_MS) {
      emailRec.count = 1;
      emailRec.firstAttemptAt = now;
      emailRec.blockedUntil = undefined;
    } else {
      emailRec.count++;
    }

    if (emailRec.count >= MAX_FAILED_ATTEMPTS) {
      emailRec.blockedUntil = now + BLOCK_DURATION_MS;
    }
    loginAttemptsByEmail.set(cleanEmail, emailRec);
  }

  // Auditoría sin guardar contraseñas
  recordAuditLog({
    req,
    action: 'LOGIN_FAILED',
    entity: 'AUTH',
    changes: {
      attemptedEmail: cleanEmail,
      attemptsCount: ipRec.count,
      ip,
      isBlocked: Boolean(ipRec.blockedUntil),
    },
  }).catch(() => {});
}

/**
 * Limpiar intentos fallidos tras un inicio de sesión exitoso
 */
export function clearFailedLogin(req: Request, email?: string) {
  const ip = getClientIp(req);
  loginAttemptsByIp.delete(ip);
  if (email) {
    loginAttemptsByEmail.delete(email.toLowerCase().trim());
  }
}

/**
 * Helper para pruebas automatizadas
 */
export function resetRateLimitStore() {
  loginAttemptsByIp.clear();
  loginAttemptsByEmail.clear();
}
