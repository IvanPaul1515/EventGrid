import { z } from 'zod';
import { InvitationsService } from './invitations.service.js';
import { prisma } from '../../config/db.js';
import { Router } from 'express';
import { UsersController } from './users.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();

// Todas las rutas de administración de usuarios requieren autenticación y rol ADMIN
router.use(authenticateToken, requireAdmin);

router.post('/invitations/preview', async (req, res, next) => {
  try {
    const rows = z.array(z.object({ fullName: z.string().trim().min(2), email: z.string().email().toLowerCase(), role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']), assignedEventId: z.string().uuid(), userId: z.string().uuid().optional() })).min(1).max(100).parse(req.body.rows);
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

router.post('/invitations/send', async (req, res, next) => {
  try {
    const data = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100), requestKey: z.string().uuid(), confirmed: z.literal(true) }).parse(req.body);
    res.json({ data: await InvitationsService.send(data.userIds, data.requestKey, req.user!.id) });
  } catch (error) { next(error); }
});

router.get('/', UsersController.listUsers);
router.post('/', UsersController.createUser);
router.get('/:id', UsersController.getUserById);
router.put('/:id', UsersController.updateUser);
router.patch('/:id/toggle-status', UsersController.toggleStatus);
router.post('/:id/reset-password', UsersController.resetPassword);
router.delete('/:id', UsersController.deleteUser);

export default router;
