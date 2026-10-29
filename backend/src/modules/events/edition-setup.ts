import {z} from 'zod';
import {createHash} from 'node:crypto';
import {writeTransaction} from '../../utils/writeTransaction.js';
import {BadRequestError,ConflictError,ForbiddenError} from '../../utils/errors.js';
import {defaultQuestions} from '../opinions/opinions.rules.js';
const color=z.string().regex(/^#[a-f\d]{6}$/i),quantity=z.number().int().min(0).max(100000);
export const editionSetupSchema=z.object({
 id:z.string().uuid(),name:z.string().trim().min(3).max(150),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(100),year:z.number().int().min(2010).max(2100),
 startDate:z.string().datetime(),endDate:z.string().datetime(),venue:z.string().trim().min(2).max(200),status:z.enum(['PLANNING','ACTIVE']),
 appearance:z.object({primaryColor:color,secondaryColor:color,accentColor:color,backgroundColor:color,themeMode:z.enum(['dark','light','system']),timeZone:z.string().refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}),currencyCode:z.string().regex(/^[A-Z]{3}$/),currencySymbol:z.string().min(1).max(10),registrationPrefix:z.string().regex(/^[A-Za-z0-9-]{1,15}$/)}).strict(),
 ticket:z.object({name:z.string().trim().min(2).max(100),price:z.number().positive().max(99999999.99).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001),includesTshirt:z.boolean()}).strict(),
 shirts:z.array(z.object({size:z.string().trim().min(1).max(40),quantity})).max(30),
 caps:z.object({enabled:z.boolean(),quantity,participantQuota:quantity,staffQuota:quantity,criterion:z.enum(['OFFICIAL_REGISTRATION','OFFICIAL_PURCHASE'])}).strict(),
 surveyEnabled:z.boolean(),confirmed:z.literal(true),
}).strict().superRefine((value,ctx)=>{
 if(value.endDate<value.startDate)ctx.addIssue({code:'custom',path:['endDate'],message:'La fecha final debe ser posterior al inicio.'});
 if(new Set(value.shirts.map(s=>s.size.toLowerCase())).size!==value.shirts.length)ctx.addIssue({code:'custom',path:['shirts'],message:'Tallas repetidas.'});
 if(value.caps.participantQuota+value.caps.staffQuota>value.caps.quantity)ctx.addIssue({code:'custom',path:['caps'],message:'Los cupos no pueden superar la existencia física.'});
});
export async function setupEdition(raw:unknown,actorId:string){
 const input=editionSetupSchema.parse(raw);
 const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 try{return await writeTransaction(async tx=>{
  const actor=await tx.user.findUnique({where:{id:actorId}});
  if(!actor?.isActive||actor.role!=='ADMIN'||actor.scannerOnly||actor.assignedEventId||actor.accountStatus==='PENDING')throw new ForbiddenError('Se requiere un administrador global vigente.');
  const existing=await tx.event.findUnique({where:{id:input.id}});
  if(existing){
   const audits=await tx.auditLog.findMany({where:{entity:'EVENT',entityId:existing.id,action:'CREATE',userId:actorId},select:{changes:true}});
   const created=audits.some(a=>{try{const value=typeof a.changes==='string'?JSON.parse(a.changes):a.changes as any;return value?.operation==='EVENT_SETUP'&&value.requestHash===requestHash;}catch{return false;}});
   if(!created||existing.slug!==input.slug||existing.name!==input.name)throw new ConflictError('La confirmación ya corresponde a otra edición.');
   return existing; // Retry after an uncertain response never creates another event or overwrites configuration.
  }
  const event=await tx.event.create({data:{id:input.id,name:input.name,slug:input.slug,year:input.year,startDate:new Date(input.startDate),endDate:new Date(input.endDate),venue:input.venue,status:input.status,isDefault:false,
   settings:{create:{...input.appearance,tshirtSizesEnabled:input.ticket.includesTshirt,tshirtSizes:JSON.stringify(input.shirts.map(s=>s.size)),demoModeEnabled:false,allowOnsitePayments:false,subtitle:'Gestión de Eventos y Accesos'}}}});
  const ticket=await tx.ticketType.create({data:{eventId:event.id,...input.ticket}});
  await tx.event.update({where:{id:event.id},data:{defaultTicketTypeId:ticket.id}});
  for(const name of ['Efectivo','Transferencia','Tarjeta'])await tx.paymentMethod.create({data:{eventId:event.id,name}});
  for(const shirt of input.shirts)await tx.tshirtInventory.create({data:{eventId:event.id,size:shirt.size,initialQuantity:shirt.quantity}});
  if(input.shirts.length)await tx.auditLog.create({data:{userId:actorId,entity:'EVENT',entityId:event.id,action:'TSHIRT_INVENTORY_INIT',changes:JSON.stringify({sizes:input.shirts})}});
  if(input.caps.enabled)await tx.merchItem.create({data:{eventId:event.id,name:'Gorra',systemCode:'OFFICIAL_CAP',historyComplete:true,initialQuantity:input.caps.quantity,participantQuota:input.caps.participantQuota,staffQuota:input.caps.staffQuota,criterion:input.caps.criterion,eligibilityAt:new Date()}});
  await tx.opinionSurvey.create({data:{eventId:event.id,enabled:input.surveyEnabled,questions:JSON.stringify(defaultQuestions)}});
  await tx.auditLog.create({data:{userId:actorId,entity:'EVENT',entityId:event.id,action:'CREATE',changes:JSON.stringify({operation:'EVENT_SETUP',requestHash,ticketTypeId:ticket.id,surveyEnabled:input.surveyEnabled})}});
  return event;
 });}catch(error:any){if(error.code==='P2002')throw new BadRequestError('Ya existe una edición o catálogo con ese identificador. Revisa antes de volver a confirmar.');throw error;}
}
