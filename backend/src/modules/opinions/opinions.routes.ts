import {Router,Request,Response,NextFunction} from 'express';
import {randomBytes,createHmac} from 'node:crypto';
import QRCode from 'qrcode';
import {z} from 'zod';
import {prisma} from '../../config/db.js';
import {ENV} from '../../config/env.js';
import {authenticateToken} from '../../middleware/auth.js';
import {editionContext} from '../../middleware/editionContext.js';
import {requireAdmin} from '../../middleware/rbac.js';
import {BadRequestError,ForbiddenError,NotFoundError} from '../../utils/errors.js';
import {writeTransaction} from '../../utils/writeTransaction.js';
import {capabilitiesFor} from '../users/operator-policy.js';
import {RealtimeService} from '../realtime/realtime.service.js';
import {categories,configSchema,defaultQuestions,responseSchema,suggestionSchema,snapshotAnswers,summarizeOpinions,OpinionQuestion} from './opinions.rules.js';

export const publicOpinionsRoutes=Router(),opinionsRoutes=Router();
const id=z.string().uuid(),pageSchema=z.coerce.number().int().min(1).max(10000).default(1);
const privateHeaders=(_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();};
// Salt and digests are transient, bounded and never attached to an answer or written to the database.
const salt=randomBytes(32),attempts=new Map<string,{count:number;until:number}>();
publicOpinionsRoutes.use(privateHeaders,(req,res,next)=>{
 if(req.method!=='POST')return next();
 const now=Date.now(),key=createHmac('sha256',salt).update(req.ip||req.socket.remoteAddress||'unknown').digest('hex');
 for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
 if(attempts.size>=5000&&!attempts.has(key)){res.setHeader('Retry-After','60');return res.status(429).json({message:'Intenta nuevamente en un minuto.'});}
 const attempt=attempts.get(key)||{count:0,until:now+60000};attempts.set(key,attempt);
 if(++attempt.count>5){res.setHeader('Retry-After','60');return res.status(429).json({message:'Espera un minuto antes de enviar otra respuesta.'});}next();
});
async function publicSurvey(key:string,tx:any=prisma) {
 const survey=await tx.opinionSurvey.findUnique({where:{publicKey:id.parse(key)},include:{event:{select:{name:true,status:true,settings:{select:{primaryColor:true,backgroundColor:true,logoUrl:true}}}}}});
 if(!survey?.enabled||survey.event.status==='ARCHIVED')throw new NotFoundError('La encuesta no está disponible.');
 return survey;
}
publicOpinionsRoutes.get('/:key',async(req,res,next)=>{try{
 const s=await publicSurvey(req.params.key);
 res.json({data:{name:s.event.name,appearance:s.event.settings,questions:JSON.parse(s.questions).filter((q:OpinionQuestion)=>q.enabled),categories}});
}catch(e){next(e);}});
publicOpinionsRoutes.post('/:key/responses',async(req,res,next)=>{try{
 const input=responseSchema.parse(req.body);
 await writeTransaction(async tx=>{
  const s=await publicSurvey(req.params.key,tx);let answers;
  try{answers=snapshotAnswers(JSON.parse(s.questions),input.kind,input.answers);}catch{throw new BadRequestError('Revisa las respuestas y las preguntas disponibles.');}
  const existing=await tx.opinionResponse.findUnique({where:{id:input.id}});
  if(existing){if(existing.eventId!==s.eventId||existing.kind!==input.kind||existing.answers!==JSON.stringify(answers))throw new BadRequestError('No se puede reutilizar esta confirmación.');return;}
  await tx.opinionResponse.create({data:{id:input.id,eventId:s.eventId,kind:input.kind,answers:JSON.stringify(answers)}});
 });const survey=await prisma.opinionSurvey.findUnique({where:{publicKey:req.params.key},select:{eventId:true}});if(survey)RealtimeService.changed(survey.eventId,['opinions']);res.status(201).json({message:'Gracias. Tu respuesta fue recibida.'});
}catch(e){next(e);}});
publicOpinionsRoutes.post('/:key/suggestions',async(req,res,next)=>{try{
 const input=suggestionSchema.parse(req.body);
 await writeTransaction(async tx=>{const s=await publicSurvey(req.params.key,tx),existing=await tx.opinionSuggestion.findUnique({where:{id:input.id}});
  if(existing){if(existing.eventId!==s.eventId||existing.text!==input.text||existing.category!==input.category)throw new BadRequestError('No se puede reutilizar esta confirmación.');return;}
  await tx.opinionSuggestion.create({data:{id:input.id,eventId:s.eventId,category:input.category,text:input.text}});
 });const survey=await prisma.opinionSurvey.findUnique({where:{publicKey:req.params.key},select:{eventId:true}});if(survey)RealtimeService.changed(survey.eventId,['opinions']);res.status(201).json({message:'Gracias. Tu sugerencia fue recibida.'});
}catch(e){next(e);}});

