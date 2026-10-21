import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);

// 1. T-shirts del Staff (Parte 2)
// NOTA: Deben registrarse ANTES de las rutas con parámetro /:id para evitar colisiones
router.get('/staff', requireAnyRole, InventoryController.getStaffInventory);
router.put('/staff/reserve', requireAdmin, InventoryController.reserveStaffTshirts);
router.post('/staff/deliver', requireAdmin, InventoryController.deliverStaffTshirts);
router.post('/staff/release', requireAdmin, InventoryController.releaseStaffTshirts);
router.get('/staff/deliveries', requireAnyRole, InventoryController.getStaffDeliveries);

// 2. Consulta de inventario general y estadísticas
router.get('/', requireAnyRole, InventoryController.getInventory);

// 3. Inicialización del inventario de 282 unidades (Solo Admin)
router.post('/init', requireAdmin, InventoryController.initInventory);

// 4. Modificación administrativa del inventario (Solo Admin)
router.post('/', requireAdmin, InventoryController.createItem);
router.put('/:id', requireAdmin, InventoryController.updateItem);
router.delete('/:id', requireAdmin, InventoryController.deleteItem);

export default router;
