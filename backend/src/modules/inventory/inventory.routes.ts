import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';
import {prisma} from '../../config/db.js';
import {NotFoundError} from '../../utils/errors.js';
import {inventoryHistory} from './inventory-history.js';

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
router.get('/:id/history',requireAnyRole,async(req,res,next)=>{try{
 const item=await prisma.tshirtInventory.findFirst({where:{id:req.params.id,eventId:req.eventId!},select:{id:true,size:true}});if(!item)throw new NotFoundError('Talla no encontrada en esta edición.');
 const rows=await prisma.auditLog.findMany({where:{OR:[{entityId:item.id,entity:'TSHIRT_INVENTORY'},{entityId:req.eventId!,entity:'EVENT',action:{in:['TSHIRT_INVENTORY_INIT','UPDATE']}}]},select:{id:true,entityId:true,action:true,changes:true,createdAt:true},orderBy:{createdAt:'desc'},take:500});
 res.json({data:inventoryHistory(rows,item)});
}catch(error){next(error);}});

// 3. Inicialización del inventario de 282 unidades (Solo Admin)
router.post('/init', requireAdmin, InventoryController.initInventory);

// 4. Modificación administrativa del inventario (Solo Admin)
router.post('/', requireAdmin, InventoryController.createItem);
router.put('/:id', requireAdmin, InventoryController.updateItem);
router.delete('/:id', requireAdmin, InventoryController.deleteItem);

export default router;
