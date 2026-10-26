import { Prisma } from '@prisma/client';
import { BadRequestError, ForbiddenError, ConflictError } from '../../utils/errors.js';
export async function courtesyAudit(tx: Prisma.TransactionClient, userId: string, registrationId: string, changes: Record<string, unknown>) {
    await tx.auditLog.create({ data: { userId, action: 'UPDATE', entity: 'REGISTRATION', entityId: registrationId, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
}
export async function recordCourtesyRequest(tx: Prisma.TransactionClient, eventId: string, registration: {
    id: string;
    isCourtesy: boolean;
    amountPaid: unknown;
    attended: boolean;
    status: string;
}, userId: string, reason: string, key: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.isActive || user.role !== 'OPERATOR' || user.accountStatus === 'PENDING')
        throw new ForbiddenError('Solo un operador puede solicitar una cortesía.');
    if (registration.isCourtesy || Number(registration.amountPaid) > 0 || registration.attended || registration.status === 'CANCELLED')
        throw new BadRequestError('La inscripción no admite una solicitud de cortesía: revise pagos y asistencia.');
    const pending = await tx.courtesyRequest.findUnique({ where: { pendingRegistrationId: registration.id } });
    if (pending) {
        if (pending.requestedByUserId !== userId)
            throw new ConflictError('Otro operador ya solicitó la cortesía de esta inscripción.');
        return pending;
    }
    const result = await tx.courtesyRequest.create({ data: { eventId, registrationId: registration.id, pendingRegistrationId: registration.id, requestedByUserId: userId, reason: reason.trim(), requestKey: key } });
    await courtesyAudit(tx, userId, registration.id, { action: 'REQUEST_COURTESY', requestId: result.id, requestedByUserId: userId, reason: result.reason, status: result.status });
    return result;
}
