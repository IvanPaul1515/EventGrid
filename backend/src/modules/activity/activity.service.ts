import { prisma } from '../../config/db.js';
import { ListActivityQuery } from './activity.dto.js';

export class ActivityService {
  static async list(query: ListActivityQuery) {
    const { page = 1, limit = 25, userId, action, entity, startDate, endDate, search } = query;
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
}
