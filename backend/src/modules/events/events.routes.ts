import { Router } from 'express';
import { EventsController } from './events.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireGlobalAdmin, requireAnyRole, requirePermission } from '../../middleware/rbac.js';
import { enforceEditionAccess } from '../../middleware/editionAccess.js';

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(authenticateToken);
router.param('id', (req, res, next) => enforceEditionAccess(req, res, next));

// Listar y ver detalles: accesible para cualquier rol autenticado (Admin, Operador, Consulta)
router.get('/', requireAnyRole, EventsController.getAll);
router.get('/:id', requireAnyRole, EventsController.getById);
router.get('/:id/ticket-types', requireAnyRole, EventsController.getTicketTypes);
router.get('/:id/financial-summary', requireAnyRole, EventsController.getFinancialSummary);
router.get('/:id/stats', requireAnyRole, EventsController.getStats);

// Modificación estructural y configuración: requiere permisos de administración
router.post('/', requireGlobalAdmin, requirePermission('SETTINGS_MANAGE'), EventsController.create);
router.put('/:id', requirePermission('SETTINGS_MANAGE'), EventsController.update);
router.put('/:id/settings', requirePermission('SETTINGS_MANAGE'), EventsController.updateSettings);
router.post('/:id/logo', requirePermission('SETTINGS_MANAGE'), EventsController.uploadLogo);
router.delete('/:id/logo', requirePermission('SETTINGS_MANAGE'), EventsController.removeLogo);
router.post('/:id/clone', requireGlobalAdmin, requirePermission('SETTINGS_MANAGE'), EventsController.cloneEdition);
router.put('/:id/default-ticket', requirePermission('PRICE_MODIFY'), async (req,res,next) => { try {
  const { z } = await import('zod'); const { prisma } = await import('../../config/db.js'); const { writeTransaction } = await import('../../utils/writeTransaction.js'); const { BadRequestError } = await import('../../utils/errors.js');
  const ticketTypeId=z.string().uuid().parse(req.body.ticketTypeId);
  const result=await writeTransaction(async tx=>{
    const ticket=await tx.ticketType.findFirst({where:{id:ticketTypeId,eventId:req.params.id,isActive:true,price:{gt:0}}});
    if (!ticket) throw new BadRequestError('Seleccione una tarifa activa de pago de esta edición.');
    const previous=await tx.event.findUniqueOrThrow({where:{id:req.params.id},select:{defaultTicketTypeId:true}});
    const event=await tx.event.update({where:{id:req.params.id},data:{defaultTicketTypeId:ticketTypeId}});
    const changes={before:previous.defaultTicketTypeId,after:ticketTypeId}; await tx.auditLog.create({data:{userId:req.user!.id,entity:'EVENT',entityId:event.id,action:'UPDATE',changes:(process.env.DATABASE_URL?.startsWith('file:')?JSON.stringify(changes):changes) as any}});
    return event;
  });res.json({data:result});
} catch(e){next(e);} });
router.post('/:id/ticket-types', requirePermission('PRICE_MODIFY'), EventsController.createTicketType);
router.put('/:id/ticket-types/:ticketTypeId', requirePermission('PRICE_MODIFY'), EventsController.updateTicketType);

export default router;
