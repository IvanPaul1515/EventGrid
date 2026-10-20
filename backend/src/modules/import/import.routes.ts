import { Router } from 'express';
import { ImportController } from './import.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);

// Rutas de análisis y validación previa (ADMIN y OPERATOR)
router.post('/analyze', requireOperatorOrAdmin, ImportController.analyze);
router.post('/validate', requireOperatorOrAdmin, ImportController.validate);
router.post('/execute', requireOperatorOrAdmin, ImportController.execute);

// Historial y reportes de errores
router.get('/batches', requireAnyRole, ImportController.getBatches);
router.get('/batches/:batchId/errors', requireAnyRole, ImportController.downloadErrorReport);

// Eliminar lotes y limpiar importaciones de Excel (ADMIN)
router.delete('/batches/:batchId', requireAdmin, ImportController.deleteBatch);
router.delete('/all', requireAdmin, ImportController.deleteAllImported);

export default router;
