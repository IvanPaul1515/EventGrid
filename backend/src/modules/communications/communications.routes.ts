import { Router } from 'express';
import { CommunicationsController } from './communications.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticateToken);

// Configuración SMTP y prueba (solo ADMIN)
router.get('/config', requireRole(['ADMIN']), CommunicationsController.getConfig);
router.put('/config', requireRole(['ADMIN']), CommunicationsController.saveConfig);
router.post('/test', requireRole(['ADMIN']), CommunicationsController.testConnection);

// Plantillas de correo (ADMIN y OPERATOR)
router.get('/templates', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getTemplates);
router.put('/templates/:templateId', requireRole(['ADMIN']), CommunicationsController.updateTemplate);

// Vista previa real sin efectos secundarios (ADMIN y OPERATOR)
router.post('/preview', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.previewEmail);

// Envíos de correo (ADMIN y OPERATOR para individual; solo ADMIN para masivo)
router.post('/send', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.sendSingleEmail);
router.post('/send-bulk', requireRole(['ADMIN']), CommunicationsController.sendBulkEmail);


// Prevalidación exacta de destinatarios (ADMIN y OPERATOR)
router.post('/recipients/validate', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.validateRecipients);

// Lotes persistentes de correo masivo (ADMIN)
router.get('/jobs', requireRole(['ADMIN']), CommunicationsController.getBatchJobs);
router.get('/jobs/:id', requireRole(['ADMIN']), CommunicationsController.getBatchJob);
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

export default router;
