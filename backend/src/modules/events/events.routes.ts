import { Router } from 'express';
import { EventsController } from './events.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole, requirePermission } from '../../middleware/rbac.js';

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(authenticateToken);

// Listar y ver detalles: accesible para cualquier rol autenticado (Admin, Operador, Consulta)
router.get('/', requireAnyRole, EventsController.getAll);
router.get('/:id', requireAnyRole, EventsController.getById);
router.get('/:id/ticket-types', requireAnyRole, EventsController.getTicketTypes);
router.get('/:id/financial-summary', requireAnyRole, EventsController.getFinancialSummary);

// Modificación estructural y configuración: requiere permisos de administración
router.post('/', requirePermission('SETTINGS_MANAGE'), EventsController.create);
router.put('/:id', requirePermission('SETTINGS_MANAGE'), EventsController.update);
router.put('/:id/settings', requirePermission('SETTINGS_MANAGE'), EventsController.updateSettings);
router.post('/:id/logo', requirePermission('SETTINGS_MANAGE'), EventsController.uploadLogo);
router.delete('/:id/logo', requirePermission('SETTINGS_MANAGE'), EventsController.removeLogo);
router.post('/:id/clone', requirePermission('SETTINGS_MANAGE'), EventsController.cloneEdition);
router.post('/:id/ticket-types', requirePermission('PRICE_MODIFY'), EventsController.createTicketType);
router.put('/:id/ticket-types/:ticketTypeId', requirePermission('PRICE_MODIFY'), EventsController.updateTicketType);

export default router;
