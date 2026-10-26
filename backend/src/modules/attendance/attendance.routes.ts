import incidentsRoutes from './incidents.routes.js';
import operationsRoutes from './operations.routes.js';
import { Router } from 'express';
import { AttendanceController } from './attendance.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAnyRole, requireOperatorOrAdmin, requirePermission } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);
router.use('/operations', operationsRoutes);
router.use('/incidents', incidentsRoutes);

// Rutas de lectura y exportación (ADMIN, OPERATOR, VIEWER)
router.get('/', requireAnyRole, AttendanceController.searchAndList);
router.get('/counters', requireAnyRole, AttendanceController.getCounters);
router.get('/daily-sales', requireAnyRole, AttendanceController.getDailySales);
router.get('/export', requirePermission('PARTICIPANTS_EXPORT'), AttendanceController.exportData);

// Check-in (Operador y Administrador)
router.post('/check-in', requireOperatorOrAdmin, AttendanceController.checkIn);

// Reversión de asistencia (Estrictamente ADMINISTRADOR con permiso ATTENDANCE_REVERT)
router.post('/revert', requirePermission('ATTENDANCE_REVERT'), AttendanceController.revert);

export default router;
