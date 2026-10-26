import { writeTransaction } from '../../utils/writeTransaction.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
export async function updateUserSafely(id: string, patch: {
    fullName?: string;
    role?: 'ADMIN' | 'OPERATOR' | 'VIEWER';
    assignedEventId?: string | null;
    isActive?: boolean;
    staffArea?: string | null;
}, actorId: string | undefined, action: string) {
    const result = await writeTransaction(async (tx) => {
        const actor = actorId ? await tx.user.findUnique({ where: { id: actorId } }) : null;
        if (!actor?.isActive || actor.accountStatus === 'PENDING' || actor.role !== 'ADMIN')
            throw new ForbiddenError('Se requiere un administrador autorizado.');
        const user = await tx.user.findUnique({ where: { id } });
        if (!user)
            throw new NotFoundError('Usuario no encontrado');
        if (actor.assignedEventId && (user.assignedEventId !== actor.assignedEventId || (patch.assignedEventId !== undefined && patch.assignedEventId !== actor.assignedEventId)))
            throw new ForbiddenError('Cuenta fuera de su edición.');
        if (patch.isActive === true && user.accountStatus === 'PENDING')
            throw new BadRequestError('La cuenta pendiente requiere activación mediante invitación.');
        if (patch.assignedEventId && !await tx.event.findUnique({ where: { id: patch.assignedEventId } }))
            throw new BadRequestError('Edición no encontrada.');
        const after = { ...user, ...patch };
        if (after.role === 'ADMIN' && !after.assignedEventId && !(user.role === 'ADMIN' && !user.assignedEventId))
            throw new BadRequestError('Los nuevos administradores requieren edición asignada.');
        if (user.role === 'ADMIN' && user.isActive && user.accountStatus !== 'PENDING') {
            const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true, accountStatus: { not: 'PENDING' } } });
            const remaining = admins.filter(a => a.id !== id);
            if (after.role === 'ADMIN' && after.isActive)
                remaining.push(after);
            if (admins.some(a => !a.assignedEventId) && !remaining.some(a => !a.assignedEventId))
                throw new BadRequestError('No se puede desactivar, demotar ni reasignar al último administrador global.');
            const editions = await tx.event.findMany({ select: { id: true } });
            for (const event of editions)
                if (admins.some(a => !a.assignedEventId || a.assignedEventId === event.id) && !remaining.some(a => !a.assignedEventId || a.assignedEventId === event.id))
                    throw new BadRequestError('La edición quedaría sin administrador activo.');
        }
        if (patch.isActive === false)
            await tx.passwordReset.updateMany({ where: { userId: id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        const updated = await tx.user.update({ where: { id }, data: { ...patch, ...(user.isActive && patch.isActive === false ? { sessionVersion: { increment: 1 } } : {}) }, select: { id: true, email: true, fullName: true, role: true, assignedEventId: true, accountStatus: true, staffArea: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true } });
        const changes = { before: { role: user.role, isActive: user.isActive, assignedEventId: user.assignedEventId }, after: { role: updated.role, isActive: updated.isActive, assignedEventId: updated.assignedEventId }, operation: action };
        await tx.auditLog.create({ data: { userId: actor.id, entity: 'USER', entityId: id, action: 'USER_UPDATE', changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
        return updated;
    });
    RealtimeService.notifyAccess(id);
    return result;
}
