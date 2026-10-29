import { prisma } from '../../config/db.js';
import { aggregateStatistics, inDates, REASONS, reasonFor, relevantRows, shirtHistory, shirtRows, type Reason, type StatisticsFilters } from './statistics.rules.js';

async function readEdition(eventId: string) {
  // A read transaction gives charts a consistent snapshot without changing allocations or counters.
  return prisma.$transaction(async tx => {
    const registrations = await tx.registration.findMany({where:{eventId},select:{
      id:true,eventId:true,status:true,paymentStatus:true,isCourtesy:true,ticketTypeId:true,ticketType:{select:{name:true}},
      ticketPrice:true,amountPaid:true,balanceDue:true,source:true,historicalDates:true,externalReference:true,createdAt:true,
      attended:true,attendedAt:true,qrRevokedAt:true,tshirtSize:true,tshirtDelivered:true,tshirtDeliveryStatus:true,tshirtNonDeliveryReason:true,
    }});
    const [inventory,audits,caps,ticketTypes,payments,stockAudits] = await Promise.all([
      tx.tshirtInventory.findMany({where:{eventId},orderBy:{createdAt:'asc'}}),
      tx.auditLog.findMany({where:{entityId:{in:registrations.map(r=>r.id)},entity:'REGISTRATION',action:'ATTENDANCE_CHECKIN'},select:{entityId:true,changes:true,createdAt:true},orderBy:{createdAt:'asc'}}),
      tx.merchItem.findMany({where:{eventId,systemCode:'OFFICIAL_CAP'},include:{movements:{where:{eventId}},allocations:{where:{eventId}}}}),
      tx.ticketType.findMany({where:{eventId},select:{id:true,name:true}}),
      tx.payment.findMany({where:{registration:{eventId}},select:{registrationId:true,amount:true,createdAt:true,paymentMethod:{select:{name:true}},externalMethod:true}}),
      tx.auditLog.findMany({where:{OR:[{entity:'EVENT',entityId:eventId},{entity:'TSHIRT_INVENTORY',entityId:{in:(await tx.tshirtInventory.findMany({where:{eventId},select:{id:true}})).map(r=>r.id)}}]},select:{action:true,entity:true,entityId:true,changes:true,createdAt:true},orderBy:{createdAt:'asc'}}),
    ]);
    return {registrations,inventory,audits,caps,ticketTypes,payments,stockAudits,settings:await tx.eventSettings.findUnique({where:{eventId},select:{timeZone:true}})};
  }, {maxWait:5000,timeout:20000});
}

/** Only expose an initial/inbound split when a complete audited quantity chain reaches today's capacity. */
export function stockProvenance(inventory:{id:string;size:string;initialQuantity:number}[], audits:{action:string;entity:string;entityId:string|null;changes:unknown}[]) {
  return inventory.map(item => {
    let original:number|null=null,current:number|null=null,additional=0,withdrawn=0,valid=true;
    for (const audit of audits) {
      let c:any; try { c=typeof audit.changes==='string'?JSON.parse(audit.changes):audit.changes; } catch { continue; }
      if(!c)continue;
      let before:number|undefined,after:number|undefined;
      if(audit.action==='TSHIRT_INVENTORY_INIT' && Array.isArray(c.sizes)) {
        const entry=c.sizes.find((r:any)=>r.size===item.size);if(entry && original===null)original=current=entry.quantity;
      } else if(audit.entityId===item.id && audit.action==='TSHIRT_INVENTORY_CREATE' && original===null)original=current=c.initialQuantity;
      else if(audit.entityId===item.id && audit.action==='TSHIRT_INVENTORY_UPDATE') {before=c.previous?.initialQuantity;after=c.current?.initialQuantity;}
      else if(c.module==='TSHIRT_INVENTORY' && c.operation==='IMPORTED_STOCK_MOVEMENT' && c.size===item.size) {before=c.before;after=c.after;}
      if(before!==undefined || after!==undefined) {
        if(!Number.isFinite(before)||!Number.isFinite(after)||current!==before) {valid=false;continue;}
        const delta=after!-before!;if(delta>0)additional+=delta;else withdrawn-=delta;current=after!;
      }
    }
    valid=valid && Number.isFinite(original) && current===item.initialQuantity;
    return {name:item.size,initial:valid?original:null,additional:valid?additional:null,withdrawn:valid?withdrawn:null,verified:valid};
  });
}

function safeTimezone(value?:string) {try {new Intl.DateTimeFormat('en',{timeZone:value}).format();return value||'America/Santo_Domingo';}catch{return 'America/Santo_Domingo';}}

export const StatisticsService = {
  async summary(eventId:string, filters:StatisticsFilters) {
    const data=await readEdition(eventId);
    filters={...filters,timezone:safeTimezone(data.settings?.timeZone)};
    const result=aggregateStatistics(eventId,data.registrations,data.inventory,data.audits,data.caps,filters);
    const ids=new Set(relevantRows(data.registrations,eventId,filters).map(r=>r.id));
    const methods=new Map<string,number>();let paymentTotal=0,paymentCount=0;
    for(const payment of data.payments) {
      if(!ids.has(payment.registrationId)||!inDates(payment.createdAt,filters))continue;
      const name=payment.paymentMethod?.name||payment.externalMethod||'Sin método registrado';
      paymentTotal+=Number(payment.amount);paymentCount++;methods.set(name,(methods.get(name)||0)+Number(payment.amount));
    }
    return {...result,ticketTypes:data.ticketTypes,shirtProvenance:stockProvenance(data.inventory,data.stockAudits),
      sales:{...result.sales,paymentTotal,paymentCount,methods:[...methods].map(([name,value])=>({name,value}))}};
  },
  async details(eventId:string, filters:StatisticsFilters, reason:Reason, page:number) {
    const data=await readEdition(eventId),history=shirtHistory(data.audits);
    filters={...filters,timezone:safeTimezone(data.settings?.timeZone)};
    const matching=shirtRows(relevantRows(data.registrations,eventId,filters),filters).filter(r=>!r.tshirtDelivered&&reasonFor(r)===reason)
      .sort((a,b)=>Number(b.attendedAt)-Number(a.attendedAt)||a.id.localeCompare(b.id));
    const selected=matching.slice((page-1)*25,page*25), ids=selected.map(r=>r.id);
    const names=await prisma.registration.findMany({where:{eventId,id:{in:ids}},select:{id:true,registrationNumber:true,participant:{select:{firstName:true,lastName:true}},attendedByUser:{select:{fullName:true}}}});
    const byId=new Map(names.map(r=>[r.id,r]));
    return {total:matching.length,page,limit:25,rows:selected.map(row=>({id:row.id,
      name:[byId.get(row.id)?.participant.firstName,byId.get(row.id)?.participant.lastName].filter(Boolean).join(' '),
      number:byId.get(row.id)?.registrationNumber,requested:history.get(row.id)?.requested||null,selected:row.tshirtSize,
      reason:REASONS[reason],attendedAt:row.attendedAt,operator:byId.get(row.id)?.attendedByUser?.fullName||null}))};
  },
};
