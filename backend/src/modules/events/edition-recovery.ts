import {Prisma} from '@prisma/client';
import {InitializationError} from '../../utils/initializationError.js';

export function editionRecoveryPlan(snapshot:any) {
 const fail=()=>{throw new InitializationError('Edition recovery requires a verified configuration snapshot without registrations, deliveries or movements.');};
 const e=snapshot?.event,shirts=snapshot?.inventory?.items,merch=snapshot?.merch;
 if(!e?.id||!e.name||!Number.isInteger(e.year)||!e.settings||!Array.isArray(shirts)||!Array.isArray(merch)||!Array.isArray(snapshot.tickets)||snapshot.participants?.total!==0||e._count?.registrations!==0)fail();
 const ids=new Set<string>();
 for(const row of [...shirts,...merch,...snapshot.tickets]) {
  if(!row.id||ids.has(row.id)||row.eventId!==e.id)fail();ids.add(row.id);
 }
 for(const s of shirts)if(!Number.isInteger(s.initialQuantity)||s.initialQuantity<0||[s.deliveredQuantity,s.staffReservedQuantity,s.staffDeliveredQuantity].some(n=>n!==0))fail();
 for(const m of merch)if(!Number.isInteger(m.initialQuantity)||m.initialQuantity<0||!Number.isInteger(m.participantQuota)||!Number.isInteger(m.staffQuota)||m.participantQuota<0||m.staffQuota<0||m.participantQuota+m.staffQuota>m.initialQuantity||!Array.isArray(m.movements)||m.movements.length||!Array.isArray(m.allocations)||m.allocations.length)fail();
 if(e.settings.eventId!==e.id||snapshot.tickets.some((t:any)=>!Number.isFinite(Number(t.price))||Number(t.price)<0)||e.defaultTicketTypeId&&!snapshot.tickets.some((t:any)=>t.id===e.defaultTicketTypeId))fail();
 const scalar=(model:string,row:any)=>{
  const schema=Prisma.dmmf.datamodel.models.find(m=>m.name===model)!;
  const out:Record<string,any>={};
  for(const f of schema.fields.filter(f=>f.kind!=='object'))if(Object.hasOwn(row,f.name)) {
   const value=row[f.name];
   out[f.name]=value==null?value:f.type==='DateTime'?new Date(value):f.type==='String'&&typeof value!=='string'?JSON.stringify(value):value;
   if(out[f.name] instanceof Date&&!Number.isFinite(out[f.name].getTime()))fail();
  }
  return out;
 };
 return {event:scalar('Event',{...e,defaultTicketTypeId:null}),defaultTicketTypeId:e.defaultTicketTypeId,settings:scalar('EventSettings',{...e.settings,demoModeEnabled:false}),tickets:snapshot.tickets.map((r:any)=>scalar('TicketType',r)),shirts:shirts.map((r:any)=>scalar('TshirtInventory',r)),merch:merch.map((r:any)=>scalar('MerchItem',r)),paymentMethods:(e.paymentMethods||[]).map((r:any)=>scalar('PaymentMethod',r)),salesResponsibles:(e.salesResponsibles||[]).map((r:any)=>scalar('SalesResponsible',r)),customFields:(e.customFieldDefinitions||[]).map((r:any)=>scalar('CustomFieldDefinition',r))};
}

export async function recoverEmptyEdition(client:any,snapshot:any,actorId:string,digest:string) {
 const plan=editionRecoveryPlan(snapshot);
 if(!/^[a-f0-9]{64}$/.test(digest))throw new InitializationError('A verified source SHA-256 is required.');
 return client.$transaction(async(tx:any)=>{
  if(await tx.event.count()||await tx.registration.count()||await tx.tshirtInventory.count()||await tx.merchItem.count())throw new InitializationError('Target contains event data; recovery refuses to overwrite or duplicate it.');
  const actor=await tx.user.findFirst({where:{id:actorId,role:'ADMIN',isActive:true,scannerOnly:false,assignedEventId:null}});
  if(!actor)throw new InitializationError('Recovery requires an existing private administrator.');
  await tx.event.create({data:plan.event});
  await tx.eventSettings.create({data:plan.settings});
  for(const [model,rows]of [['ticketType',plan.tickets],['paymentMethod',plan.paymentMethods],['salesResponsible',plan.salesResponsibles],['customFieldDefinition',plan.customFields],['tshirtInventory',plan.shirts],['merchItem',plan.merch]] as const)for(const data of rows)await tx[model].create({data});
  if(plan.defaultTicketTypeId)await tx.event.update({where:{id:plan.event.id},data:{defaultTicketTypeId:plan.defaultTicketTypeId}});
  await tx.auditLog.create({data:{userId:actorId,action:'IMPORT',entity:'EVENT',entityId:plan.event.id,changes:JSON.stringify({operation:'VERIFIED_EDITION_CONFIGURATION_RECOVERY',sourceSha256:digest,scope:'configuration-and-unmoved-inventory',usersImported:0})}});
  return {eventId:plan.event.id,shirts:plan.shirts.length,merch:plan.merch.length};
 },{isolationLevel:'Serializable'});
}
