import {prisma} from '../../config/db.js';
import {eventDay} from './reception-operations.js';
import {BadRequestError} from '../../utils/errors.js';
export class ScanActivity {
 static async record(tx:any,user:{id:string;sessionId?:string},eventId:string,requestKey:string,outcome:string,registrationId?:string,deviceId?:string,submitted=false,duplicate=false){
  const settings=await tx.eventSettings.findUnique({where:{eventId},select:{timeZone:true}});
  const eventDayValue=eventDay(new Date(),settings?.timeZone||'America/Santo_Domingo');
  const identity={eventId,userId:user.id,requestKey};
  const existing=await tx.queueScanActivity.findUnique({where:{eventId_userId_requestKey:identity}});
  if(existing){if((existing.registrationId||null)!==(registrationId||null))throw new BadRequestError('El identificador de lectura ya fue utilizado.');if(existing.submitted)return existing;}
  return tx.queueScanActivity.upsert({where:{eventId_userId_requestKey:identity},create:{...identity,sessionId:user.sessionId!,eventDay:eventDayValue,outcome,registrationId,deviceId,submitted,duplicate},update:submitted?{submitted:true,outcome,registrationId}:duplicate?{duplicate:true}:{}});
 }
 static async stats(userId:string,eventId:string,sessionId?:string){
  const settings=await prisma.eventSettings.findUnique({where:{eventId},select:{timeZone:true}}),timeZone=settings?.timeZone||'America/Santo_Domingo';
  const today=eventDay(new Date(),timeZone),where={eventId,userId,eventDay:today};
  const [groups,total,confirmed]=await Promise.all([prisma.queueScanActivity.groupBy({by:['sessionId','outcome','submitted','duplicate'],where,_count:{id:true}}),prisma.queueScanActivity.count({where:{eventId,userId}}),prisma.queueScanActivity.count({where:{...where,submitted:true,registration:{attended:true}}})]);
  let reads=0,sent=0,rejected=0,repeated=0;
  for(const g of groups){reads+=g._count.id;if(g.submitted)sent+=g._count.id;if(g.outcome==='REJECTED')rejected+=g._count.id;if(g.duplicate)repeated+=g._count.id;}
  const sessionReads=groups.filter(g=>g.sessionId===sessionId).reduce((sum,g)=>sum+g._count.id,0);
  return {today,timeZone,reads,sent,rejected,repeated,sessionReads,confirmedByDesk:confirmed,total};
 }
}
