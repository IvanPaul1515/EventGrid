import { prisma } from '../../config/db.js';
import { ForbiddenError } from '../../utils/errors.js';
import { Router } from 'express';
import { QrController } from './qr.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticateToken);
router.param('registrationId', async (req, _res, next) => {
  try {
    if ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) && req.params.registrationId) {
      const registration = await prisma.registration.findFirst({ where: { id: req.params.registrationId, eventId: req.eventId } });
      if (!registration) throw new ForbiddenError('Entrada fuera de su edición');
    }
    next();
  } catch (error) { next(error); }
});

// Consultar entrada digital y código QR
router.get('/:registrationId', requireRole(['ADMIN', 'OPERATOR', 'VIEWER']), QrController.getTicketQr);

// Revocar y regenerar QR (solo ADMIN)
router.post('/:registrationId/revoke', requireRole(['ADMIN']), QrController.revokeQr);

// Escaneo y validación de QR (ADMIN y OPERATOR)
router.post('/scan', requireRole(['ADMIN', 'OPERATOR']), QrController.scan);

export default router;
