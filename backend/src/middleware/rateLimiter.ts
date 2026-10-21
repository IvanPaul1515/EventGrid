import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { recordAuditLog } from './audit.js';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos de ventana
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

export function getClientIp(req: Request): string {
  // Con 'trust proxy' habilitado en Express, req.ip extrae la IP real del cliente
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * QA-19: Middleware de limitación de tasa persistente en base de datos
 */
export async function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : null;
    const now = new Date();

    // 1. Verificar bloqueo por IP
    const ipAttempt = await prisma.loginAttempt.findUnique({
      where: { key: `ip:${ip}` },
    });

    if (ipAttempt && ipAttempt.blockedUntil && now < ipAttempt.blockedUntil) {
      const remainingSeconds = Math.ceil((ipAttempt.blockedUntil.getTime() - now.getTime()) / 1000);
      res.setHeader('Retry-After', remainingSeconds);
      return res.status(429).json({
        status: 'error',
        message: `Demasiados intentos fallidos desde esta dirección IP. Intente nuevamente en ${remainingSeconds} segundos.`,
      });
    }

    // 2. Verificar bloqueo por Cuenta
    if (email) {
      const emailAttempt = await prisma.loginAttempt.findUnique({
        where: { key: `email:${email}` },
      });

      if (emailAttempt && emailAttempt.blockedUntil && now < emailAttempt.blockedUntil) {
        const remainingSeconds = Math.ceil((emailAttempt.blockedUntil.getTime() - now.getTime()) / 1000);
        res.setHeader('Retry-After', remainingSeconds);
        return res.status(429).json({
          status: 'error',
          message: `La cuenta se encuentra temporalmente protegida por intentos fallidos repetidos. Intente nuevamente en ${remainingSeconds} segundos.`,
        });
      }
    }

    next();
  } catch (err) {
    // Tolerancia ante fallos: no denegar acceso si el almacén no responde
    next();
  }
}

/**
 * QA-19: Registrar intento fallido de autenticación en almacenamiento persistente
 */
export async function recordFailedLogin(req: Request, email?: string) {
  const ip = getClientIp(req);
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const now = new Date();
  const nowMs = now.getTime();

  async function recordKey(key: string) {
    const existing = await prisma.loginAttempt.findUnique({ where: { key } });
    if (!existing || nowMs - existing.firstAttemptAt.getTime() > WINDOW_MS) {
      await prisma.loginAttempt.upsert({
        where: { key },
        create: { key, count: 1, firstAttemptAt: now, blockedUntil: null },
        update: { count: 1, firstAttemptAt: now, blockedUntil: null },
      });
    } else {
      const newCount = existing.count + 1;
      const blockedUntil = newCount >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + BLOCK_DURATION_MS) : null;
      await prisma.loginAttempt.update({
        where: { key },
        data: { count: newCount, blockedUntil },
      });
    }
  }

  try {
    await recordKey(`ip:${ip}`);
    if (cleanEmail) {
      await recordKey(`email:${cleanEmail}`);
    }
  } catch {}

  // Auditoría sin guardar contraseñas
  recordAuditLog({
    req,
    action: 'LOGIN_FAILED',
    entity: 'AUTH',
    changes: {
      attemptedEmail: cleanEmail,
      ip,
    },
  }).catch(() => {});
}

/**
 * Limpiar intentos fallidos tras un inicio de sesión exitoso
 */
export async function clearFailedLogin(req: Request, email?: string) {
  const ip = getClientIp(req);
  const keys = [`ip:${ip}`];
  if (email) {
    keys.push(`email:${email.toLowerCase().trim()}`);
  }
  try {
    await prisma.loginAttempt.deleteMany({
      where: { key: { in: keys } },
    });
  } catch {}
}

/**
 * Helper para pruebas automatizadas
 */
export async function resetRateLimitStore() {
  try {
    await prisma.loginAttempt.deleteMany({});
  } catch {}
}
