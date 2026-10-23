import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.js';
import { BadRequestError } from '../../utils/errors.js';
import { CommunicationsService } from '../communications/communications.service.js';
import { ENV } from '../../config/env.js';

export class InvitationsService {
  static async prepare(userId: string) {
    return prisma.userInvitation.create({ data: { userId } });
  }

  static async send(userIds: string[], requestKey: string, actorUserId: string) {
    // Unique request key claims the whole operation before any external call.
    const previous = await prisma.invitationDispatch.findUnique({ where: { requestKey } });
    if (previous) return { status: previous.status, results: JSON.parse(previous.results || '[]') };
    let dispatch;
    try { dispatch = await prisma.invitationDispatch.create({ data: { requestKey, actorUserId } }); }
    catch (error: any) {
      if (error.code === 'P2002') return { status: 'PROCESSING', results: [] };
      throw error;
    }
    const results: any[] = [];
    for (const userId of [...new Set(userIds)]) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) { results.push({ userId, status: 'INVALID_USER' }); continue; }
      const config = await CommunicationsService.getRawConfig(user.assignedEventId);
      if (!config?.isEnabled) {
        if (!await prisma.userInvitation.findFirst({ where: { userId, status: 'PENDING', usedAt: null, revokedAt: null } })) await this.prepare(userId);
        results.push({ userId, status: 'PENDING', reason: 'Proveedor desactivado; no se intentó enviar.' }); continue;
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const now = new Date();
      const invitation = await prisma.$transaction(async tx => {
        await tx.userInvitation.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
        return tx.userInvitation.create({ data: { userId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now.getTime() + 86400000), status: 'PROCESSING' } });
      });
      try {
        const origin = process.env.FRONTEND_URL || ENV.CORS_ORIGIN.find(url => url.startsWith('https://') || (ENV.NODE_ENV !== 'production' && url.startsWith('http://localhost:')));
        if (!origin) throw new Error('Falta FRONTEND_URL en el servidor para preparar el enlace de activación.');
        const url = new URL('/activate', origin); url.searchParams.set('token', token);
        const transport = CommunicationsService.createTransporter(config);
        const sent = await transport.sendMail({ from: `"${config.fromName}" <${config.fromEmail}>`, to: user.email,
          subject: 'Invitación a EventGrid', text: `Establezca su contraseña en ${url.toString()}\nEl enlace vence en 24 horas y es de un solo uso.`,
          html: `<p>Ha recibido una invitación a EventGrid.</p><p><a href="${url.toString().replace(/&/g, '&amp;')}">Establecer contraseña</a></p><p>Enlace individual de un solo uso; vence en 24 horas.</p>` });
        const accepted = Array.isArray(sent.accepted) && sent.accepted.some((email: any) => String(email).toLowerCase() === user.email.toLowerCase());
        const status = accepted ? 'ACCEPTED_BY_PROVIDER' : 'REJECTED';
        await prisma.userInvitation.update({ where: { id: invitation.id }, data: { status, messageId: sent.messageId || null, sentAt: now } });
        results.push({ userId, status });
      } catch (error: any) {
        await prisma.userInvitation.update({ where: { id: invitation.id }, data: { status: 'UNKNOWN_DELIVERY_STATUS', errorMessage: 'No se confirmó el envío. Se requiere una nueva autorización para reintentar.' } });
        results.push({ userId, status: 'UNKNOWN_DELIVERY_STATUS', reason: 'No se confirmó el envío. Revise la configuración antes de autorizar otro intento.' });
      }
    }
    await prisma.invitationDispatch.update({ where: { id: dispatch.id }, data: { status: 'COMPLETED', results: JSON.stringify(results) } });
    return { status: 'COMPLETED', results };
  }

  static async accept(token: string, password: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async tx => {
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash: hash } });
      if (!invitation) throw new BadRequestError('Enlace inválido o vencido.');
      const claimed = await tx.userInvitation.updateMany({ where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), status: 'ACCEPTED' } });
      if (claimed.count !== 1) throw new BadRequestError('Enlace inválido, vencido o ya utilizado.');
      await tx.user.update({ where: { id: invitation.userId }, data: { passwordHash, accountStatus: 'ACTIVE', isActive: true } });
    });
    return { message: 'Contraseña establecida. Puede iniciar sesión.' };
  }
}
