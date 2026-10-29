import { actionRateLimiter } from '../../middleware/rateLimiter.js';
import {OPERATOR_CAPABILITIES,OPERATOR_PROFILES} from './operator-policy.js';
import { editionContext } from '../../middleware/editionContext.js';
import { ForbiddenError } from '../../utils/errors.js';
import { z } from 'zod';
import { InvitationsService } from './invitations.service.js';
import { prisma } from '../../config/db.js';
import { Router } from 'express';
import { UsersController } from './users.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();
const explicitActionLimit = actionRateLimiter();

// Todas las rutas de administración de usuarios requieren autenticación y rol ADMIN
router.use(authenticateToken, requireAdmin);
router.get('/capability-profiles',(_req,res)=>res.json({data:{capabilities:OPERATOR_CAPABILITIES,profiles:OPERATOR_PROFILES}}));

async function ensureScope(ids: string[], scope?: string | null) {
  if (!scope) return;
  const count = await prisma.user.count({ where: { id: { in: [...new Set(ids)] }, assignedEventId: scope } });
  if (count !== new Set(ids).size) throw new ForbiddenError('Cuenta fuera de su edición autorizada.');
}
router.post('/invitations/selection', async (req, res, next) => {
  try {
    const ids = z.array(z.string().uuid()).min(1).max(100).parse(req.body.userIds);
    await ensureScope(ids, req.user!.assignedEventId);
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true, role: true, accountStatus: true, isActive: true, assignedEventId: true } });
    res.json({ data: await InvitationsService.withStatus(users) });
  } catch (error) { next(error); }
});
router.get('/:id/invitations', async (req, res, next) => {
  try {
    await ensureScope([req.params.id], req.user!.assignedEventId);
    const items = await prisma.userInvitation.findMany({ where: { userId: req.params.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, expiresAt: true, sentAt: true, usedAt: true, revokedAt: true, errorMessage: true } });
    res.json({ data: items });
  } catch (error) { next(error); }
});

router.post('/invitations/preview', async (req, res, next) => {
  try {
    const rows = z.array(z.object({ fullName: z.string().trim().min(2), email: z.string().email().toLowerCase(), role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']), assignedEventId: z.string().uuid(), userId: z.string().uuid().optional() })).min(1).max(100).parse(req.body.rows);
    if (req.user!.assignedEventId && rows.some(row => row.assignedEventId !== req.user!.assignedEventId)) throw new ForbiddenError('Edición fuera de su alcance.');
    const accounts = await prisma.user.findMany({ where: { email: { in: rows.map(row => row.email) } }, select: { id: true, email: true } });
    const editions = await prisma.event.findMany({ where: { id: { in: rows.map(row => row.assignedEventId) } }, select: { id: true } });
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.email)) issues.push(`Correo duplicado: ${row.email}`); seen.add(row.email);
      const account = accounts.find(user => user.email === row.email);
      if (account && account.id !== row.userId) issues.push(`Usuario existente: ${row.email}. Seleccione su cuenta.`);
      if (!editions.some(event => event.id === row.assignedEventId)) issues.push(`Edición no encontrada para ${row.email}`);
    }
    res.json({ data: { count: rows.length, issues } });
  } catch (error) { next(error); }
});

router.post('/invitations/send', explicitActionLimit, async (req, res, next) => {
  try {
    const data = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100), requestKey: z.string().uuid(), confirmed: z.literal(true), reinvite: z.boolean().default(false) }).parse(req.body);
    await ensureScope(data.userIds, req.user!.assignedEventId);
    res.json({ data: await InvitationsService.send(data.userIds, data.requestKey, req.user!.id, data.reinvite) });
  } catch (error) { next(error); }
});

router.get('/', UsersController.listUsers);
router.post('/', editionContext, UsersController.createUser);
router.use('/:id', async (req, _res, next) => {
  try {
    await ensureScope([req.params.id], req.user!.assignedEventId);
    if (req.user!.assignedEventId && req.body?.assignedEventId !== undefined && req.body.assignedEventId !== req.user!.assignedEventId) throw new ForbiddenError('No puede reasignar usuarios fuera de su edición.');
    next();
  } catch (error) { next(error); }
});
router.get('/:id', UsersController.getUserById);
router.put('/:id', UsersController.updateUser);
router.patch('/:id/toggle-status', UsersController.toggleStatus);
router.post('/:id/reset-password', UsersController.resetPassword);
router.delete('/:id', UsersController.deleteUser);

export default router;
