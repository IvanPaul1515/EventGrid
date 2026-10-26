import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { BadRequestError, ForbiddenError } from '../../utils/errors.js';

export function officialTicket<T extends { id: string; name: string; price: unknown; isActive: boolean; createdAt: Date }>(tickets: T[]) {
  const paid = tickets.filter(t => t.isActive && Number(t.price) > 0 && !t.name.toLowerCase().includes('cortes'))
    .sort((a, b) => a.id.localeCompare(b.id));
  return paid.find(t => /general|principal|oficial/i.test(t.name)) || paid.find(t => !/preventa/i.test(t.name)) || paid[0];
}

export type CourtesyApproval = { email: string; password: string };

export async function authorizeCourtesy(tx: Prisma.TransactionClient, eventId: string, actorId: string | undefined, reason: string | null | undefined, approval?: CourtesyApproval) {
  const actor = actorId ? await tx.user.findUnique({ where: { id: actorId } }) : null;
  if (!actor?.isActive || actor.accountStatus === 'PENDING' || actor.role === 'VIEWER') throw new ForbiddenError('La cortesía requiere autorización administrativa.');
  let admin: typeof actor | null = actor;
  if (actor.role !== 'ADMIN') {
    admin = approval ? await tx.user.findUnique({ where: { email: approval.email.trim().toLowerCase() } }) : null;
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive || admin.accountStatus === 'PENDING' ||
      (admin.assignedEventId && admin.assignedEventId !== eventId) || !approval || !await bcrypt.compare(approval.password, admin.passwordHash)) {
      throw new ForbiddenError('La cortesía requiere credenciales administrativas válidas para esta edición.');
    }
  }
  if (admin.assignedEventId && admin.assignedEventId !== eventId) throw new ForbiddenError('Administrador fuera de esta edición.');
  if (!reason?.trim() || reason.trim().length < 3) throw new BadRequestError('Indique el motivo de la cortesía (mínimo 3 caracteres).');
  return { id: admin.id, name: admin.fullName, reason: reason.trim(), date: new Date() };
}

export async function auditCourtesy(tx: Prisma.TransactionClient, eventId: string, registrationId: string, creatorId: string | undefined, approval: { id: string; name: string; reason: string; date: Date }, created = false) {
  const original = created ? null : await tx.auditLog.findFirst({ where: { entity: 'REGISTRATION', entityId: registrationId, action: 'CREATE' }, orderBy: { createdAt: 'asc' }, select: { userId: true } });
  const changes = { action: 'AUTHORIZE_COURTESY', eventId, createdByUserId: created ? creatorId : original?.userId || null, performedByUserId: creatorId, authorizedByUserId: approval.id, authorizedBy: approval.name, authorizedAt: approval.date.toISOString(), reason: approval.reason };
  await tx.auditLog.create({ data: { userId: creatorId, action: 'UPDATE', entity: 'REGISTRATION', entityId: registrationId,
    changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
}