opinionsRoutes.use(authenticateToken,editionContext,privateHeaders,(req,_res,next)=>{
 const user=req.user!,cap=req.method==='GET'?'OPINIONS_READ':'OPINIONS_MANAGE';
 const caps=capabilitiesFor(user);
 if(user.scannerOnly||user.role!=='ADMIN'&&!caps.includes(cap)&&!(req.method==='GET'&&caps.includes('OPINIONS_MANAGE')))return next(new ForbiddenError('Tu cuenta no tiene permiso para revisar opiniones.'));
 next();
});
function publicUrl(key:string) {
 const origin=process.env.FRONTEND_URL||ENV.CORS_ORIGIN.find(origin=>origin.startsWith('https://')||ENV.NODE_ENV!=='production'&&origin.startsWith('http://localhost'));
 if(!origin)throw new BadRequestError('Configure el dominio público del frontend antes de imprimir el QR.');
 const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new BadRequestError('Dominio público no válido.');
 return `${url.origin}/opinions/${key}`;
}
async function config(eventId:string) {
 const survey=await prisma.opinionSurvey.findUnique({where:{eventId}});
 return survey?{...survey,questions:JSON.parse(survey.questions),publicUrl:publicUrl(survey.publicKey)}:{enabled:false,questions:defaultQuestions,publicUrl:null};
}
opinionsRoutes.get('/config',async(req,res,next)=>{try{res.json({data:await config(req.eventId!)});}catch(e){next(e);}});
opinionsRoutes.put('/config',requireAdmin,async(req,res,next)=>{try{
 const input=configSchema.parse(req.body);
 const result=await writeTransaction(async tx=>{
  const actor=await tx.user.findUnique({where:{id:req.user!.id}});
  if(!actor?.isActive||actor.scannerOnly||actor.role!=='ADMIN'||actor.accountStatus==='PENDING'||actor.assignedEventId&&actor.assignedEventId!==req.eventId)throw new ForbiddenError('Se requiere un administrador vigente.');
  const result=await tx.opinionSurvey.upsert({where:{eventId:req.eventId!},create:{eventId:req.eventId!,enabled:input.enabled,questions:JSON.stringify(input.questions)},update:{enabled:input.enabled,questions:JSON.stringify(input.questions)}});
  await tx.auditLog.create({data:{userId:actor.id,entity:'EVENT',entityId:req.eventId!,action:'SETTINGS_UPDATE',changes:JSON.stringify({operation:'OPINIONS_CONFIG',enabled:input.enabled,questionIds:input.questions.map(q=>q.id)})}});return result;
 });res.json({data:{...result,questions:JSON.parse(result.questions),publicUrl:publicUrl(result.publicKey)}});
}catch(e){next(e);}});
opinionsRoutes.get('/qr/:format',async(req,res,next)=>{try{
 const s=await prisma.opinionSurvey.findUnique({where:{eventId:req.eventId!}});if(!s)throw new BadRequestError('Guarda la encuesta para generar su enlace permanente.');
 const url=publicUrl(s.publicKey),format=z.enum(['svg','png']).parse(req.params.format);
 res.setHeader('Content-Disposition',`attachment; filename="eventgrid-opiniones.${format}"`);
 if(format==='svg')res.type('image/svg+xml').send(await QRCode.toString(url,{type:'svg',margin:4,errorCorrectionLevel:'M'}));
 else res.type('image/png').send(await QRCode.toBuffer(url,{width:1024,margin:4,errorCorrectionLevel:'M'}));
}catch(e){next(e);}});
opinionsRoutes.get('/summary',async(req,res,next)=>{try{
 const [responses,suggestions,total]=await Promise.all([prisma.opinionResponse.findMany({where:{eventId:req.eventId!},orderBy:{createdAt:'desc'},take:5000,select:{kind:true,answers:true}}),prisma.opinionSuggestion.findMany({where:{eventId:req.eventId!},select:{category:true}}),prisma.opinionResponse.count({where:{eventId:req.eventId!}})]);
 res.json({data:{...summarizeOpinions(responses,suggestions),totalResponses:total,limited:total>5000}});
}catch(e){next(e);}});
opinionsRoutes.get('/responses',async(req,res,next)=>{try{
 const page=pageSchema.parse(req.query.page),kind=z.enum(['EVENT','ABSENCE']).default('EVENT').parse(req.query.kind),where={eventId:req.eventId!,kind};
 const [rows,total]=await Promise.all([prisma.opinionResponse.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*50,take:50}),prisma.opinionResponse.count({where})]);
 res.json({data:{rows:rows.map(row=>({...row,answers:JSON.parse(row.answers)})),total,page}});
}catch(e){next(e);}});
opinionsRoutes.get('/suggestions',async(req,res,next)=>{try{
 const query=z.object({page:pageSchema,search:z.string().max(200).optional(),category:z.enum(categories).optional(),status:z.enum(['PENDING','REVIEWED','RESOLVED']).optional()}).parse(req.query);
 const where={eventId:req.eventId!,...(query.search?{text:{contains:query.search}}:{}),...(query.category?{category:query.category}:{}),...(query.status?{status:query.status}:{})};
 const [rows,total]=await Promise.all([prisma.opinionSuggestion.findMany({where,orderBy:{createdAt:'desc'},skip:(query.page-1)*50,take:50}),prisma.opinionSuggestion.count({where})]);res.json({data:{rows,total,page:query.page}});
}catch(e){next(e);}});
opinionsRoutes.patch('/suggestions/:id',async(req,res,next)=>{try{
 const input=z.object({category:z.enum(categories),status:z.enum(['PENDING','REVIEWED','RESOLVED']),useful:z.boolean(),internalNotes:z.string().max(2000)}).strict().parse(req.body);
 await writeTransaction(async tx=>{
  const actor=await tx.user.findUnique({where:{id:req.user!.id}});
  if(!actor?.isActive||actor.accountStatus==='PENDING'||actor.scannerOnly||actor.assignedEventId&&actor.assignedEventId!==req.eventId||actor.role!=='ADMIN'&&!capabilitiesFor(actor).includes('OPINIONS_MANAGE'))throw new ForbiddenError('Se requiere autorización vigente.');
  const existing=await tx.opinionSuggestion.findFirst({where:{id:id.parse(req.params.id),eventId:req.eventId!}});if(!existing)throw new NotFoundError('Sugerencia no encontrada.');
  await tx.opinionSuggestion.update({where:{id:existing.id},data:input});
  await tx.auditLog.create({data:{userId:actor.id,entity:'EVENT',entityId:req.eventId!,action:'UPDATE',changes:JSON.stringify({operation:'SUGGESTION_REVIEW',suggestionId:existing.id,status:input.status,category:input.category,useful:input.useful})}});
 });res.json({message:'Revisión guardada.'});
}catch(e){next(e);}});
