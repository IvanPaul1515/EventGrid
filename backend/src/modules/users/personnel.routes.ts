import {usernameSchema} from './username.js';
import {serializeCapabilities,OPERATOR_CAPABILITIES,OperatorCapability} from './operator-policy.js';
import crypto from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { InvitationsService } from './invitations.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors.js';

const input = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1),
  email: z.string().trim().email().toLowerCase(), phone: z.string().optional().nullable(), function: z.string().optional().nullable(),
  area: z.string().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().max(2000).optional().nullable(), userId: z.string().uuid().optional().nullable() });
export const personnelRoutes = Router();
personnelRoutes.use(authenticateToken, editionContext);
personnelRoutes.get('/', async (req, res, next) => {
  try { res.json({ data: await prisma.staffMember.findMany({ where: { eventId: req.eventId! }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }) }); }
  catch (error) { next(error); }
});
async function save(req: any, res: any, next: any) {
  try {
    const data = input.parse(req.body);
    const previous = req.params.id ? await prisma.staffMember.findFirst({ where: { id: req.params.id, eventId: req.eventId } }) : null;
    if (data.phone && data.phone !== previous?.phone) {
      const phone = parsePhoneNumberFromString(data.phone, 'DO');
      if (!phone?.isValid()) throw new BadRequestError('Teléfono inválido. Incluya el prefijo internacional para números de otros países.');
      data.phone = phone.number;
    }
    if (data.userId) {
      const account = await prisma.user.findUnique({ where: { id: data.userId }, select: { assignedEventId: true, email: true, fullName: true } });
      if (!account || account.assignedEventId !== req.eventId || account.email.trim().toLowerCase() !== data.email || identity(account.fullName) !== identity(data.firstName + ' ' + data.lastName)) throw new BadRequestError('Cuenta asociada no encontrada en esta edición.');
    }
    if (req.params.id && !await prisma.staffMember.findFirst({ where: { id: req.params.id, eventId: req.eventId } })) throw new NotFoundError('Miembro de staff no encontrado.');
    const record = await prisma.$transaction(async tx => {
      const existing = await tx.staffMember.findMany({ where: { eventId: req.eventId }, select: { id: true, email: true } });
      if (existing.some(item => item.id !== req.params.id && item.email.trim().toLowerCase() === data.email)) throw new BadRequestError('Ya existe un colaborador con este correo en el evento activo.');
      return req.params.id ? tx.staffMember.update({ where: { id: req.params.id }, data }) : tx.staffMember.create({ data: { ...data, eventId: req.eventId! } });
    }, { isolationLevel: 'Serializable' });
    res.json({ data: record });
  } catch (error: any) { next(error.code === 'P2034' ? new BadRequestError('Otro operador modificó el staff. Revise si el correo ya existe antes de reintentar.') : error); }
}
personnelRoutes.post('/', requireAdmin, save);
personnelRoutes.put('/:id', requireAdmin, save);

