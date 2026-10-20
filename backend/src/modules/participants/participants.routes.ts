import { Router } from 'express';
import { ParticipantsController } from './participants.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);

// Rutas especiales y acciones globales (deben declararse antes de /:id)
router.post('/demo', requireOperatorOrAdmin, ParticipantsController.generateDemo);
router.delete('/demo', requireOperatorOrAdmin, ParticipantsController.clearDemo);
router.post('/onsite-sale', requireOperatorOrAdmin, ParticipantsController.onsiteSale);

// Rutas de consulta y exportación (ADMIN, OPERATOR, VIEWER)
router.get('/', requireAnyRole, ParticipantsController.list);
router.get('/export', requireAnyRole, ParticipantsController.exportData);
router.get('/:id', requireAnyRole, ParticipantsController.getById);
router.get('/:id/history', requireAnyRole, ParticipantsController.getHistory);

// Rutas de pagos y operaciones de participante
router.post('/:id/payments', requireOperatorOrAdmin, ParticipantsController.recordPayment);
router.post('/:id/cancel', requireAdmin, ParticipantsController.cancel);
router.post('/:id/reactivate', requireAdmin, ParticipantsController.reactivate);
router.post('/:id/courtesy', requireAdmin, ParticipantsController.assignCourtesy);

// Modificación básica de registros
router.post('/', requireOperatorOrAdmin, ParticipantsController.create);
router.put('/:id', requireOperatorOrAdmin, ParticipantsController.update);
router.delete('/:id', requireOperatorOrAdmin, ParticipantsController.delete);

export default router;
