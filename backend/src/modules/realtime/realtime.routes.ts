import { Router } from 'express';
import { RealtimeController } from './realtime.controller.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// Stream de eventos SSE (Requiere autenticación con token en header, cookie o query)
router.get('/:eventId/stream', authenticateToken, RealtimeController.stream);
router.get('/:eventId/realtime/stream', authenticateToken, RealtimeController.stream);

// Diagnóstico de clientes conectados por edición
router.get('/:eventId/status', authenticateToken, RealtimeController.getStatus);
router.get('/:eventId/realtime/status', authenticateToken, RealtimeController.getStatus);

export default router;
