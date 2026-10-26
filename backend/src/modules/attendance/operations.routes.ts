import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { requireAdmin } from '../../middleware/rbac.js';
const router = Router({ mergeParams: true });
router.get('/', requireAdmin, async (req, res, next) => {
    try {
        const eventId = req.eventId!;
        const [connected, recent, counts, pending, audit] = await Promise.all([
            prisma.user.findMany({ where: { id: { in: RealtimeService.connectedOperatorIds(eventId) }, role: 'OPERATOR', isActive: true, accountStatus: { not: 'PENDING' }, OR: [{ assignedEventId: eventId }, { assignedEventId: null }] }, select: { id: true, fullName: true } }),
            prisma.registration.findMany({ where: { eventId, attended: true }, orderBy: { attendedAt: 'desc' }, take: 10, select: { registrationNumber: true, attendedAt: true, participant: { select: { fullName: true } }, attendedByUser: { select: { fullName: true } } } }),
            prisma.registration.groupBy({ by: ['attendedByUserId'], where: { eventId, attended: true }, _count: { id: true } }),
            prisma.courtesyRequest.count({ where: { eventId, status: 'PENDING' } }),
            prisma.auditLog.findMany({ where: { entity: 'REGISTRATION', entityId: { in: (await prisma.registration.findMany({ where: { eventId }, select: { id: true }, take: 1000 })).map(r => r.id) } }, orderBy: { createdAt: 'desc' }, take: 50, select: { action: true, createdAt: true, changes: true } }),
        ]);
        const users = await prisma.user.findMany({ where: { id: { in: counts.flatMap(c => c.attendedByUserId ? [c.attendedByUserId] : []) } }, select: { id: true, fullName: true } });
        const errors = audit.filter(log => { try {
            const changes = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes as any;
            return ['REJECTED', 'ERROR', 'FAILURE'].includes(changes?.result);
        }
        catch {
            return false;
        } }).slice(0, 10).map(log => ({ action: log.action, at: log.createdAt }));
        res.json({ data: { connectedOperators: connected, connectionMeaning: 'Conexión SSE activa; no indica presencia física ni actividad.', recentEntries: recent, entriesByOperator: counts.map(c => ({ operator: users.find(u => u.id === c.attendedByUserId)?.fullName || 'Sin responsable identificado', count: c._count.id })), pendingCourtesies: pending, recordedErrors: errors, errorScope: 'Solo errores presentes en los últimos 50 registros de auditoría de hasta 1000 inscripciones; no equivale a todos los fallos de red.' } });
    }
    catch (e) {
        next(e);
    }
});
export default router;
