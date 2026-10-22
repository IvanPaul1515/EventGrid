import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { ForbiddenError } from '../utils/errors.js';

// Legacy accounts remain bound to the default edition until an administrator
// explicitly assigns one. Never trust a JWT or a client header for assignment.
export async function assignedEdition(user: { role: string; assignedEventId?: string | null }) {
  if (user.role === 'ADMIN') return null;
  if (user.assignedEventId) return user.assignedEventId;
  const event = await prisma.event.findFirst({
    orderBy: [{ isDefault: 'desc' }, { year: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (!event) throw new ForbiddenError('No tiene una edición asignada');
  return event.id;
}

export async function enforceEditionAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.role === 'ADMIN') return next();
    const allowed = await assignedEdition(req.user);
    // Session recovery and edition discovery must not depend on stale browser storage.
    const discovering = req.baseUrl.endsWith('/auth') || (req.baseUrl.endsWith('/events') && req.path === '/');
    const candidates = [req.params.eventId, req.params.id && req.baseUrl.endsWith('/events') ? req.params.id : null,
      req.query.eventId, discovering ? null : req.headers['x-event-id'], discovering ? null : req.headers['x-edition-id'], req.body?.eventId, req.body?.activeEventId];
    if (candidates.some(id => id != null && id !== '' && id !== allowed)) {
      throw new ForbiddenError('No tiene acceso a esta edición');
    }
    req.eventId = allowed!;
    const ids = [req.body?.registrationId, req.query.registrationId, ...(req.body?.selectedRegistrationIds || [])].filter(Boolean);
    if (ids.length) {
      const uniqueIds = [...new Set(ids)];
      const count = await prisma.registration.count({ where: { id: { in: uniqueIds }, eventId: allowed! } });
      if (count !== uniqueIds.length) throw new ForbiddenError('Inscripción fuera de su edición');
    }
    next();
  } catch (error) { next(error); }
}
