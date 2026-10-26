import courtesyRoutes from './courtesy.routes.js';
import { Router } from 'express';
import { ParticipantsController } from './participants.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole, requireOperatorOrAdmin, requirePermission } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);
router.use('/courtesy-requests', courtesyRoutes);

// Rutas especiales y acciones globales (deben declararse antes de /:id)
router.post('/demo', requireAdmin, ParticipantsController.generateDemo);
router.delete('/demo', requireOperatorOrAdmin, ParticipantsController.clearDemo);
router.post('/onsite-sale', requireOperatorOrAdmin, ParticipantsController.onsiteSale);

// Rutas administrativas de eliminación segura (ADMIN)
router.get('/deletion-preview', requireAdmin, ParticipantsController.getDeletionPreview);
router.post('/delete-imported', requireAdmin, ParticipantsController.deleteImported);
router.post('/purge-edition', requireAdmin, ParticipantsController.purgeEdition);

// Rutas de consulta y exportación
router.get('/', requireAnyRole, ParticipantsController.list);
router.get('/export', requirePermission('PARTICIPANTS_EXPORT'), ParticipantsController.exportData);
router.get('/:id', requireAnyRole, ParticipantsController.getById);
router.get('/:id/history', requireAnyRole, ParticipantsController.getHistory);

// Rutas de pagos y operaciones de participante con permisos granulares
router.post('/:id/payments', requireOperatorOrAdmin, ParticipantsController.recordPayment);
router.post('/:id/cancel', requirePermission('REGISTRATION_CANCEL'), ParticipantsController.cancel);
router.post('/:id/reactivate', requirePermission('REGISTRATION_REACTIVATE'), ParticipantsController.reactivate);
router.post('/:id/courtesy', requirePermission('COURTESY_AUTHORIZE'), ParticipantsController.assignCourtesy);

// Modificación básica de registros
router.post('/', requireOperatorOrAdmin, ParticipantsController.create);
router.put('/:id', requireOperatorOrAdmin, ParticipantsController.update);
router.delete('/:id', requireOperatorOrAdmin, ParticipantsController.delete);
router.put('/:registrationId/tshirt-size', requireOperatorOrAdmin, ParticipantsController.updateTshirtSize);
router.post('/:registrationId/deliver-tshirt', requireOperatorOrAdmin, ParticipantsController.deliverTshirt);
router.post('/:registrationId/return-tshirt', requireOperatorOrAdmin, ParticipantsController.returnTshirt);

export default router;
