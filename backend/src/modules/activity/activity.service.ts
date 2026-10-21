import { prisma } from '../../config/db.js';
import { ListActivityQuery } from './activity.dto.js';
import * as XLSX from 'xlsx';

export class ActivityService {
  static async list(query: ListActivityQuery) {
    const { page = 1, limit = 25, userId, action, entity, startDate, endDate, search, result } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId && userId !== 'ALL') {
      where.userId = userId;
    }

    if (action && action !== 'ALL') {
      where.action = action;
    }

    if (entity && entity !== 'ALL') {
      where.entity = entity;
    }

    if (result && result !== 'ALL') {
      where.changes = { ...(where.changes || {}), contains: `"result":"${result}"` };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { entityId: { contains: term } },
        { changes: { contains: term } },
        { user: { fullName: { contains: term } } },
        { user: { email: { contains: term } } },
      ];
    }

    const [total, logs, users, distinctActions, distinctEntities] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: 'asc' },
      }),
      prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
      }),
      prisma.auditLog.findMany({
        distinct: ['entity'],
        select: { entity: true },
      }),
    ]);

    const formattedLogs = logs.map((log) => {
      let changesObj = log.changes;
      if (typeof changesObj === 'string') {
        try {
          changesObj = JSON.parse(changesObj);
        } catch {
          // Keep as string if parsing fails
        }
      }
      return {
        ...log,
        changes: changesObj,
      };
    });

    return {
      data: formattedLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      filters: {
        users,
        actions: distinctActions.map((a) => a.action),
        entities: distinctEntities.map((e) => e.entity),
      },
    };
  }

  /**
   * Exportar historial de actividades a archivo Excel (.xlsx)
   */
  static async export(query: ListActivityQuery) {
    const { userId, action, entity, startDate, endDate, search, result } = query;
    const where: any = {};

    if (userId && userId !== 'ALL') where.userId = userId;
    if (action && action !== 'ALL') where.action = action;
    if (entity && entity !== 'ALL') where.entity = entity;
    if (result && result !== 'ALL') {
      where.changes = { ...(where.changes || {}), contains: `"result":"${result}"` };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { entityId: { contains: term } },
        { changes: { contains: term } },
        { user: { fullName: { contains: term } } },
        { user: { email: { contains: term } } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: {
        user: { select: { fullName: true, email: true, role: true } },
      },
    });

    const rows = logs.map((log) => {
      let details = '';
      let outcome = 'EXITOSO';
      let participant = '';
      let tshirt = '';

      if (log.changes) {
        let ch: any = log.changes;
        if (typeof ch === 'string') {
          try { ch = JSON.parse(ch); } catch {}
        }
        if (typeof ch === 'object' && ch !== null) {
          if (ch.result === 'REJECTED') outcome = 'RECHAZADO';
          else if (ch.result === 'FAILED') outcome = 'FALLIDO';

          if (ch.participantName) participant = ch.participantName;
          if (ch.ticket || ch.ticketNumber) participant += ` (${ch.ticket || ch.ticketNumber})`;
          if (ch.tshirtSize) tshirt = ch.tshirtSize;
          if (ch.reason) details = `Motivo: ${ch.reason}`;
          else if (ch.action) details = `Acción: ${ch.action}`;
        }
      }

      return {
        'Fecha / Hora': new Date(log.createdAt).toLocaleString('es-DO'),
        'Usuario Responsable': log.user ? `${log.user.fullName} (${log.user.email})` : 'Sistema',
        'Rol': log.user?.role || 'SISTEMA',
        'Acción': log.action,
        'Módulo / Entidad': log.entity,
        'ID Referencia': log.entityId || 'N/A',
        'Participante Relacionado': participant || 'N/A',
        'T-Shirt': tshirt || 'N/A',
        'Resultado': outcome,
        'Detalles': details || (typeof log.changes === 'string' ? log.changes.slice(0, 100) : 'Completado'),
        'Dirección IP': log.ipAddress || '127.0.0.1',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial_Actividades');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `EventGrid_Historial_Actividades_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return {
      buffer,
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
