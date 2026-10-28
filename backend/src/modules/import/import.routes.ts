import {ForbiddenError} from '../../utils/errors.js';
import {z} from 'zod';
import {prisma} from '../../config/db.js';
import {assertMapping,purchaseChronology,temporalMetadata} from './intelligence.js';
import {writeTransaction} from '../../utils/writeTransaction.js';
import { Router } from 'express';
import { ImportController } from './import.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin, requireAnyRole, requireOperatorOrAdmin } from '../../middleware/rbac.js';
import { editionContext } from '../../middleware/editionContext.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(editionContext);
router.use((req,_res,next)=>req.user?.scannerOnly?next(new ForbiddenError('El perfil Escáner QR no puede importar información.')):next());

router.put('/purchases/:id/history',requireAdmin,async(req,res,next)=>{try{const input=z.object({saleTimestamp:z.string().min(1),purchaseTime:z.string().optional(),sourceTimezone:z.string().optional(),reason:z.string().trim().min(10).max(500),confirmed:z.literal(true)}).parse(req.body);const metadata=temporalMetadata(input);if(metadata.purchasedAt)metadata.purchasedAt.source='ADMIN_REVIEWED';await writeTransaction(async tx=>{const actor=await tx.user.findUnique({where:{id:req.user!.id}});if(actor?.role!=='ADMIN'||actor.scannerOnly||actor.isActive===false)throw new ForbiddenError('Revisión administrativa requerida.');const row=await tx.registration.findFirstOrThrow({where:{id:req.params.id,eventId:req.eventId!}});const old=JSON.parse(row.historicalDates||'{}');const next={...old,purchasedAt:metadata.purchasedAt};await tx.registration.update({where:{id:row.id},data:{historicalDates:JSON.stringify(next)}});await tx.auditLog.create({data:{userId:req.user!.id,action:'UPDATE',entity:'REGISTRATION',entityId:row.id,changes:JSON.stringify({operation:'REVIEW_HISTORICAL_PURCHASE_DATE',before:old,after:next,reason:input.reason})}});});res.json({data:{reviewed:true,message:'Fecha revisada; derechos de merch existentes conservados. La conciliación es independiente.'}});}catch(e){next(e);}});
router.get('/purchases',requireAnyRole,async(req,res,next)=>{try{const rows=await prisma.registration.findMany({where:{eventId:req.eventId!,isDemo:false,status:{not:'CANCELLED'},isCourtesy:false,amountPaid:{gt:0}},select:{id:true,historicalDates:true,source:true,externalReference:true,externalPlatform:true,registrationNumber:true,paymentStatus:true,participant:{select:{fullName:true}}}});res.json({data:purchaseChronology(rows).map(p=>({...rows.find(r=>r.id===p.id),...p}))});}catch(e){next(e);}});
const templateSchema=z.object({name:z.string().trim().min(1).max(80),kind:z.enum(['PARTICIPANTS','PURCHASES']),columns:z.record(z.string().max(80)).refine(c=>Object.keys(c).length<=100),source:z.string().trim().max(80).optional()});
router.get('/templates',requireOperatorOrAdmin,async(req,res,next)=>{try{const row=await prisma.eventSettings.findUnique({where:{eventId:req.eventId!}});res.json({data:JSON.parse(row?.importMappingTemplates||'[]')});}catch(e){next(e);}});
router.post('/templates',requireAdmin,async(req,res,next)=>{try{const input=templateSchema.parse(req.body);assertMapping(input.columns);const data=await writeTransaction(async tx=>{const settings=await tx.eventSettings.findUniqueOrThrow({where:{eventId:req.eventId!}});const list=JSON.parse(settings.importMappingTemplates||'[]');const next=[...list.filter((t:any)=>t.name!==input.name||t.kind!==input.kind),input].slice(-30);await tx.eventSettings.update({where:{id:settings.id},data:{importMappingTemplates:JSON.stringify(next)}});await tx.auditLog.create({data:{userId:req.user!.id,action:'UPDATE',entity:'EVENT',entityId:req.eventId!,changes:JSON.stringify({module:'IMPORT',operation:'SAVE_MAPPING_TEMPLATE',name:input.name,kind:input.kind})}});return next;});res.json({data});}catch(e){next(e);}});

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
