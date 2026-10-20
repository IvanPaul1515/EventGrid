import { Router } from 'express';
import { QrController } from './qr.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticateToken);

// Consultar entrada digital y código QR
router.get('/:registrationId', requireRole(['ADMIN', 'OPERATOR', 'VIEWER']), QrController.getTicketQr);

// Revocar y regenerar QR (solo ADMIN)
router.post('/:registrationId/revoke', requireRole(['ADMIN']), QrController.revokeQr);

// Escaneo y validación de QR (ADMIN y OPERATOR)
router.post('/scan', requireRole(['ADMIN', 'OPERATOR']), QrController.scan);

export default router;
