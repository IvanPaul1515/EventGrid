import { Router } from 'express';
import { ScheduleController } from './schedule.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAnyRole, requireOperatorOrAdmin, requireAdmin, requirePermission } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

// Endpoint público para consulta de cronograma (móvil, PWA, participantes)
router.get('/public', ScheduleController.getPublicSchedule);

// Middleware de autenticación y contexto de edición
router.use(authenticateToken);
router.use(editionContext);

// Consultas autenticadas (cualquier rol)
router.get('/', requireAnyRole, ScheduleController.getItems);

// Gestión de charlas e importaciones (Admin u Operador)
router.post('/', requireOperatorOrAdmin, ScheduleController.createItem);
router.put('/:id', requireOperatorOrAdmin, ScheduleController.updateItem);
router.delete('/:id', requireOperatorOrAdmin, ScheduleController.deleteItem);
router.post('/import', requireOperatorOrAdmin, ScheduleController.importSchedule);
router.post('/pdf', requireOperatorOrAdmin, ScheduleController.updatePdfUrl);

router.post('/demo', requirePermission('DEMO_MANAGE'), ScheduleController.seedDemoSchedule);
router.delete('/demo', requirePermission('DEMO_MANAGE'), ScheduleController.clearDemoSchedule);


// Historial de cambios y notificaciones programadas
router.get('/history', requireAnyRole, ScheduleController.getChangeHistory);
router.get('/scheduled', requireAnyRole, ScheduleController.getScheduledNotifications);
router.get('/:id', requireAnyRole, ScheduleController.getItemById);

router.delete('/scheduled/:id', requireOperatorOrAdmin, ScheduleController.cancelScheduledNotification);

// Anuncios y notificaciones de cronograma
router.post('/notify-change', requireOperatorOrAdmin, ScheduleController.notifyScheduleChange);
router.post('/announcement', requireOperatorOrAdmin, ScheduleController.createAnnouncement);
router.post('/:id/publish-keynote', requireOperatorOrAdmin, ScheduleController.publishKeynote);

export default router;
