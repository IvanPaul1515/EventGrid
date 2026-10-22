import { z } from 'zod';
import { SponsorsService } from './sponsors.service.js';
import { recordAuditLog } from '../../middleware/audit.js';
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
router.get('/categories', async (req, res, next) => {
  try { res.json({ status: 'success', data: await SponsorsService.getCategories(req.eventId!) }); } catch (error) { next(error); }
});
router.put('/categories', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const values = z.record(z.string().trim().min(1).max(100), z.number().finite().nonnegative().max(1e12).nullable()).parse(req.body.values);
    const data = await SponsorsService.configureCategories(req.eventId!, values);
    await recordAuditLog({ req, action: 'UPDATE', entity: 'EVENT_SETTINGS', entityId: req.eventId, changes: { sponsorCategoryValues: values } });
    res.json({ status: 'success', data });
  } catch (error) { next(error); }
});
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
