import { Router } from 'express';
import { SponsorsController } from './sponsors.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

// Autenticación obligatoria y contexto de edición
router.use(authenticateToken);
router.use(editionContext);

// Consultas autorizadas (Admin, Operador, Consulta)
router.get('/summary', requireRole(['ADMIN', 'OPERATOR', 'VIEWER']), SponsorsController.getSummary);
router.get('/', requireRole(['ADMIN', 'OPERATOR', 'VIEWER']), SponsorsController.getSponsors);
router.get('/:id', requireRole(['ADMIN', 'OPERATOR', 'VIEWER']), SponsorsController.getSponsorById);

// Gestión económica y de registros (Exclusivo Administrador)
router.post('/', requireRole(['ADMIN']), SponsorsController.createSponsor);
router.put('/:id', requireRole(['ADMIN']), SponsorsController.updateSponsor);
router.patch('/:id/archive', requireRole(['ADMIN']), SponsorsController.archiveSponsor);
router.post('/:id/payments', requireRole(['ADMIN']), SponsorsController.registerPayment);
router.post('/payments/:paymentId/annull', requireRole(['ADMIN']), SponsorsController.annullPayment);

export default router;
