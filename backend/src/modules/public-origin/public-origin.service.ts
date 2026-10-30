import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {prisma} from '../../config/db.js';
import {BadRequestError,ForbiddenError} from '../../utils/errors.js';
import {publicOrigin,publicAddress,publicRoutePath,PublicRoute} from './public-origin.rules.js';
export class PublicOriginService {
 static settings(client:any=prisma){return client.applicationSettings.upsert({where:{id:'global'},create:{id:'global'},update:{}});}
 static async requireGlobal(actorId:string){const a=await prisma.user.findUnique({where:{id:actorId}});if(!a?.isActive||a.role!=='ADMIN'||a.scannerOnly||a.assignedEventId||a.accountStatus==='PENDING')throw new ForbiddenError('Solo el administrador global puede configurar el dominio público.');return a;}
 static async save(actorId:string,value:string){await this.requireGlobal(actorId);const origin=publicOrigin(value),old=await this.settings();if(old.publicOrigin===origin)return old;
  return prisma.$transaction(async tx=>{const result=await tx.applicationSettings.update({where:{id:'global'},data:{publicOrigin:origin,originStatus:'UNVERIFIED',originVerifiedAt:null,originCheckedAt:null}});await tx.auditLog.create({data:{userId:actorId,action:'SETTINGS_UPDATE',entity:'EVENT_SETTINGS',entityId:'global',changes:JSON.stringify({operation:'PUBLIC_ORIGIN_UPDATE',before:old.publicOrigin,after:origin,printedQrWarning:true})}});return result;});
 }
 static async link(route:PublicRoute,value:string,verified=true){const s=await this.settings();if(!s.publicOrigin||verified&&s.originStatus!=='VERIFIED')return null;return s.publicOrigin+publicRoutePath(route,value);}
 static async verify(actorId:string){await this.requireGlobal(actorId);const s=await this.settings();if(!s.publicOrigin)throw new BadRequestError('Configura primero el dominio público.');const origin=publicOrigin(s.publicOrigin);let valid=false;
  try{let dnsTimer:ReturnType<typeof setTimeout>|undefined;const addresses=await Promise.race([lookup(new URL(origin).hostname,{all:true}),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(Error('DNS timeout')),8000);})]).finally(()=>clearTimeout(dnsTimer));if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Unsafe address');
   const payload=await new Promise<string>((resolve,reject)=>{const first=addresses[0];let deadline:ReturnType<typeof setTimeout>|undefined;const req=https.get(new URL('/api/v1/public/instance',origin),{timeout:8000,minVersion:'TLSv1.2',rejectUnauthorized:true,lookup:((_h:any,options:any,cb:any)=>options?.all?cb(null,[first]):cb(null,first.address,first.family)) as any},res=>{if(res.statusCode!==200){res.resume();clearTimeout(deadline);reject(Error('Unexpected response'));return;}let body='';res.on('data',part=>{body+=part;if(body.length>8192)req.destroy(Error('Oversized response'));});res.on('end',()=>{clearTimeout(deadline);resolve(body);});});deadline=setTimeout(()=>req.destroy(Error('Timeout')),8000);req.on('timeout',()=>req.destroy(Error('Timeout')));req.on('close',()=>clearTimeout(deadline));req.on('error',e=>{clearTimeout(deadline);reject(e);});req.on('response',res=>res.on('end',()=>clearTimeout(deadline)));});valid=JSON.parse(payload).installationId===s.installationId;
  }catch{valid=false;}
  const result=await prisma.applicationSettings.updateMany({where:{id:'global',publicOrigin:origin},data:{originStatus:valid?'VERIFIED':'UNREACHABLE',originCheckedAt:new Date(),originVerifiedAt:valid?new Date():null}});if(!result.count)throw new BadRequestError('El dominio cambió durante la verificación.');
  await prisma.auditLog.create({data:{userId:actorId,action:'SETTINGS_UPDATE',entity:'EVENT_SETTINGS',entityId:'global',changes:JSON.stringify({operation:'PUBLIC_ORIGIN_VERIFY',origin,verified:valid})}});return {verified:valid,message:valid?'HTTPS y esta instalación verificados.':'No se verificó que el dominio dirija a esta instalación. Revisa DNS, HTTPS y proxy; guardar una URL no configura estos servicios.'};
 }
}
