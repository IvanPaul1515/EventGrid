import { actionRateLimiter } from '../../middleware/rateLimiter.js';
import trackingRoutes from './tracking.routes.js';
import { prisma } from '../../config/db.js';
import { ForbiddenError } from '../../utils/errors.js';
import { Router } from 'express';
import { CommunicationsController } from './communications.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();
const explicitActionLimit = actionRateLimiter();

// Webhook transaccional de Brevo (Ruta pública entrante protegida con validación de secreto)
router.post('/webhooks/brevo', CommunicationsController.handleBrevoWebhook);

router.use(authenticateToken);
router.use('/tracking', trackingRoutes);
router.param('registrationId', async (req, _res, next) => {
  try {
    if ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) && !await prisma.registration.findFirst({ where: { id: req.params.registrationId, eventId: req.eventId } })) throw new ForbiddenError('Inscripción fuera de su edición');
    next();
  } catch (error) { next(error); }
});

router.get('/status', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getStatus);

// Configuración SMTP y prueba (solo ADMIN)
router.get('/config', requireRole(['ADMIN']), CommunicationsController.getConfig);
router.put('/config', requireRole(['ADMIN']), CommunicationsController.saveConfig);
router.post('/test', requireRole(['ADMIN']), CommunicationsController.testConnection);
router.get('/smtp-summary', requireRole(['ADMIN']), CommunicationsController.getSmtpSummary);

// Plantillas de correo (ADMIN y OPERATOR)
router.get('/templates', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getTemplates);
router.put('/templates/:templateId', requireRole(['ADMIN']), CommunicationsController.updateTemplate);

// Vista previa real sin efectos secundarios (ADMIN y OPERATOR)
router.post('/preview', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.previewEmail);

// Envíos de correo (ADMIN y OPERATOR para individual; solo ADMIN para masivo)
router.post('/send', requireRole(['ADMIN', 'OPERATOR']), explicitActionLimit, CommunicationsController.sendSingleEmail);
router.post('/send-bulk', requireRole(['ADMIN']), explicitActionLimit, CommunicationsController.sendBulkEmail);

// Prevalidación de campañas masivas (solo ADMIN)
router.post('/recipients/validate', requireRole(['ADMIN']), CommunicationsController.validateRecipients);

// Lotes persistentes de correo masivo (ADMIN)
router.get('/jobs', requireRole(['ADMIN']), CommunicationsController.getBatchJobs);
router.get('/jobs/:id', requireRole(['ADMIN']), CommunicationsController.getBatchJob);
router.post('/jobs/:id/review-interrupted', requireRole(['ADMIN']), CommunicationsController.reviewInterrupted);
router.post('/jobs/:id/cancel', requireRole(['ADMIN']), CommunicationsController.cancelBatchJob);
router.post('/jobs/:id/retry', requireRole(['ADMIN']), CommunicationsController.retryBatchJob);
router.post('/jobs/:id/retry-failed', requireRole(['ADMIN']), CommunicationsController.retryFailedBatchJob);
router.post('/jobs/:id/retry-uncertain', requireRole(['ADMIN']), CommunicationsController.retryUncertainBatchJob);

router.get('/batches', requireRole(['ADMIN']), CommunicationsController.getBatchJobs);
router.get('/batches/:id', requireRole(['ADMIN']), CommunicationsController.getBatchJob);
router.post('/batches/:id/cancel', requireRole(['ADMIN']), CommunicationsController.cancelBatchJob);
router.post('/batches/:id/retry', requireRole(['ADMIN']), CommunicationsController.retryBatchJob);
router.post('/batches/:id/retry-failed', requireRole(['ADMIN']), CommunicationsController.retryFailedBatchJob);
router.post('/batches/:id/retry-uncertain', requireRole(['ADMIN']), CommunicationsController.retryUncertainBatchJob);

// Historial de correos (ADMIN y OPERATOR)
router.get('/logs', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getLogs);
router.get('/history/registration/:registrationId', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getRegistrationHistory);

export default router;
