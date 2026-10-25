import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';

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
    if (data.userId) {
      const account = await prisma.user.findUnique({ where: { id: data.userId }, select: { assignedEventId: true } });
      if (!account || (account.assignedEventId && account.assignedEventId !== req.eventId)) throw new BadRequestError('Cuenta asociada no encontrada en esta edición.');
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
