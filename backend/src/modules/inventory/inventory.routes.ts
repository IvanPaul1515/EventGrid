import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);

// Consulta de inventario y estadísticas (Cualquier rol autenticado)
router.get('/', requireAnyRole, InventoryController.getInventory);

// Inicialización del inventario de 282 unidades (Solo Admin)
router.post('/init', requireAdmin, InventoryController.initInventory);

// Modificación administrativa del inventario (Solo Admin)
router.post('/', requireAdmin, InventoryController.createItem);
router.put('/:id', requireAdmin, InventoryController.updateItem);
router.delete('/:id', requireAdmin, InventoryController.deleteItem);

export default router;
