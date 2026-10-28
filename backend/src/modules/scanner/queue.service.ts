import {verifiedCapOrder} from '../merch/official-order.js';
import {confirmationHash,CapDecision} from './queue-confirmation.js';
import { randomUUID, randomInt, randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { AuthUser } from '../../middleware/auth.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { ScannerService } from './scanner.service.js';
import { QrService } from '../qr/qr.service.js';
import { ForbiddenError, ConflictError, BadRequestError, AppError } from '../../utils/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { hasUserPermission } from '../../middleware/rbac.js';
import { assignedEdition } from '../../middleware/editionAccess.js';
import { queueTshirts, validateQueueSize, queueBlockReason } from './queue-tshirts.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import QRCode from 'qrcode';
import { PAIRING_PREFIX } from '../qr/qr-input.js';
import {ScanActivity} from './scan-activity.js';
import {paymentSummary,shirtDecision,ShirtDecision} from './reception-operations.js';
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
 static async station(user:AuthUser,eventId:string,label:string,mode:string,confirmed=false){
  await this.access(user,eventId,true);
  if(await prisma.queueDevice.findFirst({where:{sessionId:user.sessionId!,status:'LINKED',leaseUntil:{gt:new Date()}}}))throw new ConflictError('Desvincule este teléfono antes de gestionar una estación.');
  if(mode==='QUEUE'){
   const direct=await prisma.receptionStation.findUnique({where:{sessionId:user.sessionId!}});
   if(direct?.activeLinkId)throw new ConflictError('Desvincule el escáner directo antes de activar la cola.');
   if(direct)await ScannerService.disable(user,eventId);
  }
  const result=await writeTransaction(async tx=>{
   const previous=await tx.queueStation.findUnique({where:{sessionId:user.sessionId!}});
   if(previous?.mode==='QUEUE'&&(mode!=='QUEUE'||previous.eventId!==eventId)){
    const links=await tx.queueDevice.count({where:{stationId:previous.id,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}}});
    const claims=await tx.queueEntry.count({where:{claimedBySessionId:user.sessionId!,state:'CLAIMED',claimUntil:{gt:new Date()}}});
    if((links||claims)&&!confirmed)throw new ConflictError('Confirma el cambio: se desvincularán los escáneres de esta estación y se liberará su atención, sin borrar la cola.');
    await tx.queueDevice.updateMany({where:{stationId:previous.id,status:{in:['REQUESTED','APPROVED','LINKED']}},data:{status:'REVOKED',codeHash:null,codeCipher:null,activeSessionId:null}});
    await tx.queueEntry.updateMany({where:{claimedBySessionId:user.sessionId!,state:'CLAIMED'},data:{state:'WAITING',claimedBySessionId:null,claimedByUserId:null,claimUntil:null}});
   }
   return tx.queueStation.upsert({where:{sessionId:user.sessionId!},create:{eventId,userId:user.id,sessionId:user.sessionId!,label,mode,leaseUntil:lease()},update:{eventId,label,mode,leaseUntil:lease(),...(mode!=='QUEUE'?{inviteHash:null,inviteTokenHash:null,inviteCipher:null,inviteExpiresAt:null}:{})}});
  });this.hint(eventId);return result;
 }
 static async stations(user:AuthUser,eventId:string){
  await this.access(user,eventId);
  const rows=await prisma.queueStation.findMany({where:{eventId,mode:'QUEUE',leaseUntil:{gt:new Date()},sessionId:{not:user.sessionId}},select:{id:true,label:true,sessionId:true,userId:true}});
  const available=[];for(const row of rows){try{const s=await ScannerService.session(prisma,row.sessionId,row.userId),allowed=await assignedEdition(s.user);if(hasUserPermission(s.user,'RECEPTION_QUEUE_MANAGE')&&(!allowed||allowed===eventId))available.push({id:row.id,label:row.label});}catch{}}
  return available;
 }
 static async advertise(user:AuthUser,eventId:string,active:boolean){
  await this.access(user,eventId);
  await writeTransaction(tx=>tx.queuePairingPresence.upsert({where:{sessionId:user.sessionId!},create:{eventId,userId:user.id,sessionId:user.sessionId!,expiresAt:active?new Date(Date.now()+90000):new Date(0)},update:{eventId,expiresAt:active?new Date(Date.now()+90000):new Date(0)}}));this.hint(eventId);return {available:active};
 }
 static async invite(user:AuthUser,eventId:string){
  await this.access(user,eventId,true);
  const station=await prisma.queueStation.findUnique({where:{sessionId:user.sessionId!}});
  if(!station||station.eventId!==eventId||station.mode!=='QUEUE'||station.leaseUntil<=new Date())throw new ForbiddenError('Activa Recepción por cola en esta estación.');
  const code=randomBytes(4).toString('hex').toUpperCase(),token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+120000);
  const inviteHash=createHmac('sha256',ENV.JWT_SECRET).update('station:'+eventId+':'+code).digest('hex');
  const inviteTokenHash=createHash('sha256').update(token).digest('hex');
  const qrDataUrl=await QRCode.toDataURL(PAIRING_PREFIX+eventId+':'+token,{width:280,margin:2,errorCorrectionLevel:'M'});
  await writeTransaction(async tx=>{const active=await tx.queueStation.updateMany({where:{id:station.id,eventId,mode:'QUEUE',leaseUntil:{gt:new Date()}},data:{inviteHash,inviteTokenHash,inviteCipher:seal(code),inviteExpiresAt:expiresAt}});if(!active.count)throw new ConflictError('Estación desconectada.');});
  this.hint(eventId);return {code,expiresAt,label:station.label,qrDataUrl};
 }
 static async join(user:AuthUser,eventId:string,credential:string,deviceLabel?:string){
  await this.access(user,eventId);
  let credentialFilter:{inviteTokenHash:string}|{inviteHash:string};
  if(credential.startsWith(PAIRING_PREFIX)){
   const parts=credential.slice(PAIRING_PREFIX.length).split(':');
   if(parts.length!==2||parts[0]!==eventId||!/^[a-f0-9]{64}$/.test(parts[1]))throw new BadRequestError('QR de vinculación incorrecto o de otra edición.');
   credentialFilter={inviteTokenHash:createHash('sha256').update(parts[1]).digest('hex')};
  }else{
   if(!/^[a-fA-F0-9]{8,10}$/.test(credential.trim()))throw new BadRequestError('Utiliza un QR o código de vinculación de estación.');
   credentialFilter={inviteHash:createHmac('sha256',ENV.JWT_SECRET).update('station:'+eventId+':'+credential.trim().toUpperCase()).digest('hex')};
  }
  const station=await prisma.queueStation.findFirst({where:{eventId,mode:'QUEUE',...credentialFilter,inviteExpiresAt:{gt:new Date()},leaseUntil:{gt:new Date()}}});
  if(!station)throw new BadRequestError('Invitación incorrecta o vencida. Solicita un nuevo código a la estación.');
  await this.requestChecks(user,eventId,station.id);
  const result=await writeTransaction(async tx=>{
   const consumed=await tx.queueStation.updateMany({where:{id:station.id,eventId,mode:'QUEUE',...credentialFilter,inviteExpiresAt:{gt:new Date()},leaseUntil:{gt:new Date()}},data:{inviteHash:null,inviteTokenHash:null,inviteCipher:null,inviteExpiresAt:null}});
   if(!consumed.count)throw new ConflictError('La invitación venció o ya fue utilizada. Solicita otra a la PC.');
   const device=await this.createRequest(tx,user,eventId,station.id,true,deviceLabel);
   await tx.auditLog.create({data:{action:'UPDATE',entity:'USER',entityId:user.id,userId:user.id,changes:JSON.stringify({operation:'QUEUE_PAIRING_REQUEST',eventId,stationId:station.id,deviceId:device.id})}});
   return device;
  });this.hint(eventId);return result;
 }
 static async revokeInvite(user:AuthUser,eventId:string){
  await this.access(user,eventId,true);
  await writeTransaction(tx=>tx.queueStation.updateMany({where:{sessionId:user.sessionId!,eventId},data:{inviteHash:null,inviteTokenHash:null,inviteCipher:null,inviteExpiresAt:null}}));
  this.hint(eventId);return {revoked:true};
 }
 static async requestChecks(user:AuthUser,eventId:string,stationId:string){
  await this.access(user,eventId);if(!(await this.stations(user,eventId)).some(s=>s.id===stationId))throw new ForbiddenError('Estación no disponible.');
  if(await prisma.scannerLink.findFirst({where:{mobileSessionId:user.sessionId!,status:'LINKED',mobileLeaseUntil:{gt:new Date()}}}))throw new ConflictError('Desvincule el escáner directo primero.');
  if(await prisma.queueStation.findFirst({where:{sessionId:user.sessionId!,mode:'QUEUE',leaseUntil:{gt:new Date()}}}))throw new ConflictError('Cambie esta estación a Recepción directa antes de usarla como teléfono.');
 }
 static async request(user:AuthUser,eventId:string,stationId:string){
  await this.requestChecks(user,eventId,stationId);
  const result=await writeTransaction(tx=>this.createRequest(tx,user,eventId,stationId));this.hint(eventId);return result;
 }
 static async createRequest(tx:any,user:AuthUser,eventId:string,stationId:string,invitationVerified=false,deviceLabel?:string){
   await tx.queueDevice.updateMany({where:{sessionId:user.sessionId!,OR:[{status:{in:['REQUESTED','APPROVED']},expiresAt:{lte:new Date()}},{leaseUntil:{lte:new Date()}}]},data:{status:'EXPIRED',codeHash:null,codeCipher:null,activeSessionId:null}});
   const previous=await tx.queueDevice.findFirst({where:{sessionId:user.sessionId!,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}}});
   if(previous)throw new ConflictError('Desvincule o cancele la solicitud anterior primero.');
   const id=randomUUID(),code=String(randomInt(1000000)).padStart(6,'0');
   return tx.queueDevice.create({data:{id,eventId,stationId,invitationVerified,deviceLabel:deviceLabel?.slice(0,60),userId:user.id,activeSessionId:user.sessionId!,sessionId:user.sessionId!,codeHash:invitationVerified?null:hash(id,code),codeCipher:invitationVerified?null:seal(code),expiresAt:new Date(Date.now()+90000),leaseUntil:lease()},select:{id:true,status:true,expiresAt:true}});
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
  await writeTransaction(async tx=>{const changed=await tx.queueDevice.updateMany({where:{id,status:{in:['REQUESTED','APPROVED']},...(approve?{expiresAt:{gt:new Date()}}:{})},data:{status:approve?(device.invitationVerified?'LINKED':'APPROVED'):'REVOKED',...(!approve?{codeHash:null,codeCipher:null,activeSessionId:null}:device.invitationVerified?{codeHash:null,codeCipher:null,leaseUntil:lease()}:{})}});if(!changed.count)throw new ConflictError('La solicitud ya cambió o venció.');await tx.auditLog.create({data:{action:'UPDATE',entity:'USER',entityId:device.userId,userId:user.id,changes:JSON.stringify({operation:approve?'QUEUE_PAIRING_APPROVED':'QUEUE_PAIRING_REJECTED',eventId,deviceId:id,stationId:device.stationId})}});});this.hint(eventId);return {approved:approve};
 }
 static async confirm(user:AuthUser,eventId:string,id:string,code:string){
  const {device}=await this.device(user,eventId,id);
  if(device.invitationVerified&&device.status==='LINKED')return {status:'LINKED'};
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

  let station=await prisma.queueStation.findUnique({where:{sessionId:user.sessionId!}});
  if(station?.eventId!==eventId)station=null;
  if(station&&!current.scannerOnly)station=await writeTransaction(tx=>tx.queueStation.update({where:{id:station!.id},data:{leaseUntil:lease()}}));
  const devices=station&&!current.scannerOnly?await prisma.queueDevice.findMany({where:{stationId:station.id,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}},orderBy:{createdAt:'asc'}}):[];
  const pending=[];for(const d of devices){try{const session=await ScannerService.session(prisma,d.sessionId,d.userId);if(session.user.assignedEventId&&session.user.assignedEventId!==eventId)continue;pending.push({id:d.id,name:session.user.fullName,status:d.status,deviceLabel:d.deviceLabel,invitationVerified:d.invitationVerified,expiresAt:d.expiresAt,code:d.codeCipher&&d.expiresAt>new Date()?open(d.codeCipher):undefined});}catch{}}
  let own=await prisma.queueDevice.findFirst({where:{sessionId:user.sessionId!,eventId,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}},orderBy:{createdAt:'desc'}});
  let activeStation=null;
  if(own){const ownId=own.id;try{const checked=await this.device(user,eventId,ownId);activeStation={id:checked.station.id,label:checked.station.label};if(own.status!=='LINKED'&&own.expiresAt<new Date())own=null;else await writeTransaction(tx=>tx.queueDevice.update({where:{id:own!.id},data:{leaseUntil:lease()}}));}catch{const staleId=ownId;await writeTransaction(tx=>tx.queueDevice.updateMany({where:{id:staleId,status:{in:['REQUESTED','APPROVED','LINKED']}},data:{status:'REVOKED',activeSessionId:null,codeHash:null,codeCipher:null}}));own=null;}}
  const availableDevices=[];
  if(station?.mode==='QUEUE'&&!current.scannerOnly){
   const presences=await prisma.queuePairingPresence.findMany({where:{eventId,expiresAt:{gt:new Date()},sessionId:{not:user.sessionId}},take:200});
   const activeLinks=await prisma.queueDevice.findMany({where:{eventId,status:{in:['REQUESTED','APPROVED','LINKED']},leaseUntil:{gt:new Date()}}});
   for(const presence of presences){if(activeLinks.some(d=>d.sessionId===presence.sessionId))continue;try{const session=await ScannerService.session(prisma,presence.sessionId,presence.userId),allowed=await assignedEdition(session.user);if(!allowed||allowed===eventId)availableDevices.push({id:presence.id,name:session.user.fullName});}catch{}}
  }
  const lastDevice=!own?await prisma.queueDevice.findFirst({where:{eventId,sessionId:user.sessionId!,status:{in:['REVOKED','EXPIRED']}},orderBy:{createdAt:'desc'},select:{status:true}}):null;
  return {lastDeviceStatus:lastDevice?.status||null,enabled:Boolean(own||station?.mode==='QUEUE'),station:station?{id:station.id,label:station.label,mode:station.mode}:null,availableDevices,invitation:station?.mode==='QUEUE'&&station.inviteCipher&&station.inviteExpiresAt&&station.inviteExpiresAt>new Date()?{code:open(station.inviteCipher),expiresAt:station.inviteExpiresAt}:null,devices:pending,device:own?{id:own.id,status:own.status,invitationVerified:own.invitationVerified,expiresAt:own.expiresAt,station:activeStation}:null};
 }
 static async readAccess(user:AuthUser,eventId:string,deviceId?:string){
  await this.access(user,eventId);
  let stationId:string;
  if(deviceId){const {device,station}=await this.device(user,eventId,deviceId);if(device.status!=='LINKED'||device.leaseUntil<new Date())throw new AppError('Tu escáner ya no está vinculado',409,{code:'SCANNER_UNLINKED'});stationId=station.id;}
  else{await this.access(user,eventId,true);const station=await prisma.queueStation.findUnique({where:{sessionId:user.sessionId!}});if(!station||station.eventId!==eventId||station.mode!=='QUEUE')throw new ForbiddenError();stationId=station.id;}
  return stationId;
 }
 static async preview(user:AuthUser,eventId:string,token:string,deviceId?:string,requestKey?:string){
  await this.readAccess(user,eventId,deviceId);
  const qr=await QrService.validateAndScan(token,eventId);
  if(!qr.valid||!qr.canCheckIn||!qr.registration){if(requestKey)await writeTransaction(tx=>ScanActivity.record(tx,user,eventId,requestKey,'REJECTED',undefined,deviceId));return {status:'REJECTED',result:qr.status};}
  const existing=await prisma.queueEntry.findUnique({where:{eventId_registrationId:{eventId,registrationId:qr.registration.id}}});
  if(requestKey)await writeTransaction(tx=>ScanActivity.record(tx,user,eventId,requestKey,'VALID',qr.registration!.id,deviceId,false,Boolean(existing)));
  if(existing)return {status:'QUEUED',number:qr.registration.registrationNumber,result:'Esta entrada ya está en cola'};
  return {status:'VALID',category:qr.registration.participantCategory,name:qr.registration.participant.fullName,organization:qr.registration.participant.institution||null,number:qr.registration.registrationNumber,shirts:await queueTshirts(prisma,eventId,qr.registration),selectedTshirtSize:qr.registration.tshirtSize};
 }
 static async submit(user:AuthUser,eventId:string,token:string,deviceId?:string,selectedTshirtSize?:string,requestKey?:string){
  const stationId=await this.readAccess(user,eventId,deviceId);
  const qr=await QrService.validateAndScan(token,eventId);
  if(!qr.valid||!qr.canCheckIn||!qr.registration)return {status:'REJECTED',result:qr.status};
  const result=await writeTransaction(async tx=>{

   if(deviceId){
    const live=await tx.queueDevice.findFirst({where:{id:deviceId,eventId,sessionId:user.sessionId!,status:'LINKED',leaseUntil:{gt:new Date()}}});
    if(!live)throw new ForbiddenError('Vinculación revocada o vencida.');
   }
   const liveStation=await tx.queueStation.findFirst({where:{id:stationId,eventId,mode:'QUEUE',leaseUntil:{gt:new Date()}}});
   if(!liveStation)throw new ForbiddenError('Estación deshabilitada o desconectada.');
   const reg=await tx.registration.findUniqueOrThrow({where:{id:qr.registration!.id},include:{ticketType:true}});
   if(reg.eventId!==eventId)throw new ForbiddenError();
   if(reg.attended)return {status:'REJECTED',result:'ALREADY_CHECKED_IN'};
   if(reg.status==='CANCELLED')return {status:'REJECTED',result:'CANCELLED'};
   if(reg.qrCode!==qr.registration!.qrCode)return {status:'REJECTED',result:'REVOKED'};
   const previous=await tx.queueEntry.findUnique({where:{eventId_registrationId:{eventId,registrationId:reg.id}}});
   if(previous){if(requestKey)await ScanActivity.record(tx,user,eventId,requestKey,'VALID',reg.id,deviceId,false,true);return {status:'QUEUED',result:'Esta entrada ya está en cola',number:reg.registrationNumber};}
   const shirts=await queueTshirts(tx,eventId,reg);
   validateQueueSize(shirts,selectedTshirtSize);
   const id=randomUUID();
   const entry=await tx.queueEntry.upsert({where:{eventId_registrationId:{eventId,registrationId:reg.id}},create:{id,eventId,registrationId:reg.id,stationId,deviceId,selectedTshirtSize:selectedTshirtSize||null,validatedQrHash:createHash('sha256').update(reg.qrCode||'').digest('hex')},update:{lastScannedAt:new Date()}});
   if(requestKey)await ScanActivity.record(tx,user,eventId,requestKey,'VALID',reg.id,deviceId,entry.id===id,entry.id!==id);
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
   const registrations=await tx.registration.findMany({where:{id:{in:entries.map(e=>e.registrationId)},eventId},select:{id:true,registrationNumber:true,attended:true,status:true,tshirtSize:true,tshirtDelivered:true,participantCategory:true,tshirtDeliveryStatus:true,paymentStatus:true,isCourtesy:true,balanceDue:true,amountPaid:true,source:true,externalPlatform:true,payments:{select:{channel:true,paymentMethod:{select:{name:true}}}},ticketType:{select:{includesTshirt:true}},participant:{select:{fullName:true}}}});
   const settings=await tx.eventSettings.findUnique({where:{eventId},select:{tshirtSizesEnabled:true,allowOnsitePayments:true}});
   const stations=await tx.queueStation.findMany({where:{id:{in:[...new Set(entries.map(e=>e.stationId))]}},select:{id:true,label:true}});
   const rows=[];for(let e of entries){
    const reg=registrations.find(r=>r.id===e.registrationId);
   const state=!reg?'INCIDENT':reg.attended?'CONFIRMED':reg.status==='CANCELLED'?'REJECTED':e.state==='CLAIMED'&&(!e.claimUntil||e.claimUntil<=new Date())?'WAITING':e.state;
    if(e.state!==state)e=await tx.queueEntry.update({where:{id:e.id},data:{state,...(state==='WAITING'?{claimedBySessionId:null,claimedByUserId:null,claimUntil:null}:{})}});
    const station=stations.find(s=>s.id===e.stationId);rows.push({id:e.id,registrationId:e.registrationId,category:reg?.participantCategory,name:reg?.participant.fullName||'Entrada por revisar',number:reg?.registrationNumber||'Sin registro',scannedAt:e.firstScannedAt,state:e.state,station:station?.label||'Recepción',mine:e.claimedBySessionId===user.sessionId,selectedTshirtSize:reg?.attended||reg?.tshirtDelivered?reg.tshirtSize:e.selectedTshirtSize||reg?.tshirtSize,canCollect:Boolean(settings?.allowOnsitePayments&&reg&&!reg.isCourtesy&&!reg.externalPlatform&&reg.source!=='EXCEL_IMPORT'&&Number(reg.balanceDue)>0),payment:reg?paymentSummary(reg):null,tshirtDeliveryStatus:reg?.tshirtDelivered?'DELIVERED':reg?.tshirtDeliveryStatus||'PENDING',tshirtDelivered:reg?.tshirtDelivered||false,tshirtIncluded:Boolean(settings?.tshirtSizesEnabled&&reg?.ticketType?.includesTshirt!==false)});
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
 static async details(user:AuthUser,eventId:string,id:string){
  await this.access(user,eventId,true);
  const entry=await prisma.queueEntry.findFirst({where:{id,eventId}});if(!entry)throw new ForbiddenError();
  const reg=await prisma.registration.findUniqueOrThrow({where:{id:entry.registrationId},include:{ticketType:true,payments:{include:{paymentMethod:true}},participant:{select:{fullName:true}}}});
  if(reg.eventId!==eventId)throw new ForbiddenError();
  const pending=await prisma.courtesyRequest.findUnique({where:{pendingRegistrationId:reg.id}});
  const settings=await prisma.eventSettings.findUnique({where:{eventId}});
  const payment=paymentSummary(reg);
  const paymentMethods=settings?.allowOnsitePayments&&!payment.external&&!payment.isCourtesy?await prisma.paymentMethod.findMany({where:{eventId,isActive:true,OR:[{code:null},{code:{notIn:['COURTESY','SPONSOR']}}]}}):[];
  const revoked=reg.participantCategory==='SPEAKER'?await prisma.speaker.findFirst({where:{eventId,registrationId:reg.id,credentialRevokedAt:{not:null}}}):null;
  const canCollect=Boolean(settings?.allowOnsitePayments&&!payment.external&&!payment.isCourtesy&&payment.balanceDue>0&&reg.status!=='CANCELLED');
  let blockedReason=(revoked?'La credencial de charlista está revocada.':null)||queueBlockReason(reg,Boolean(pending),settings?.requirePaymentForEntry!==false)||(entry.validatedQrHash&&entry.validatedQrHash!==createHash('sha256').update(reg.qrCode||'').digest('hex')?'El QR fue revocado. Revisa la ficha completa.':null);
  if(blockedReason?.startsWith('Pago pendiente.'))blockedReason=canCollect?'Pago pendiente. Registra el pago para confirmar.':payment.external?'Saldo pendiente de conciliación externa.':'Pago pendiente. El cobro presencial no está habilitado.';
  const cap=await prisma.merchAllocation.findFirst({where:{eventId,recipientId:reg.id,kind:'PARTICIPANT',status:{in:['RESERVED','DELIVERED']},item:{systemCode:'OFFICIAL_CAP',isActive:true}},include:{item:true}});
  const verified=await verifiedCapOrder(prisma,eventId,reg.id,cap?.item.participantQuota??100);
  const capEligible=Boolean(cap&&verified.eligible&&!reg.isDemo);
  return {officialOrder:verified.order,cap:{eligible:capEligible,delivered:cap?.status==='DELIVERED',pendingVerification:verified.pending||verified.eligible&&!cap},category:reg.participantCategory,payment:{...payment,ticketPrice:Number(reg.ticketPrice)},paymentMethods,canCollect,registrationId:reg.id,name:reg.participant.fullName,number:reg.registrationNumber,canCheckIn:!blockedReason,blockedReason,selectedTshirtSize:entry.selectedTshirtSize||reg.tshirtSize,shirts:await queueTshirts(prisma,eventId,reg)};
 }
 static async complete(user:AuthUser,eventId:string,id:string,size?:string,delivered=false,decision?:ShirtDecision,capDecision?:CapDecision,requestKey?:string){
  const detail=await this.details(user,eventId,id);
  const requestHash=confirmationHash(size,delivered,decision,capDecision);
  const replay=async()=>{if(!requestKey)return null;const logs=await prisma.auditLog.findMany({where:{action:'ATTENDANCE_CHECKIN',entityId:detail.registrationId,userId:user.id},orderBy:{createdAt:'desc'},take:10});for(const log of logs){let change:any=log.changes;if(typeof change==='string'){try{change=JSON.parse(change);}catch{continue;}}if(change?.queueRequestKey===requestKey&&change.confirmationReceipt){if(change.queueRequestHash!==requestHash)throw new ConflictError('La confirmación ya se registró con otras decisiones. Consulta su resultado.');return {message:'Asistencia confirmada.',confirmationReceipt:change.confirmationReceipt,replayed:true};}}return null;};
  const previous=await replay();if(previous)return previous;
  if(!detail.canCheckIn)throw new BadRequestError(detail.blockedReason!);
  if(delivered){validateQueueSize(detail.shirts,size);if(!detail.shirts.enabled)throw new BadRequestError('Esta entrada no incluye camiseta.');}
  if(size)validateQueueSize(detail.shirts,size);
  if(decision){shirtDecision(decision,delivered);if((decision.decision==='DELIVER')!==delivered)throw new BadRequestError('La decisión de entrega no coincide con la operación.');}
  try{return await AttendanceService.checkIn(eventId,detail.registrationId,user.id,size,delivered,user.sessionId,id,decision,{capDecision,requestKey,requestHash});}catch(error){const completed=await replay();if(completed)return completed;throw error;}
 }
 static async stats(user:AuthUser,eventId:string){await this.access(user,eventId);return ScanActivity.stats(user.id,eventId,user.sessionId);}
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