// Linking is explicit, edition-scoped and atomic. Creation never sends an invitation.
const identity = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
personnelRoutes.get('/:id/access', requireAdmin, async (req, res, next) => {
  try {
    const staff = await prisma.staffMember.findFirst({ where: { id: req.params.id, eventId: req.eventId! } });
    if (!staff) throw new NotFoundError('Colaborador no encontrado');
    const matches = await prisma.user.findMany({ where: { assignedEventId: req.eventId! }, select: { id: true, email: true, fullName: true, role: true, accountStatus: true } });
    const account = matches.find(u => staff.userId ? u.id === staff.userId : u.email.trim().toLowerCase() === staff.email.trim().toLowerCase() && identity(u.fullName) === identity(staff.firstName + ' ' + staff.lastName));
    res.json({ data: { linked: Boolean(staff.userId), account: account || null } });
  } catch(error) { next(error); }
});
personnelRoutes.post('/:id/access', requireAdmin, async (req, res, next) => {
  try {
    const data = z.object({ username:usernameSchema.optional(),scannerOnly:z.boolean().default(false),operationalPermissions:z.array(z.string().refine(value=>Object.hasOwn(OPERATOR_CAPABILITIES,value))).max(20).optional(),inviteNow:z.boolean().default(false),invitationRequestKey:z.string().uuid().optional(),role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'), linkExisting: z.boolean().default(false) }).parse(req.body);
    if(data.scannerOnly&&data.role!=='OPERATOR')throw new BadRequestError('Escáner QR requiere personal operativo.');
    const account = await prisma.$transaction(async tx => {
      const actor=await tx.user.findUnique({where:{id:req.user!.id}});
      if(!actor?.isActive||actor.scannerOnly||actor.accountStatus==='PENDING'||actor.role!=='ADMIN'||actor.assignedEventId&&actor.assignedEventId!==req.eventId)throw new ForbiddenError('Se requiere un administrador vigente de la edición.');
      const staff = await tx.staffMember.findFirst({ where: { id: req.params.id, eventId: req.eventId! } });
      if (!staff) throw new NotFoundError('Colaborador no encontrado');
      if (staff.userId) throw new BadRequestError('El colaborador ya tiene una cuenta vinculada.');
      const email = staff.email.trim().toLowerCase();
      const matches = (await tx.user.findMany({ select: { id: true, username:true, scannerOnly:true,operationalPermissions:true, assignedEventId: true, email: true, fullName: true, role: true, accountStatus: true } })).filter(u => u.email.trim().toLowerCase() === email);
      if (matches.length > 1) throw new BadRequestError('Existen cuentas ambiguas con este correo. Revise la relación antes de continuar.');
      let user = matches[0];
      if (user) {
        if (user.assignedEventId !== req.eventId || identity(user.fullName) !== identity(staff.firstName + ' ' + staff.lastName)) throw new BadRequestError('No se puede vincular automáticamente este correo. Revise la identidad y la edición de la cuenta.');
        if (!data.linkExisting) throw new BadRequestError('Confirme la vinculación con la cuenta existente.');
        if (await tx.staffMember.findFirst({ where: { userId: user.id, eventId: req.eventId! } })) throw new BadRequestError('La cuenta ya está vinculada a otro colaborador.');
      } else {
        user = await tx.user.create({ data: { fullName: staff.firstName + ' ' + staff.lastName, email,username:data.inviteNow?undefined:data.username,scannerOnly:data.scannerOnly, role: data.role, operationalPermissions:serializeCapabilities(data.role,data.scannerOnly,'RECEPTION',data.operationalPermissions as OperatorCapability[]|undefined), assignedEventId: req.eventId!, isActive: false, accountStatus: 'PENDING', passwordHash: 'pending-activation:' + crypto.randomUUID() } });
      }
      await tx.staffMember.update({ where: { id: staff.id }, data: { userId: user.id } });
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'USER_UPDATE', entity: 'USER', entityId: user.id, changes: JSON.stringify({ operation: 'STAFF_ACCESS_LINK', staffId: staff.id,username:user.username,role:user.role,scannerOnly:user.scannerOnly,operationalPermissions:user.operationalPermissions }) } });
      return { id: user.id, fullName: user.fullName, email: user.email, role: user.role, accountStatus: user.accountStatus };
    }, { isolationLevel: 'Serializable' });
    if (account.accountStatus === 'PENDING') await InvitationsService.prepare(account.id);
    RealtimeService.changed(req.eventId!, ['users', 'staff']);
    const invitation=data.inviteNow?await InvitationsService.send([account.id],data.invitationRequestKey||crypto.randomUUID(),req.user!.id):null;
    res.json({ data: {...account,creationInvitation:invitation}, message: invitation?'Cuenta vinculada; consulte el resultado de la invitación.':'Cuenta vinculada sin envío.' });
  } catch(error: any) { next(['P2034', 'P2002'].includes(error.code) ? new BadRequestError('Otra operación modificó esta relación. Actualice antes de reintentar.') : error); }
});
