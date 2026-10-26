import { Router } from 'express';
import { z } from 'zod';
import { editionContext } from '../../middleware/editionContext.js';
import { requireRole } from '../../middleware/rbac.js';
import { prisma } from '../../config/db.js';
import { NotFoundError } from '../../utils/errors.js';
import { CommunicationTracking } from './tracking.service.js';
const router = Router();
router.use(requireRole(['ADMIN', 'OPERATOR']), editionContext);
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
router.get('/badges', async (req, res, next) => { try {
    const ids = z.string().max(4000).parse(req.query.ids).split(',').filter(Boolean);
    z.array(z.string().uuid()).max(100).parse(ids);
    res.json(await CommunicationTracking.participants(req.eventId!, req.user!.role === 'OPERATOR', { page: 1, limit: 100, ids }));
}
catch (e) {
    next(e);
} });
router.get('/summary', async (req, res, next) => { try {
    res.json({ data: await CommunicationTracking.summary(req.eventId!, req.user!.role === 'OPERATOR') });
}
catch (e) {
    next(e);
} });
router.get('/participants', async (req, res, next) => {
    try {
        const query = paging.extend({ search: z.string().max(200).optional(), filter: z.enum(['ALL', 'NONE', 'ACCEPTED', 'PENDING', 'FAILED', 'UNCERTAIN', 'DIGITAL', 'MISSING_DIGITAL', 'COURTESY', 'CONFIRMED', 'UNPAID']).default('ALL') }).parse(req.query);
        res.json(await CommunicationTracking.participants(req.eventId!, req.user!.role === 'OPERATOR', query));
    }
    catch (e) {
        next(e);
    }
});
router.get('/registration/:registrationId', async (req, res, next) => {
    try {
        const registration = await prisma.registration.findFirst({ where: { id: req.params.registrationId, eventId: req.eventId! }, select: { id: true, registrationNumber: true, participant: { select: { fullName: true, email: true } } } });
        if (!registration)
            throw new NotFoundError('Inscripción fuera de esta edición.');
        const { page, limit, templateCode } = paging.extend({ templateCode: z.string().min(1).max(100).optional() }).parse(req.query);
        res.json({ ...await CommunicationTracking.history(req.eventId!, req.user!.role === 'OPERATOR', registration.id, page, limit, templateCode), registration });
    }
    catch (e) {
        next(e);
    }
});
export default router;
