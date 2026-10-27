import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { requireAdmin, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { ParticipantsService } from './participants.service.js';
import { CreateRegistrationSchema } from './participants.dto.js';
import { recordCourtesyRequest, courtesyAudit } from './courtesy.policy.js';
import { auditCourtesy, authorizeCourtesy } from './registrationPolicy.js';
import { actionRateLimiter } from '../../middleware/rateLimiter.js';
const router = Router({ mergeParams: true });
const requestSchema = z.object({ requestKey: z.string().uuid(), exceptionType: z.enum(['COURTESY','SPONSOR','GUEST','AGREEMENT']).default('COURTESY'), agreementReference: z.string().trim().max(250).optional(), reason: z.string().trim().min(3).max(1000), registrationId: z.string().optional(), registration: CreateRegistrationSchema.optional() }).refine(x => Boolean(x.registrationId) !== Boolean(x.registration), 'Indique una inscripción o los datos del participante.');
const include = { registration: { select: { id: true, registrationNumber: true, participant: { select: { fullName: true } } } }, requestedBy: { select: { id: true, fullName: true } }, decidedBy: { select: { id: true, fullName: true } }, event: { select: { name: true } } };
router.use(requireOperatorOrAdmin);
router.get('/', async (req, res, next) => {
    try {
        const requests = await prisma.courtesyRequest.findMany({ where: { eventId: req.eventId!, ...(req.user!.role === 'ADMIN' ? {} : { requestedByUserId: req.user!.id }), ...(req.query.status === 'PENDING' ? { status: 'PENDING' } : {}) }, include, orderBy: { createdAt: 'desc' }, take: 100 });
        res.json({ data: requests });
    }
    catch (e) {
        next(e);
    }
});
router.post('/', actionRateLimiter(40), async (req, res, next) => {
    try {
        if (req.user!.role !== 'OPERATOR')
            throw new ForbiddenError('Los administradores aprueban desde su propia sesión.');
        const data = requestSchema.parse(req.body), eventId = req.eventId!, userId = req.user!.id;
        if (data.registration) {
            const input = { ...data.registration, isCourtesy: false, courtesyAuthorizedBy: null, courtesyReason: null, ticketTypeId: null, paymentMethodId: null, amountPaid: 0, totalAmount: 0, isVerified: false, status: 'PENDING' as const };
            await ParticipantsService.create(eventId, input, userId, { key: data.requestKey, reason: data.reason, exceptionType: data.exceptionType, agreementReference: data.agreementReference });
        }
        else
            await writeTransaction(async (tx) => {
                const previous = await tx.courtesyRequest.findUnique({ where: { eventId_requestedByUserId_requestKey: { eventId, requestedByUserId: userId, requestKey: data.requestKey } } });
                if (previous) {
                    if (previous.registrationId !== data.registrationId)
                        throw new ConflictError('La clave corresponde a otra solicitud. Consulte el resultado existente.');
                    return;
                }
                const registration = await tx.registration.findFirst({ where: { id: data.registrationId!, eventId } });
                if (!registration)
                    throw new NotFoundError('Inscripción fuera de esta edición.');
                await recordCourtesyRequest(tx, eventId, registration, userId, data.reason, data.requestKey, data);
            });
        const result = await prisma.courtesyRequest.findFirst({ where: { eventId, requestedByUserId: userId, ...(data.registrationId ? { registrationId: data.registrationId } : { requestKey: data.requestKey }) }, include, orderBy: { createdAt: 'desc' } });
        res.status(201).json({ message: 'Solicitud enviada. Pendiente de autorización.', data: result });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:requestId/decision', requireAdmin, actionRateLimiter(120), async (req, res, next) => {
    try {
        const input = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().max(1000).optional() }).parse(req.body);
        const data = await writeTransaction(async (tx) => {
            const request = await tx.courtesyRequest.findFirst({ where: { id: req.params.requestId, eventId: req.eventId! }, include: { registration: true } });
            if (!request)
                throw new NotFoundError('Solicitud fuera de esta edición.');
            if (request.requestedByUserId === req.user!.id)
                throw new ForbiddenError('No puede aprobar su propia solicitud.');
            if (request.status !== 'PENDING')
                throw new ConflictError('La solicitud ya fue resuelta. Consulte el resultado actual.');
            const changed = await tx.courtesyRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: input.decision, pendingRegistrationId: null, decidedByUserId: req.user!.id, decidedAt: new Date(), decisionReason: input.reason || null } });
            if (changed.count !== 1)
                throw new ConflictError('Otro administrador resolvió esta solicitud.');
            if (input.decision === 'APPROVED') {
                const r = request.registration;
                if (r.isCourtesy || r.attended || Number(r.amountPaid) > 0 || r.status === 'CANCELLED')
                    throw new BadRequestError('La inscripción cambió: revise pagos y asistencia antes de aprobar.');
                const approval = await authorizeCourtesy(tx, request.eventId, req.user!.id, request.reason);
                await tx.registration.update({ where: { id: r.id }, data: { isCourtesy: true, courtesyAuthorizedBy: approval.name, courtesyUserId: approval.id, courtesyReason: approval.reason, courtesyDate: approval.date, ticketPrice: 0, amountPaid: 0, balanceDue: 0, totalAmount: 0, paymentStatus: 'COURTESY', paymentMethodId: null, salesResponsibleId: null, status: 'CONFIRMED', isVerified: true, updatedByUserId: req.user!.id } });
                await auditCourtesy(tx, request.eventId, r.id, req.user!.id, approval);
            }
            await courtesyAudit(tx, req.user!.id, request.registrationId, { action: 'DECIDE_COURTESY', requestId: request.id, status: input.decision, reason: input.reason || null, requestedByUserId: request.requestedByUserId, decidedByUserId: req.user!.id, exceptionType: request.exceptionType, agreementReference: request.agreementReference });
            return tx.courtesyRequest.findUniqueOrThrow({ where: { id: request.id }, include });
        });
        res.json({ message: data.status === 'APPROVED' ? 'Cortesía aprobada' : 'Cortesía rechazada', data });
    }
    catch (e) {
        next(e);
    }
});
export default router;
