import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { recordAuditLog } from './audit.js';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos de ventana
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

export function getClientIp(req: Request): string {
  let ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip;
}

/**
 * QA-19 / Fase 4: Middleware de limitación de tasa persistente y atómico en base de datos
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

    // 2. Verificar bloqueo por Cuenta (sin revelar existencia de cuenta)
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
 * QA-19 / Fase 4: Registrar intento fallido con incremento ATÓMICO en almacenamiento persistente
 */
export async function recordFailedLogin(req: Request, email?: string) {
  const ip = getClientIp(req);
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const now = new Date();
  const nowMs = now.getTime();

  async function recordKey(key: string) {
    // Incremento atómico concurrente mediante upsert nativo
    const updated = await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, count: 1, firstAttemptAt: now, blockedUntil: null },
      update: { count: { increment: 1 } },
    });

    // Si la ventana expiró, reiniciar el conteo para el nuevo ciclo
    if (nowMs - updated.firstAttemptAt.getTime() > WINDOW_MS) {
      await prisma.loginAttempt.update({
        where: { key },
        data: { count: 1, firstAttemptAt: now, blockedUntil: null },
      });
      return;
    }

    // Si alcanza o supera el umbral, activar bloqueo atómico
    if (updated.count >= MAX_FAILED_ATTEMPTS && (!updated.blockedUntil || updated.blockedUntil <= now)) {
      await prisma.loginAttempt.update({
        where: { key },
        data: {
          blockedUntil: new Date(nowMs + BLOCK_DURATION_MS),
        },
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
