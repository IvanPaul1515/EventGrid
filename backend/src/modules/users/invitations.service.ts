import { uncertainMailFailure } from '../../utils/mailFailure.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.js';
import { z } from 'zod';
import { BadRequestError } from '../../utils/errors.js';
import { CommunicationsService } from '../communications/communications.service.js';
import { ENV } from '../../config/env.js';

export class InvitationsService {
  static async prepare(userId: string) {
    const existing = await prisma.userInvitation.findFirst({ where: { userId, usedAt: null, revokedAt: null, OR: [{ status: 'PENDING' }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' } });
    return existing || prisma.userInvitation.create({ data: { userId } });
  }

  static async withStatus<T extends { id: string; accountStatus: string }>(users: T[]) {
    const history = await prisma.userInvitation.findMany({ where: { userId: { in: users.map(user => user.id) } }, orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true, status: true, createdAt: true, sentAt: true, expiresAt: true, usedAt: true, revokedAt: true, errorMessage: true } });
    return users.map(user => {
      const invitation = history.find(item => item.userId === user.id);
      const invitationState = user.accountStatus === 'ACTIVE' ? 'ACTIVATED' : !invitation ? 'PENDING'
        : invitation.expiresAt && invitation.expiresAt <= new Date() && !invitation.usedAt ? 'EXPIRED' : invitation.status;
      return { ...user, invitationState, invitation: invitation || null };
    });
  }

  static async send(userIds: string[], requestKey: string, actorUserId: string, reinvite = false) {
    const ids = [...new Set(userIds)].sort();
    const previous = await prisma.invitationDispatch.findUnique({ where: { requestKey } });
    if (previous) {
      const results = JSON.parse(previous.results || '[]');
      if (previous.actorUserId !== actorUserId || JSON.stringify(results.map((item: any) => item.userId).sort()) !== JSON.stringify(ids)) throw new BadRequestError('Este identificador corresponde a otro lote. Prepare una nueva confirmación.');
      return { status: previous.status, results };
    }
    let dispatch;
    try { dispatch = await prisma.invitationDispatch.create({ data: { requestKey, actorUserId, results: JSON.stringify(ids.map(userId => ({ userId, status: 'PROCESSING' }))) } }); }
    catch (error: any) { if (error.code === 'P2002') return { status: 'PROCESSING', results: [] }; throw error; }
    const results: any[] = [];
    const editions = new Set<string>();
    for (const userId of ids) {
      let invitationId: string | undefined;
      let transport: any;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.assignedEventId) editions.add(user.assignedEventId);
        if (!user || !z.string().email().safeParse(user.email).success) { results.push({ userId, status: 'INVALID_USER', reason: 'Cuenta o correo no válido.' }); continue; }
        if (user.accountStatus === 'ACTIVE' && !reinvite) { results.push({ userId, status: 'ACTIVATED', reason: 'Cuenta activada; no se envió. Una reinvitación requiere autorización explícita.' }); continue; }
        const config = await CommunicationsService.getRawConfig(user.assignedEventId);
        if (!config?.isEnabled) {
          await this.prepare(userId);
          results.push({ userId, status: 'PENDING', reason: 'Proveedor desactivado; no se intentó enviar.' }); continue;
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const now = new Date();
        const claim = await prisma.$transaction(async tx => {
          const prior = await tx.userInvitation.findMany({ where: { userId, usedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' } });
          if (prior.some(item => item.status === 'PROCESSING' && now.getTime() - item.createdAt.getTime() < 60000)) return { skip: 'PROCESSING' };
          const live = prior.find(item => item.tokenHash && item.expiresAt && item.expiresAt > now);
          if (live && !reinvite) return { skip: live.status };
          await tx.userInvitation.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
          const invitation = await tx.userInvitation.create({ data: { userId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now.getTime() + 86400000), status: 'PROCESSING' } });
          return { invitation };
        }, { isolationLevel: 'Serializable' });
        if (!claim.invitation) { results.push({ userId, status: claim.skip, reason: 'Ya existe una invitación en curso o un enlace vigente. No se duplicó el envío.' }); continue; }
        invitationId = claim.invitation.id;
        const origin = process.env.FRONTEND_URL || ENV.CORS_ORIGIN.find(url => url.startsWith('https://') || (ENV.NODE_ENV !== 'production' && url.startsWith('http://localhost:')));
        if (!origin) throw new Error('Falta el origen público de activación.');
        const url = new URL('/activate', origin); url.searchParams.set('token', token);
        transport = CommunicationsService.createTransporter(config);
        const sent = await transport.sendMail({ from: `"${config.fromName}" <${config.fromEmail}>`, to: user.email,
          subject: 'Invitación a EventGrid', text: `Establezca su contraseña en ${url.toString()}\nEl enlace vence en 24 horas y es de un solo uso.`,
          html: `<p>Ha recibido una invitación a EventGrid.</p><p><a href="${url.toString().replace(/&/g, '&amp;')}">Establecer contraseña</a></p><p>Enlace individual de un solo uso; vence en 24 horas.</p>` });
        const rejected = Array.isArray(sent.rejected) && sent.rejected.length > 0;
        const accepted = !rejected && Array.isArray(sent.accepted) && sent.accepted.some((email: any) => String(email).toLowerCase() === user.email.toLowerCase());
        const status = accepted ? 'ACCEPTED_BY_PROVIDER' : rejected ? 'REJECTED' : 'UNKNOWN_DELIVERY_STATUS';
        await prisma.userInvitation.update({ where: { id: invitationId }, data: { status, messageId: sent.messageId || null, sentAt: now } });
        results.push({ userId, status });
      } catch (error: any) {
        const status = error.code === 'P2034' ? 'PROCESSING' : uncertainMailFailure(error) ? 'UNKNOWN_DELIVERY_STATUS' : 'FAILED';
        const reason = status === 'PROCESSING' ? 'Otra operación está preparando esta cuenta. Consulte su estado.' : 'No se confirmó el envío. Revise el proveedor antes de autorizar otro intento.';
        if (invitationId) await prisma.userInvitation.update({ where: { id: invitationId }, data: { status, errorMessage: reason } });
        results.push({ userId, status, reason });
      } finally { transport?.close?.(); }
    }
    await prisma.invitationDispatch.update({ where: { id: dispatch.id }, data: { status: 'COMPLETED', results: JSON.stringify(results) } });
    await prisma.auditLog.create({ data: { userId: actorUserId, action: 'USER_UPDATE', entity: 'USER', entityId: actorUserId, changes: JSON.stringify({ operation: 'INVITATIONS_DISPATCH', dispatchId: dispatch.id, userIds: ids, reinvite, results }) } });
    for (const id of editions) RealtimeService.changed(id, ['users']);
    return { status: 'COMPLETED', results };
  }

  static async accept(token: string, password: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    const activated = await prisma.$transaction(async tx => {
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash: hash } });
      if (!invitation) throw new BadRequestError('Enlace inválido o vencido.');
      const claimed = await tx.userInvitation.updateMany({ where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), status: 'ACCEPTED' } });
      if (claimed.count !== 1) throw new BadRequestError('Enlace inválido, vencido o ya utilizado.');
      return tx.user.update({ where: { id: invitation.userId }, data: { passwordHash, accountStatus: 'ACTIVE', isActive: true }, select: { id: true, assignedEventId: true } });
    });
    if (activated.assignedEventId) RealtimeService.changed(activated.assignedEventId, ['users']);
    RealtimeService.notifyAccess(activated.id);
    return { message: 'Contraseña establecida. Puede iniciar sesión.' };
  }
}
