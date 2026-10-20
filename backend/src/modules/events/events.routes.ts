import { Router } from 'express';
import { EventsController } from './events.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole } from '../../middleware/rbac.js';

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(authenticateToken);

// Listar y ver detalles: accesible para cualquier rol autenticado (Admin, Operador, Consulta)
router.get('/', requireAnyRole, EventsController.getAll);
router.get('/:id', requireAnyRole, EventsController.getById);
router.get('/:id/ticket-types', requireAnyRole, EventsController.getTicketTypes);

// Modificación estructural: requiere rol ADMIN
router.post('/', requireAdmin, EventsController.create);
router.put('/:id', requireAdmin, EventsController.update);
router.put('/:id/settings', requireAdmin, EventsController.updateSettings);
router.post('/:id/clone', requireAdmin, EventsController.cloneEdition);
router.post('/:id/ticket-types', requireAdmin, EventsController.createTicketType);
router.put('/:id/ticket-types/:ticketTypeId', requireAdmin, EventsController.updateTicketType);

export default router;
