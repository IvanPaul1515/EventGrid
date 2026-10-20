import { Request } from 'express';
import { prisma } from '../config/db.js';

export interface AuditParams {
  req: Request;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'CLONE_EDITION' | 'LOGIN';
  entity: 'PARTICIPANT' | 'REGISTRATION' | 'EVENT' | 'EVENT_SETTINGS' | 'USER' | 'IMPORT_BATCH';
  entityId?: string;
  changes?: Record<string, any>;
}

export async function recordAuditLog({ req, action, entity, entityId, changes }: AuditParams) {
  try {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Determinar si el campo changes debe ser serializado como string JSON (para SQLite) o objeto (PostgreSQL)
    let processedChanges: any = undefined;
    if (changes) {
      const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
      processedChanges = isSqlite ? JSON.stringify(changes) : changes;
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action: action as any,
        entity: entity as any,
        entityId: entityId || null,
        changes: processedChanges,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // La auditoría no debe bloquear la transacción principal si falla el log
    console.error('⚠️ Error al registrar log de auditoría:', error);
  }
}
