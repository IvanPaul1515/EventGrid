import { randomUUID, randomInt, randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { AuthUser } from '../../middleware/auth.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { ScannerService } from './scanner.service.js';
import { QrService } from '../qr/qr.service.js';
import { ForbiddenError, ConflictError, BadRequestError } from '../../utils/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { hasUserPermission } from '../../middleware/rbac.js';
import { assignedEdition } from '../../middleware/editionAccess.js';
const key=()=>createHash('sha256').update('queue:'+ENV.JWT_SECRET).digest();
const hash=(id:string,code:string)=>createHmac('sha256',ENV.JWT_SECRET).update('queue:'+id+':'+code).digest('hex');
function seal(code:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,c.update(code),c.final(),c.getAuthTag()]).toString('base64');}
function open(value:string){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString();}
const lease=()=>new Date(Date.now()+10*60000), claimLease=()=>new Date(Date.now()+90000);

export class ReceptionQueueService {
 static async access(user:AuthUser,eventId:string,manager=false){
  await ScannerService.authorize(user,eventId);
  const session=await ScannerService.session(prisma,user.sessionId!,user.id);
  if(!hasUserPermission(session.user,manager?'RECEPTION_QUEUE_MANAGE':'RECEPTION_QUEUE_SCAN'))throw new ForbiddenError('Este perfil solo puede escanear para una cola autorizada.');
  return session.user;
 }
 static hint(eventId:string){RealtimeService.queueChanged(eventId);}
 static async configure(user:AuthUser,eventId:string,enabled:boolean){
  const current=await this.access(user,eventId,true);if(current.role!=='ADMIN')throw new ForbiddenError();
  const result=await writeTransaction(async tx=>{const policy=await tx.receptionQueue.upsert({where:{eventId},create:{eventId,enabled},update:{enabled}});if(!enabled)await tx.queueDevice.updateMany({where:{eventId,status:{in:['REQUESTED','APPROVED','LINKED']}},data:{status:'REVOKED',activeSessionId:null,codeHash:null,codeCipher:null}});return policy;});this.hint(eventId);return result;
 }
 static async station(user:AuthUser,eventId:string,label:string,mode:string){
  await this.access(user,eventId,true);
  if(await prisma.queueDevice.findFirst({where:{sessionId:user.sessionId!,status:'LINKED',leaseUntil:{gt:new Date()}}}))throw new ConflictError('Desvincule este teléfono antes de gestionar una estación.');
  if(mode==='QUEUE'&&!(await prisma.receptionQueue.findUnique({where:{eventId}}))?.enabled)throw new ConflictError('Un administrador debe habilitar la cola de esta edición.');
  if(mode==='QUEUE'){
   const direct=await prisma.receptionStation.findUnique({where:{sessionId:user.sessionId!}});
   if(direct?.activeLinkId)throw new ConflictError('Desvincule el escáner directo antes de activar la cola.');
   if(direct)await ScannerService.disable(user,eventId);
  }
  const result=await writeTransaction(tx=>tx.queueStation.upsert({where:{sessionId:user.sessionId!},create:{eventId,userId:user.id,sessionId:user.sessionId!,label,mode,leaseUntil:lease()},update:{eventId,label,mode,leaseUntil:lease()}}));
  if(mode!=='QUEUE')await writeTransaction(tx=>tx.queueDevice.updateMany({where:{stationId:result.id,status:{in:['REQUESTED','APPROVED','LINKED']}},data:{status:'REVOKED',codeHash:null,codeCipher:null,activeSessionId:null}}));
  this.hint(eventId);return result;
 }
 static async stations(user:AuthUser,eventId:string){
  await this.access(user,eventId);if(!(await prisma.receptionQueue.findUnique({where:{eventId}}))?.enabled)return [];
  const rows=await prisma.queueStation.findMany({where:{eventId,mode:'QUEUE',leaseUntil:{gt:new Date()},sessionId:{not:user.sessionId}},select:{id:true,label:true,sessionId:true,userId:true}});
  const available=[];for(const row of rows){try{const s=await ScannerService.session(prisma,row.sessionId,row.userId),allowed=await assignedEdition(s.user);if(hasUserPermission(s.user,'RECEPTION_QUEUE_MANAGE')&&(!allowed||allowed===eventId))available.push({id:row.id,label:row.label});}catch{}}
  return available;
 }
 static async request(user:AuthUser,eventId:string,stationId:string){
  await this.access(user,eventId);if(!(await this.stations(user,eventId)).some(s=>s.id===stationId))throw new ForbiddenError('Estación no disponible.');
  if(await prisma.scannerLink.findFirst({where:{mobileSessionId:user.sessionId!,status:'LINKED',mobileLeaseUntil:{gt:new Date()}}}))throw new ConflictError('Desvincule el escáner directo primero.');
  if(await prisma.queueStation.findFirst({where:{sessionId:user.sessionId!,mode:'QUEUE',leaseUntil:{gt:new Date()}}}))throw new ConflictError('Cambie esta estación a Recepción directa antes de usarla como teléfono.');
  const result=await writeTransaction(async tx=>{
   await tx.queueDevice.updateMany({where:{sessionId:user.sessionId!,OR:[{status:{in:['REQUESTED','APPROVED']},expiresAt:{lte:new Date()}},{leaseUntil:{lte:new Date()}}]},data:{status:'EXPIRED',codeHash:null,codeCipher:null,activeSessionId:null}});
   const previous=await tx.queueDevice.findFirst({where:{sessionId:user.sessionId!,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}}});
   if(previous)throw new ConflictError('Desvincule o cancele la solicitud anterior primero.');
   const id=randomUUID(),code=String(randomInt(1000000)).padStart(6,'0');
   return tx.queueDevice.create({data:{id,eventId,stationId,userId:user.id,activeSessionId:user.sessionId!,sessionId:user.sessionId!,codeHash:hash(id,code),codeCipher:seal(code),expiresAt:new Date(Date.now()+90000),leaseUntil:lease()},select:{id:true,status:true,expiresAt:true}});
  });this.hint(eventId);return result;
 }
 static async device(user:AuthUser,eventId:string,id:string,owner=false){
  await this.access(user,eventId,owner);
  const device=await prisma.queueDevice.findUnique({where:{id}}),station=device?await prisma.queueStation.findUnique({where:{id:device.stationId}}):null;
  if(!device||!station||device.eventId!==eventId||station.eventId!==eventId||(!owner&&device.sessionId!==user.sessionId)||owner&&station.sessionId!==user.sessionId)throw new ForbiddenError();
  const responsible=await ScannerService.session(prisma,station.sessionId,station.userId);
  const mobile=await ScannerService.session(prisma,device.sessionId,device.userId);
  const responsibleEdition=await assignedEdition(responsible.user),mobileEdition=await assignedEdition(mobile.user);
  if(!hasUserPermission(responsible.user,'RECEPTION_QUEUE_MANAGE')||responsibleEdition&&responsibleEdition!==eventId||mobileEdition&&mobileEdition!==eventId)throw new ForbiddenError('Autorización de estación o edición revocada.');
  if(station.leaseUntil<=new Date()||station.mode!=='QUEUE')throw new ConflictError('Estación desconectada.');
  return {device,station};
 }
 static async decide(user:AuthUser,eventId:string,id:string,approve:boolean){
  const {device}=await this.device(user,eventId,id,true);
  if(approve&&(device.status!=='REQUESTED'||device.expiresAt<new Date()))throw new ConflictError('Solicitud vencida.');
  await writeTransaction(tx=>tx.queueDevice.update({where:{id},data:{status:approve?'APPROVED':'REVOKED',...(!approve?{codeHash:null,codeCipher:null,activeSessionId:null}:{})}}));this.hint(eventId);return {approved:approve};
 }
 static async confirm(user:AuthUser,eventId:string,id:string,code:string){
  await this.device(user,eventId,id);
  const valid=await writeTransaction(async tx=>{
   const d=await tx.queueDevice.findUniqueOrThrow({where:{id}});
   if(d.status!=='APPROVED'||d.expiresAt<new Date()||!d.codeHash||d.attempts>=5)return false;
   const valid=timingSafeEqual(Buffer.from(d.codeHash,'hex'),Buffer.from(hash(id,code),'hex'));
   await tx.queueDevice.update({where:{id},data:valid?{status:'LINKED',codeHash:null,codeCipher:null,leaseUntil:lease()}:{attempts:{increment:1},...(d.attempts===4?{status:'REVOKED',codeHash:null,codeCipher:null,activeSessionId:null}:{})}});return valid;
  });this.hint(eventId);if(!valid)throw new BadRequestError('Código incorrecto, vencido o sin autorización.');return {status:'LINKED'};
 }
 static async unlink(user:AuthUser,eventId:string,id:string){
  await this.access(user,eventId);
  const d=await prisma.queueDevice.findUnique({where:{id}}),s=d?await prisma.queueStation.findUnique({where:{id:d.stationId}}):null;
  if(!d||!s||d.eventId!==eventId||!(d.sessionId===user.sessionId||s.sessionId===user.sessionId&&!user.scannerOnly))throw new ForbiddenError();
  await writeTransaction(tx=>tx.queueDevice.update({where:{id},data:{status:'REVOKED',codeHash:null,codeCipher:null,activeSessionId:null}}));this.hint(eventId);return {status:'REVOKED'};
 }
 static async state(user:AuthUser,eventId:string){
  const current=await this.access(user,eventId);
  await writeTransaction(tx=>tx.queueDevice.updateMany({where:{eventId,status:{in:['REQUESTED','APPROVED']},expiresAt:{lte:new Date()}},data:{status:'EXPIRED',codeHash:null,codeCipher:null,activeSessionId:null}}));
  const policy=await prisma.receptionQueue.findUnique({where:{eventId}});
  let station=await prisma.queueStation.findUnique({where:{sessionId:user.sessionId!}});
  if(station?.eventId!==eventId)station=null;
  if(station&&!current.scannerOnly)station=await writeTransaction(tx=>tx.queueStation.update({where:{id:station!.id},data:{leaseUntil:lease()}}));
  const devices=station&&!current.scannerOnly?await prisma.queueDevice.findMany({where:{stationId:station.id,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}},orderBy:{createdAt:'asc'}}):[];
  const pending=[];for(const d of devices){try{const session=await ScannerService.session(prisma,d.sessionId,d.userId);if(session.user.assignedEventId&&session.user.assignedEventId!==eventId)continue;pending.push({id:d.id,name:session.user.fullName,status:d.status,expiresAt:d.expiresAt,code:d.codeCipher&&d.expiresAt>new Date()?open(d.codeCipher):undefined});}catch{}}
  let own=await prisma.queueDevice.findFirst({where:{sessionId:user.sessionId!,eventId,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}},orderBy:{createdAt:'desc'}});
  let activeStation=null;
  if(own){const ownId=own.id;try{const checked=await this.device(user,eventId,ownId);activeStation={id:checked.station.id,label:checked.station.label};if(own.status!=='LINKED'&&own.expiresAt<new Date())own=null;else await writeTransaction(tx=>tx.queueDevice.update({where:{id:own!.id},data:{leaseUntil:lease()}}));}catch{const staleId=ownId;await writeTransaction(tx=>tx.queueDevice.updateMany({where:{id:staleId,status:{in:['REQUESTED','APPROVED','LINKED']}},data:{status:'REVOKED',activeSessionId:null,codeHash:null,codeCipher:null}}));own=null;}}
  return {enabled:policy?.enabled||false,station:station?{id:station.id,label:station.label,mode:station.mode}:null,devices:pending,device:own?{id:own.id,status:own.status,expiresAt:own.expiresAt,station:activeStation}:null};
 }
 static async submit(user:AuthUser,eventId:string,token:string,deviceId?:string){
  await this.access(user,eventId);
  if(!(await prisma.receptionQueue.findUnique({where:{eventId}}))?.enabled)throw new ConflictError('Cola deshabilitada.');
  let stationId:string;
  if(deviceId){const {device,station}=await this.device(user,eventId,deviceId);if(device.status!=='LINKED'||device.leaseUntil<new Date())throw new ForbiddenError();stationId=station.id;}
  else{await this.access(user,eventId,true);const station=await prisma.queueStation.findUnique({where:{sessionId:user.sessionId!}});if(!station||station.eventId!==eventId||station.mode!=='QUEUE')throw new ForbiddenError();stationId=station.id;}
  const qr=await QrService.validateAndScan(token,eventId);
  if(!qr.valid||!qr.canCheckIn||!qr.registration)return {status:'REJECTED',result:qr.status};
  const result=await writeTransaction(async tx=>{
   if(!(await tx.receptionQueue.findUnique({where:{eventId}}))?.enabled)throw new ConflictError('Cola deshabilitada.');
   if(deviceId){
    const live=await tx.queueDevice.findFirst({where:{id:deviceId,eventId,sessionId:user.sessionId!,status:'LINKED',leaseUntil:{gt:new Date()}}});
    if(!live)throw new ForbiddenError('Vinculación revocada o vencida.');
   }
   const liveStation=await tx.queueStation.findFirst({where:{id:stationId,eventId,mode:'QUEUE',leaseUntil:{gt:new Date()}}});
   if(!liveStation)throw new ForbiddenError('Estación deshabilitada o desconectada.');
   const reg=await tx.registration.findUniqueOrThrow({where:{id:qr.registration!.id}});
   if(reg.eventId!==eventId)throw new ForbiddenError();
   if(reg.attended)return {status:'REJECTED',result:'ALREADY_CHECKED_IN'};
   if(reg.status==='CANCELLED')return {status:'REJECTED',result:'CANCELLED'};
   if(reg.qrCode!==qr.registration!.qrCode)return {status:'REJECTED',result:'REVOKED'};
   const id=randomUUID();
   const entry=await tx.queueEntry.upsert({where:{eventId_registrationId:{eventId,registrationId:reg.id}},create:{id,eventId,registrationId:reg.id,stationId,deviceId},update:{lastScannedAt:new Date()}});
   return {status:'QUEUED',result:entry.id===id?'Entrada validada':'Esta entrada ya está en cola',number:reg.registrationNumber};
  });this.hint(eventId);return result;
 }
 static async list(user:AuthUser,eventId:string){
  await this.access(user,eventId,true);
  // Reconcile with the authoritative registration, including traditional check-ins.
  return writeTransaction(async tx=>{
   const active=await tx.queueEntry.findMany({where:{eventId,state:{in:['WAITING','CLAIMED','INCIDENT']}},orderBy:{firstScannedAt:'asc'},take:1000});
   const recent=await tx.queueEntry.findMany({where:{eventId,state:{in:['CONFIRMED','REJECTED']}},orderBy:{lastScannedAt:'desc'},take:20});
   const entries=[...active,...recent];
   const registrations=await tx.registration.findMany({where:{id:{in:entries.map(e=>e.registrationId)},eventId},select:{id:true,registrationNumber:true,attended:true,status:true,participant:{select:{fullName:true}}}});
   const stations=await tx.queueStation.findMany({where:{id:{in:[...new Set(entries.map(e=>e.stationId))]}},select:{id:true,label:true}});
   const rows=[];for(let e of entries){
    const reg=registrations.find(r=>r.id===e.registrationId);
   const state=!reg?'INCIDENT':reg.attended?'CONFIRMED':reg.status==='CANCELLED'?'REJECTED':e.state==='CLAIMED'&&(!e.claimUntil||e.claimUntil<=new Date())?'WAITING':e.state;
    if(e.state!==state)e=await tx.queueEntry.update({where:{id:e.id},data:{state,...(state==='WAITING'?{claimedBySessionId:null,claimedByUserId:null,claimUntil:null}:{})}});
    const station=stations.find(s=>s.id===e.stationId);rows.push({id:e.id,registrationId:e.registrationId,name:reg?.participant.fullName||'Entrada por revisar',number:reg?.registrationNumber||'Sin registro',scannedAt:e.firstScannedAt,state:e.state,station:station?.label||'Recepción',mine:e.claimedBySessionId===user.sessionId});
   }return rows;
  });
 }
 static async claim(user:AuthUser,eventId:string,id:string,release=false){
  await this.access(user,eventId,true);
  const result=await writeTransaction(async tx=>{
   const entry=await tx.queueEntry.findFirst({where:{id,eventId}});if(!entry)throw new ForbiddenError();
   const reg=await tx.registration.findUniqueOrThrow({where:{id:entry.registrationId}});if(reg.attended||reg.status==='CANCELLED')throw new ConflictError('La entrada ya fue registrada o cancelada.');
   const until=claimLease();const updated=await tx.queueEntry.updateMany({where:{id,eventId,...(release?{state:'CLAIMED',claimedBySessionId:user.sessionId}:{OR:[{state:{in:['WAITING','INCIDENT']}},{state:'CLAIMED',claimUntil:{lte:new Date()}},{state:'CLAIMED',claimedBySessionId:user.sessionId}]})},data:release?{state:'WAITING',claimedBySessionId:null,claimedByUserId:null,claimUntil:null}:{state:'CLAIMED',claimedBySessionId:user.sessionId,claimedByUserId:user.id,claimUntil:until}});
   if(!updated.count)throw new ConflictError('Este participante está siendo atendido en otra estación.');
   return {registrationId:reg.id,claimUntil:release?null:until};
  });this.hint(eventId);return result;
 }
 static async incident(user:AuthUser,eventId:string,id:string,reason:string){
  await this.access(user,eventId,true);
  await writeTransaction(async tx=>{
   const entry=await tx.queueEntry.findFirst({where:{id,eventId}});if(!entry)throw new ForbiddenError();
   const updated=await tx.queueEntry.updateMany({where:{id,eventId,OR:[{state:{in:['WAITING','INCIDENT']}},{state:'CLAIMED',claimedBySessionId:user.sessionId},{state:'CLAIMED',claimUntil:{lte:new Date()}}]},data:{state:'INCIDENT',claimedBySessionId:null,claimedByUserId:null,claimUntil:null}});
   if(!updated.count)throw new ConflictError('La entrada cambió o está en atención en otra estación.');
   const changes={queueEntryId:id,reason,operation:'RECEPTION_INCIDENT'};
   await tx.auditLog.create({data:{action:'UPDATE',entity:'REGISTRATION',entityId:entry.registrationId,userId:user.id,changes:(ENV.DATABASE_URL?.startsWith('file:')?JSON.stringify(changes):changes) as any}});
  });this.hint(eventId);return {state:'INCIDENT'};
 }
}
