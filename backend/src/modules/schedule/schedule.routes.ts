import { Router } from 'express';
import { ScheduleController } from './schedule.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAnyRole, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

// Endpoint público para consulta de cronograma (móvil, PWA, participantes)
router.get('/public', ScheduleController.getPublicSchedule);

// Middleware de autenticación y contexto de edición
router.use(authenticateToken);
router.use(editionContext);

// Consultas autenticadas (cualquier rol)
router.get('/', requireAnyRole, ScheduleController.getItems);
router.get('/:id', requireAnyRole, ScheduleController.getItemById);

// Gestión de charlas e importaciones (Admin u Operador)
router.post('/', requireOperatorOrAdmin, ScheduleController.createItem);
router.put('/:id', requireOperatorOrAdmin, ScheduleController.updateItem);
router.delete('/:id', requireOperatorOrAdmin, ScheduleController.deleteItem);
router.post('/import', requireOperatorOrAdmin, ScheduleController.importSchedule);
router.post('/pdf', requireOperatorOrAdmin, ScheduleController.updatePdfUrl);

export default router;
