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

// Envíos de correo (ADMIN y OPERATOR para individual; solo ADMIN para masivo)
router.post('/send', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.sendSingleEmail);
router.post('/send-bulk', requireRole(['ADMIN']), CommunicationsController.sendBulkEmail);

// Historial de correos (ADMIN y OPERATOR)
router.get('/logs', requireRole(['ADMIN', 'OPERATOR']), CommunicationsController.getLogs);

export default router;
