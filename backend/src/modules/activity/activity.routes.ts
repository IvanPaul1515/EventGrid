import { Router } from 'express';
import { ActivityController } from './activity.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAnyRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticateToken);

// Consulta del registro histórico de auditoría y actividades
router.get('/', requireAnyRole, ActivityController.list);

export default router;
