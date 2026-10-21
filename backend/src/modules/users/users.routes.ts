import { Router } from 'express';
import { UsersController } from './users.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();

// Todas las rutas de administración de usuarios requieren autenticación y rol ADMIN
router.use(authenticateToken, requireAdmin);

router.get('/', UsersController.listUsers);
router.post('/', UsersController.createUser);
router.get('/:id', UsersController.getUserById);
router.put('/:id', UsersController.updateUser);
router.patch('/:id/toggle-status', UsersController.toggleStatus);
router.post('/:id/reset-password', UsersController.resetPassword);
router.delete('/:id', UsersController.deleteUser);

export default router;
