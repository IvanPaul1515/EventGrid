import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { requireAdmin, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { actionRateLimiter } from '../../middleware/rateLimiter.js';
const router = Router({ mergeParams: true });
router.use(requireOperatorOrAdmin);
const include = { createdBy: { select: { fullName: true } }, assignedTo: { select: { fullName: true } } };
router.get('/', async (req, res, next) => { try {
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
    const rows = await prisma.receptionIncident.findMany({ where: { eventId: req.eventId!, ...(search ? { participantLabel: { contains: search } } : {}) }, include, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ data: rows });
}
catch (e) {
    next(e);
} });
router.post('/', actionRateLimiter(40), async (req, res, next) => {
    try {
        const input = z.object({ requestKey: z.string().uuid(), registrationId: z.string().uuid().optional(), participantLabel: z.string().trim().min(2).max(160), category: z.enum(['NOT_FOUND', 'EMAIL', 'PAYMENT', 'QR', 'DUPLICATE', 'SHIRT', 'ADMIN', 'OTHER']), description: z.string().trim().min(3).max(1000) }).parse(req.body);
        const data = await writeTransaction(async (tx) => {
            const eventId = req.eventId!, createdByUserId = req.user!.id;
            const prior = await tx.receptionIncident.findUnique({ where: { eventId_createdByUserId_requestKey: { eventId, createdByUserId, requestKey: input.requestKey } } });
            if (prior)
                return prior;
            if (input.registrationId && !await tx.registration.findFirst({ where: { id: input.registrationId, eventId } }))
                throw new BadRequestError('Inscripción fuera de esta edición.');
            const incident = await tx.receptionIncident.create({ data: { ...input, eventId, createdByUserId } });
            const changes = { action: 'OPEN_INCIDENT', incidentId: incident.id, category: incident.category };
            await tx.auditLog.create({ data: { userId: createdByUserId, action: 'CREATE', entity: 'EVENT', entityId: eventId, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
            return incident;
        });
        res.status(201).json({ data, message: 'Incidencia abierta. Puede continuar con la recepción.' });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', requireAdmin, actionRateLimiter(60), async (req, res, next) => {
    try {
        const input = z.object({ status: z.enum(['REVIEW', 'RESOLVED', 'CANCELLED']), resolution: z.string().trim().max(1000).optional(), assignedToUserId: z.string().uuid().optional() }).parse(req.body);
        if (input.status === 'RESOLVED' && (!input.resolution || input.resolution.length < 3))
            throw new BadRequestError('Indique la solución aplicada.');
        const data = await writeTransaction(async (tx) => {
            const prior = await tx.receptionIncident.findFirst({ where: { id: req.params.id, eventId: req.eventId! } });
            if (!prior)
                throw new NotFoundError('Incidencia fuera de esta edición.');
            if (['RESOLVED', 'CANCELLED'].includes(prior.status))
                throw new ConflictError('La incidencia ya está cerrada. Consulte su resultado.');
            const assignedToUserId = input.assignedToUserId || req.user!.id;
            if (!await tx.user.findFirst({ where: { id: assignedToUserId, role: 'ADMIN', isActive: true, OR: [{ assignedEventId: null }, { assignedEventId: req.eventId! }] } }))
                throw new BadRequestError('Responsable no autorizado para esta edición.');
            const changed = await tx.receptionIncident.updateMany({ where: { id: prior.id, updatedAt: prior.updatedAt, status: prior.status }, data: { status: input.status, resolution: input.resolution || null, assignedToUserId, closedAt: input.status === 'REVIEW' ? null : new Date() } });
            if (changed.count !== 1)
                throw new ConflictError('Otro administrador modificó la incidencia.');
            const changes = { action: 'REVIEW_INCIDENT', incidentId: prior.id, before: prior.status, after: input.status, resolution: input.resolution || null };
            await tx.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE', entity: 'EVENT', entityId: req.eventId!, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
            return tx.receptionIncident.findUniqueOrThrow({ where: { id: prior.id }, include });
        });
        res.json({ data, message: 'Incidencia actualizada.' });
    }
    catch (e) {
        next(e);
    }
});
export default router;
