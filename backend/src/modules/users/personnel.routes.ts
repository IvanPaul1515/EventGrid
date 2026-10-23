import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';

const input = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1),
  email: z.string().email().toLowerCase(), phone: z.string().optional().nullable(), function: z.string().optional().nullable(),
  area: z.string().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
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
    if (data.userId && !await prisma.user.findUnique({ where: { id: data.userId } })) throw new BadRequestError('Cuenta asociada no encontrada.');
    if (req.params.id && !await prisma.staffMember.findFirst({ where: { id: req.params.id, eventId: req.eventId } })) throw new NotFoundError('Miembro de staff no encontrado.');
    const record = req.params.id ? await prisma.staffMember.update({ where: { id: req.params.id }, data }) : await prisma.staffMember.create({ data: { ...data, eventId: req.eventId! } });
    res.json({ data: record });
  } catch (error) { next(error); }
}
personnelRoutes.post('/', requireAdmin, save);
personnelRoutes.put('/:id', requireAdmin, save);
