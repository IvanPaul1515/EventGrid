import { Router } from 'express';
import { AttendanceController } from './attendance.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAnyRole, requireOperatorOrAdmin, requireAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);

// Rutas de lectura y exportación (ADMIN, OPERATOR, VIEWER)
router.get('/', requireAnyRole, AttendanceController.searchAndList);
router.get('/counters', requireAnyRole, AttendanceController.getCounters);
router.get('/export', requireAnyRole, AttendanceController.exportData);

// Check-in (Operador y Administrador)
router.post('/check-in', requireOperatorOrAdmin, AttendanceController.checkIn);

// Reversión de asistencia (Estrictamente ADMINISTRADOR con justificación)
router.post('/revert', requireAdmin, AttendanceController.revert);

export default router;
