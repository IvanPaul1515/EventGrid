import {HandwrittenInputSchema,assertHandwrittenRole,validateHandwritten,executeHandwritten} from './handwritten.service.js';
import {ModuleImportService} from './module-import.service.js';
import {MODULE_KINDS,MODULE_FIELDS,moduleMapping,importAccess} from './module-rules.js';
import {RealtimeService} from '../realtime/realtime.service.js';
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

router.post('/handwritten/validate',requireOperatorOrAdmin,async(req,res,next)=>{try{assertHandwrittenRole(req.user);res.json({data:await validateHandwritten(req.eventId!,HandwrittenInputSchema.parse(req.body))});}catch(e){next(e);}});
router.post('/handwritten/execute',requireOperatorOrAdmin,async(req,res,next)=>{try{assertHandwrittenRole(req.user);const result=await executeHandwritten(req.eventId!,req.user!.id,HandwrittenInputSchema.parse(req.body));RealtimeService.changed(req.eventId!,['participants','sales','inventory']);res.json({data:result});}catch(e){next(e);}});
router.put('/purchases/:id/history',requireAdmin,async(req,res,next)=>{try{const input=z.object({saleTimestamp:z.string().min(1),purchaseTime:z.string().optional(),sourceTimezone:z.string().optional(),reason:z.string().trim().min(10).max(500),confirmed:z.literal(true)}).parse(req.body);const metadata=temporalMetadata(input);if(metadata.purchasedAt)metadata.purchasedAt.source='ADMIN_REVIEWED';await writeTransaction(async tx=>{const actor=await tx.user.findUnique({where:{id:req.user!.id}});if(actor?.role!=='ADMIN'||actor.scannerOnly||actor.isActive===false)throw new ForbiddenError('Revisión administrativa requerida.');const row=await tx.registration.findFirstOrThrow({where:{id:req.params.id,eventId:req.eventId!}});const old=JSON.parse(row.historicalDates||'{}');const next={...old,purchasedAt:metadata.purchasedAt};await tx.registration.update({where:{id:row.id},data:{historicalDates:JSON.stringify(next)}});await tx.auditLog.create({data:{userId:req.user!.id,action:'UPDATE',entity:'REGISTRATION',entityId:row.id,changes:JSON.stringify({operation:'REVIEW_HISTORICAL_PURCHASE_DATE',before:old,after:next,reason:input.reason})}});});res.json({data:{reviewed:true,message:'Fecha revisada; derechos de merch existentes conservados. La conciliación es independiente.'}});}catch(e){next(e);}});
const moduleInput=z.object({kind:z.enum(MODULE_KINDS),source:z.string().trim().min(1).max(100),rows:z.array(z.record(z.unknown())).min(1).max(5000),mapping:z.record(z.string()),fileName:z.string().min(1).max(255),fileSize:z.number().int().nonnegative().default(0),confirmed:z.literal(true).optional(),update:z.boolean().default(false)});
router.get('/module-fields',requireOperatorOrAdmin,async(req,res,next)=>{try{const columns=z.array(z.string().max(255)).max(200).parse(JSON.parse(String(req.query.columns||'[]')));res.json({data:{fields:MODULE_FIELDS,mappings:Object.fromEntries(MODULE_KINDS.map(kind=>[kind,moduleMapping(kind,columns)]))}});}catch(e){next(e);}});
router.post('/module/validate',requireOperatorOrAdmin,async(req,res,next)=>{try{const n=moduleInput.parse(req.body);importAccess(req.user,n.kind);res.json({data:await ModuleImportService.validate(prisma,req.eventId!,n.kind,n.rows,n.mapping,n.source)});}catch(e){next(e);}});
router.post('/module/execute',requireOperatorOrAdmin,async(req,res,next)=>{try{const n=moduleInput.parse(req.body);if(!n.confirmed)throw new ForbiddenError('Confirma expresamente el impacto de la importación.');importAccess(req.user,n.kind);const result=await ModuleImportService.execute(req.eventId!,req.user!.id,n.kind,n.rows,n.mapping,n.source,n.fileName,n.fileSize,n.update);RealtimeService.changed(req.eventId!,['participants','sales','inventory','attendance']);res.json({data:result});}catch(e){next(e);}});
router.get('/contributions',requireAnyRole,async(req,res,next)=>{try{const rows=await prisma.importedContribution.findMany({where:{eventId:req.eventId!},include:{sponsor:{select:{name:true}}},orderBy:{createdAt:'desc'}});const payments=await prisma.sponsorPayment.findMany({where:{id:{in:rows.map(r=>r.paymentId).filter((id):id is string=>!!id)}}});res.json({data:rows.map(r=>({...r,cashReceivedVerified:r.kind==='SPONSOR_CASH'&&payments.some(p=>p.id===r.paymentId&&p.status==='ACTIVE')}))});}catch(e){next(e);}});
router.get('/purchases',requireAnyRole,async(req,res,next)=>{try{const rows=await prisma.registration.findMany({where:{eventId:req.eventId!,isDemo:false,status:{not:'CANCELLED'},isCourtesy:false,amountPaid:{gt:0}},select:{id:true,historicalDates:true,source:true,externalReference:true,externalPlatform:true,registrationNumber:true,paymentStatus:true,participant:{select:{fullName:true}}}});res.json({data:purchaseChronology(rows).map(p=>({...rows.find(r=>r.id===p.id),...p}))});}catch(e){next(e);}});
const templateSchema=z.object({name:z.string().trim().min(1).max(80),kind:z.enum(['PARTICIPANTS','PURCHASES',...MODULE_KINDS]),columns:z.record(z.string().max(80)).refine(c=>Object.keys(c).length<=100),source:z.string().trim().max(80).optional()});
router.get('/templates',requireOperatorOrAdmin,async(req,res,next)=>{try{const row=await prisma.eventSettings.findUnique({where:{eventId:req.eventId!}});res.json({data:JSON.parse(row?.importMappingTemplates||'[]')});}catch(e){next(e);}});
router.post('/templates',requireAdmin,async(req,res,next)=>{try{const input=templateSchema.parse(req.body);if(MODULE_KINDS.includes(input.kind as any)){const fields=MODULE_FIELDS[input.kind as typeof MODULE_KINDS[number]];const targets=Object.values(input.columns).filter(v=>v&&v!=='IGNORE');if(new Set(targets).size!==targets.length||targets.some(v=>!fields.some(f=>f.key===v)))throw new ForbiddenError('Mapeo de plantilla incompatible.');}else assertMapping(input.columns);const data=await writeTransaction(async tx=>{const settings=await tx.eventSettings.findUniqueOrThrow({where:{eventId:req.eventId!}});const list=JSON.parse(settings.importMappingTemplates||'[]');const next=[...list.filter((t:any)=>t.name!==input.name||t.kind!==input.kind),input].slice(-30);await tx.eventSettings.update({where:{id:settings.id},data:{importMappingTemplates:JSON.stringify(next)}});await tx.auditLog.create({data:{userId:req.user!.id,action:'UPDATE',entity:'EVENT',entityId:req.eventId!,changes:JSON.stringify({module:'IMPORT',operation:'SAVE_MAPPING_TEMPLATE',name:input.name,kind:input.kind})}});return next;});res.json({data});}catch(e){next(e);}});

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
