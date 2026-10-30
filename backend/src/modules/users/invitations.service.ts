import {PublicOriginService} from '../public-origin/public-origin.service.js';
import {usernameSchema} from './username.js';
import {smtpPolicy} from '../communications/smtp-state.js';
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
        if(smtpPolicy().realEmailBlocked){await this.prepare(userId);results.push({userId,status:'PENDING',reason:'Los envíos reales están bloqueados por la configuración del entorno.'});continue;}
        const publicSettings=await PublicOriginService.settings();
        if(!publicSettings.publicOrigin||publicSettings.originStatus!=='VERIFIED'){await this.prepare(userId);results.push({userId,status:'PENDING',reason:'Configura y verifica el dominio público de activación antes de enviar.'});continue;}
        const token = crypto.randomBytes(32).toString('base64url');
        const now = new Date();
        const claim = await prisma.$transaction(async tx => {
          const prior = await tx.userInvitation.findMany({ where: { userId, usedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' } });
          if (prior.some(item => item.status === 'PROCESSING' && now.getTime() - item.createdAt.getTime() < 60000)) return { skip: 'PROCESSING' };
          const live = prior.find(item => item.tokenHash && item.expiresAt && item.expiresAt > now);
          if (live && !reinvite&&!['FAILED','REJECTED'].includes(live.status)) return { skip: live.status };
          await tx.userInvitation.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
          const invitation = await tx.userInvitation.create({ data: { userId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now.getTime() + 86400000), status: 'PROCESSING' } });
          return { invitation };
        }, { isolationLevel: 'Serializable' });
        if (!claim.invitation) { results.push({ userId, status: claim.skip, reason: 'Ya existe una invitación en curso o un enlace vigente. No se duplicó el envío.' }); continue; }
        invitationId = claim.invitation.id;
        const activationUrl=await PublicOriginService.link('activation',token);if(!activationUrl)throw new Error('Public origin unavailable');
        const url=new URL(activationUrl);
        const event=user.assignedEventId?await prisma.event.findUnique({where:{id:user.assignedEventId},select:{name:true}}):null;
        const eventName=event?.name||'EventGrid';
        const safeEventName=eventName.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
        transport = CommunicationsService.createTransporter(config);
        const sent = await transport.sendMail({ from: `"${config.fromName}" <${config.fromEmail}>`, to: user.email,
          subject: 'Invitación a EventGrid', text: `Has sido invitado a formar parte del equipo de ${eventName}.\nEstablezca su contraseña en ${url.toString()}\nEl enlace vence en 24 horas y es de un solo uso.`,
          html: `<p>Has sido invitado a formar parte del equipo de ${safeEventName}.</p><p><a href="${url.toString().replace(/&/g, '&amp;')}">Activar mi cuenta</a></p><p>Enlace individual de un solo uso; vence en 24 horas.</p>` });
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

  static async describe(token:string){const hash=crypto.createHash('sha256').update(token).digest('hex');const i=await prisma.userInvitation.findUnique({where:{tokenHash:hash}});if(!i||i.usedAt||i.revokedAt||!i.expiresAt||i.expiresAt<=new Date())throw new BadRequestError('Enlace inválido o vencido.');const user=await prisma.user.findUnique({where:{id:i.userId},select:{username:true,fullName:true}});if(!user)throw new BadRequestError('Enlace inválido o vencido.');return user;}


  static async accept(token: string, password: string, username?:string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    const activated = await prisma.$transaction(async tx => {
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash: hash } });
      if (!invitation) throw new BadRequestError('Enlace inválido o vencido.');
      const claimed = await tx.userInvitation.updateMany({ where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), status: 'ACCEPTED' } });
      if (claimed.count !== 1) throw new BadRequestError('Enlace inválido, vencido o ya utilizado.');
      const proposed=username?usernameSchema.parse(username):undefined;
      if(proposed){const duplicate=await tx.user.findUnique({where:{username:proposed}});if(duplicate&&duplicate.id!==invitation.userId)throw new BadRequestError('Nombre de usuario no disponible.');}
      const user=await tx.user.update({ where: { id: invitation.userId }, data: {username:proposed,sessionVersion:{increment:1}, passwordHash, accountStatus: 'ACTIVE', isActive: true }, select: { id: true, assignedEventId: true } });
      await tx.auditLog.create({data:{userId:user.id,entity:'USER',entityId:user.id,action:'USER_UPDATE',changes:JSON.stringify({operation:'INVITATION_ACTIVATED',username:proposed})}});return user;
    });
    if (activated.assignedEventId) RealtimeService.changed(activated.assignedEventId, ['users']);
    RealtimeService.notifyAccess(activated.id);
    return { message: 'Contraseña establecida. Puede iniciar sesión.' };
  }
}
