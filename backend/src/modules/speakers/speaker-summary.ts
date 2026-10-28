import {prisma} from '../../config/db.js';
export async function speakerSummary(eventId:string,registrationId:string){
 const speaker=await prisma.speaker.findFirst({where:{eventId,registrationId},include:{talks:true}});if(!speaker)return null;
 const talks=await prisma.scheduleItem.findMany({where:{eventId,id:{in:speaker.talks.map(t=>t.scheduleItemId)}},select:{id:true,title:true,day:true,startTime:true,endTime:true,room:true}});
 const [registration,incident]=await Promise.all([prisma.registration.findFirst({where:{id:registrationId,eventId},select:{attended:true}}),prisma.receptionIncident.findFirst({where:{eventId,registrationId,status:{not:'RESOLVED'}},select:{id:true}})]);
 return {id:speaker.id,fullName:speaker.fullName,participationStatus:speaker.status,arrivalStatus:registration?.attended?'PRESENT':incident?'INCIDENT':'NOT_ARRIVED',credentialRevokedAt:speaker.credentialRevokedAt,talks};
}
