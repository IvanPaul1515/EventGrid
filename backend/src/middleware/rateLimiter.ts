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
    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      try {
        const currentNow = new Date();
        const currentNowMs = currentNow.getTime();
        const currentWindowStart = new Date(currentNowMs - WINDOW_MS);

        // Paso 1: Intentar incremento atómico directo dentro de la ventana activa (QA-25 / QA-32)
        const updateResult = await prisma.loginAttempt.updateMany({
          where: {
            key,
            firstAttemptAt: { gte: currentWindowStart },
          },
          data: {
            count: { increment: 1 },
          },
        });

        if (updateResult.count > 0) {
          // Comprobar si se alcanzó o superó el umbral para activar bloqueo
          const record = await prisma.loginAttempt.findUnique({ where: { key } });
          if (record && record.count >= MAX_FAILED_ATTEMPTS && (!record.blockedUntil || record.blockedUntil <= currentNow)) {
            await prisma.loginAttempt.updateMany({
              where: {
                key,
                OR: [{ blockedUntil: null }, { blockedUntil: { lte: currentNow } }],
              },
              data: {
                blockedUntil: new Date(currentNowMs + BLOCK_DURATION_MS),
              },
            }).catch(() => {});
          }
          return;
        }

        // Paso 2: La ventana expiró (< currentWindowStart) o el registro no existe.
        // a) Si ya existía pero expiró, reiniciar condicionalmente solo si sigue expirada (compare-and-swap)
        const resetResult = await prisma.loginAttempt.updateMany({
          where: {
            key,
            firstAttemptAt: { lt: currentWindowStart },
            OR: [{ blockedUntil: null }, { blockedUntil: { lte: currentNow } }],
          },
          data: {
            count: 1,
            firstAttemptAt: currentNow,
            blockedUntil: null,
          },
        });

        if (resetResult.count > 0) {
          return;
        }

        // b) Si no existía, intentar crear el registro inicial
        try {
          await prisma.loginAttempt.create({
            data: {
              key,
              count: 1,
              firstAttemptAt: currentNow,
              blockedUntil: null,
            },
          });
          return;
        } catch {
          // Conflicto por concurrencia
        }
      } catch {
        // En SQLite concurrente o socket timeout, esperar un instante y reintentar
        await new Promise((r) => setTimeout(r, 10 + Math.random() * 25));
      }
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

// Process-local safety bound for expensive explicit actions. No mail is queued by this limiter.
export function actionRateLimiter(max = 30, windowMs = 60000) {
  const windows = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now(); const key = req.user?.id || getClientIp(req);
    let current = windows.get(key);
    if (!current || now - current.start >= windowMs) {
      if (windows.size >= 10000) for (const [id, value] of windows) if (now - value.start >= windowMs) windows.delete(id);
      if (windows.size >= 10000 && !windows.has(key)) { res.setHeader('Retry-After', '60'); return res.status(429).json({message:'Demasiadas solicitudes. Intente más tarde.'}); }
      current = { start: now, count: 0 }; windows.set(key, current);
    }
    if (++current.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((windowMs - now + current.start) / 1000))));
      return res.status(429).json({ message: 'Demasiadas operaciones consecutivas. Espere antes de volver a confirmar.' });
    }
    next();
  };
}
