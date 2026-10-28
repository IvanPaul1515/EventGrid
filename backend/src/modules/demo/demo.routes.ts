import { Router } from 'express';
import { DemoController } from './demo.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole, requirePermission } from '../../middleware/rbac.js';

const router = Router();

// Todas las rutas de administración demo requieren autenticación
router.use(authenticateToken,requirePermission('DEMO_MANAGE'));

// Consultar estado demo (ADMIN y OPERATOR)
router.get('/status', requireRole(['ADMIN']), DemoController.getStatus);

// Modificar modo demo, generar datos o restablecer (Solo ADMIN)
router.post('/toggle', requireRole(['ADMIN']), DemoController.toggle);
router.post('/generate', requireRole(['ADMIN']), DemoController.generate);
router.post('/reset', requireRole(['ADMIN']), DemoController.reset);

export default router;
