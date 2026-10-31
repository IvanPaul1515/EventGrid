import {invitationBlocks,invitationDiagnostic,providerAddress,safeProviderDiagnostic} from './invitation-state.js';
import {PublicOriginService} from '../public-origin/public-origin.service.js';
import {chosenUsernameSchema} from './username.js';
import {smtpPolicy,smtpConfigured} from '../communications/smtp-state.js';
import { uncertainMailFailure,mailFailureMessage } from '../../utils/mailFailure.js';
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

  static async readiness(eventId?:string|null) {
    const [origin,config]=await Promise.all([PublicOriginService.settings(),CommunicationsService.getRawConfig(eventId)]);
    return invitationBlocks({domainConfigured:Boolean(origin.publicOrigin),domainVerified:origin.originStatus==='VERIFIED',smtpEnabled:Boolean(config?.isEnabled),smtpConfigured:smtpConfigured(config),mailBlocked:smtpPolicy().realEmailBlocked});
  }

  static async withStatus<T extends { id: string; accountStatus: string;assignedEventId?:string|null }>(users: T[]) {
    if(!users.length)return [];
    const [history,dispatches]=await Promise.all([
      prisma.userInvitation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{createdAt:'desc'},select:{id:true,userId:true,status:true,createdAt:true,sentAt:true,expiresAt:true,usedAt:true,revokedAt:true,errorMessage:true,messageId:true}}),
      prisma.invitationDispatch.findMany({where:{OR:users.map(u=>({results:{contains:u.id}}))},orderBy:{createdAt:'desc'},take:200,select:{createdAt:true,results:true}})
    ]);
    const recent=new Map<string,any>();
    for(const dispatch of dispatches){let entries:any[]=[];try{const parsed=JSON.parse(dispatch.results||'[]');if(Array.isArray(parsed))entries=parsed;}catch{}
      for(const entry of entries)if(!recent.has(entry.userId))recent.set(entry.userId,{...entry,at:dispatch.createdAt});
    }
    const scopes=[...new Set(users.filter(u=>u.accountStatus!=='ACTIVE').map(u=>u.assignedEventId||null))];
    const readiness=new Map(await Promise.all(scopes.map(async id=>[id,await this.readiness(id)] as const)));
    return users.map(user=>{
      const invitation=history.find(i=>i.userId===user.id);
      const diagnostic=invitationDiagnostic(user.accountStatus,invitation,readiness.get(user.assignedEventId||null)||[],recent.get(user.id));
      const {messageId,...publicInvitation}=invitation||{};
      return {...user,invitationState:diagnostic.state,invitation:invitation?publicInvitation:null,invitationDiagnostic:diagnostic};
    });
  }

  static async defer(userId:string,reason:string){const invitation=await this.prepare(userId);if(invitation.status==='PENDING'&&!invitation.tokenHash)await prisma.userInvitation.update({where:{id:invitation.id},data:{errorMessage:reason}});}

  static async send(userIds: string[], requestKey: string, actorUserId: string, reinvite = false,confirmedDuplicateRisk=false) {
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
      let attempted=false;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.assignedEventId) editions.add(user.assignedEventId);
        if (!user || !z.string().email().safeParse(user.email).success) { results.push({ userId, status: 'INVALID_USER', reason: 'Cuenta o correo no válido.' }); continue; }
        if (user.accountStatus === 'ACTIVE' && !reinvite) { results.push({ userId, status: 'ACTIVATED', reason: 'Cuenta activada; no se envió. Una reinvitación requiere autorización explícita.' }); continue; }
        const blocks=await this.readiness(user.assignedEventId);
        if(blocks.length){await this.defer(userId,blocks[0].reason);results.push({userId,status:'PENDING',...blocks[0],attempted:false});continue;}
        const config = await CommunicationsService.getRawConfig(user.assignedEventId);
        const token = crypto.randomBytes(32).toString('base64url');
        const now = new Date();
        const claim = await prisma.$transaction(async tx => {
          const prior = await tx.userInvitation.findMany({ where: { userId, usedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' } });
          if (prior.some(item => item.status === 'PROCESSING' && now.getTime() - item.createdAt.getTime() < 120000)) return { skip: 'PROCESSING' };
          if(prior.some(item=>item.status==='UNKNOWN_DELIVERY_STATUS'||item.status==='PROCESSING'&&now.getTime()-item.createdAt.getTime()>=120000)&&(!reinvite||!confirmedDuplicateRisk))return {skip:'UNKNOWN_DELIVERY_STATUS'};
          const live = prior.find(item => item.tokenHash && item.expiresAt && item.expiresAt > now);
          if (live && !reinvite&&!['FAILED','REJECTED'].includes(live.status)) return { skip: live.status };
          await tx.userInvitation.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
          const invitation = await tx.userInvitation.create({ data: { userId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now.getTime() + 86400000), status: 'PROCESSING' } });
          return { invitation };
        }, { isolationLevel: 'Serializable' });
        if (!claim.invitation) { results.push({ userId, status: claim.skip,attempted:false, reason:claim.skip==='UNKNOWN_DELIVERY_STATUS'?'El resultado anterior es desconocido. Investiga el historial o confirma expresamente el riesgo de duplicado antes de reenviar.':'Ya existe una invitación en curso o un enlace vigente. No se duplicó el envío.' }); continue; }
        invitationId = claim.invitation.id;
        const activationUrl=await PublicOriginService.link('activation',token);if(!activationUrl)throw new Error('Public origin unavailable');
        const url=new URL(activationUrl);
        const event=user.assignedEventId?await prisma.event.findUnique({where:{id:user.assignedEventId},select:{name:true}}):null;
        const eventName=event?.name||'EventGrid';
        const safeEventName=eventName.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
        transport = CommunicationsService.createTransporter(config);
        attempted=true;
        await prisma.userInvitation.update({where:{id:invitationId},data:{sentAt:new Date()}});
        const sent = await transport.sendMail({ from: `"${config.fromName}" <${config.fromEmail}>`, to: user.email,
          subject: 'Invitación a EventGrid', text: `Has sido invitado a formar parte del equipo de ${eventName}.\nElige tu nombre de usuario y contraseña en ${url.toString()}\nEl enlace vence en 24 horas y es de un solo uso.`,
          html: `<p>Has sido invitado a formar parte del equipo de ${safeEventName}.</p><p>Tu acceso fue autorizado para tu función. Elige tu nombre de usuario y contraseña para completar el registro.</p><p><a href="${url.toString().replace(/&/g, '&amp;')}">Activar mi cuenta</a></p><p>Enlace individual de un solo uso; vence en 24 horas.</p>` });
        const rejected = Array.isArray(sent.rejected) && sent.rejected.some((email:any)=>providerAddress(email)===providerAddress(user.email));
        const accepted = !rejected && Array.isArray(sent.accepted) && sent.accepted.some((email: any) => providerAddress(email) === providerAddress(user.email));
        const status = accepted ? 'ACCEPTED_BY_PROVIDER' : rejected ? 'REJECTED' : 'UNKNOWN_DELIVERY_STATUS';
        await prisma.userInvitation.update({ where: { id: invitationId }, data: { status, messageId: sent.messageId || null, sentAt: now } });
        results.push({ userId, status,invitationId,attempted:true,hasProviderReference:Boolean(sent.messageId) });
      } catch (error: any) {
        const status = error.code === 'P2034' ? 'PROCESSING' : attempted&&uncertainMailFailure(error) ? 'UNKNOWN_DELIVERY_STATUS' : 'FAILED';
        const reason = status === 'PROCESSING' ? 'Otra operación está preparando esta cuenta. Consulte su estado.' :attempted?mailFailureMessage(error):'No se pudo preparar la invitación. No se contactó al proveedor de correo.';
        if (invitationId) await prisma.userInvitation.update({ where: { id: invitationId }, data: { status, errorMessage: reason } });
        results.push({ userId, status, reason,invitationId,attempted,...safeProviderDiagnostic(error) });
      } finally { transport?.close?.();await prisma.invitationDispatch.update({where:{id:dispatch.id},data:{results:JSON.stringify(ids.map(id=>results.find(item=>item.userId===id)||{userId:id,status:'PROCESSING',attempted:false}))}}).catch(()=>{console.error('No se pudo guardar el progreso del lote de invitaciones. Consulte el historial antes de reintentar.');}); }
    }
    await prisma.invitationDispatch.update({ where: { id: dispatch.id }, data: { status: 'COMPLETED', results: JSON.stringify(results) } });
    await prisma.auditLog.create({ data: { userId: actorUserId, action: 'USER_UPDATE', entity: 'USER', entityId: actorUserId, changes: JSON.stringify({ operation: 'INVITATIONS_DISPATCH', dispatchId: dispatch.id, userIds: ids, reinvite,confirmedDuplicateRisk, results }) } });
    for (const id of editions) RealtimeService.changed(id, ['users']);
    return { status: 'COMPLETED', results };
  }

  static async describe(token:string){const hash=crypto.createHash('sha256').update(token).digest('hex');const i=await prisma.userInvitation.findUnique({where:{tokenHash:hash}});if(!i||i.usedAt||i.revokedAt||!i.expiresAt||i.expiresAt<=new Date())throw new BadRequestError('Enlace inválido o vencido.');const user=await prisma.user.findUnique({where:{id:i.userId},select:{username:true,fullName:true,email:true,role:true,assignedEventId:true}});if(!user)throw new BadRequestError('Enlace inválido o vencido.');const event=user.assignedEventId?await prisma.event.findUnique({where:{id:user.assignedEventId},select:{name:true}}):null;return {username:user.username,fullName:user.fullName,email:user.email,role:user.role,eventName:event?.name||'EventGrid'};}


  static async accept(token: string, password: string, username?:string,welcomeConfirmed=false) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    const activated = await prisma.$transaction(async tx => {
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash: hash } });
      if (!invitation) throw new BadRequestError('Enlace inválido o vencido.');
      const claimed = await tx.userInvitation.updateMany({ where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), status: 'ACCEPTED' } });
      if (claimed.count !== 1) throw new BadRequestError('Enlace inválido, vencido o ya utilizado.');
      const proposed=username?chosenUsernameSchema.parse(username):undefined;
      if(proposed){const duplicate=await tx.user.findUnique({where:{username:proposed}});if(duplicate&&duplicate.id!==invitation.userId)throw new BadRequestError('Nombre de usuario no disponible.');}
      const user=await tx.user.update({ where: { id: invitation.userId }, data: {username:proposed,sessionVersion:{increment:1}, passwordHash, accountStatus: 'ACTIVE', isActive: true }, select: { id: true, assignedEventId: true,email:true,fullName:true } });
      await tx.auditLog.create({data:{userId:user.id,entity:'USER',entityId:user.id,action:'USER_UPDATE',changes:JSON.stringify({operation:'INVITATION_ACTIVATED',username:proposed})}});return user;
    });
    if (activated.assignedEventId) RealtimeService.changed(activated.assignedEventId, ['users']);
    RealtimeService.notifyAccess(activated.id);
    let welcomeStatus='NOT_REQUESTED';
    if(welcomeConfirmed&&!smtpPolicy().realEmailBlocked){let transport:any;try{const config=await CommunicationsService.getRawConfig(activated.assignedEventId);if(config?.isEnabled){transport=CommunicationsService.createTransporter(config);const result=await transport.sendMail({from:`"${config.fromName}" <${config.fromEmail}>`,to:activated.email,subject:'Cuenta activada en EventGrid',text:'Tu cuenta de EventGrid está activada. Ya puedes iniciar sesión con tu nombre de usuario o correo. Si no realizaste esta operación, contacta a la administración.'});welcomeStatus=result.accepted?.includes(activated.email)?'ACCEPTED_BY_PROVIDER':'UNCONFIRMED';}else welcomeStatus='DISABLED';}catch{welcomeStatus='UNCONFIRMED';}finally{transport?.close?.();}
     await prisma.auditLog.create({data:{userId:activated.id,action:'USER_UPDATE',entity:'USER',entityId:activated.id,changes:JSON.stringify({operation:'ACTIVATION_WELCOME',status:welcomeStatus,manuallyConfirmed:true})}});
    }
    return { message: 'Cuenta activada. Puede iniciar sesión.',welcomeStatus };
  }
}
