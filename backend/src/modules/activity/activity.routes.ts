import { Router } from 'express';
import { ActivityController } from './activity.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticateToken);

// Consulta y exportación del registro histórico de auditoría y actividades
router.get('/export', requireAdmin, ActivityController.export);
router.get('/', requireAdmin, ActivityController.list);

export default router;
