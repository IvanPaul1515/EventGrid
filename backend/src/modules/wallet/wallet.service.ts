import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { PKPass } from 'passkit-generator';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { QrService } from '../qr/qr.service.js';
import { recipientIneligibility } from '../communications/recipient-policy.js';
import { BadRequestError, ForbiddenError, NotFoundError, AppError } from '../../utils/errors.js';
import { assignedEdition } from '../../middleware/editionAccess.js';
import type { AuthUser } from '../../middleware/auth.js';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const localized = (value: string) => ({ defaultValue: { language: 'es', value } });
const roots = new Set(['B0B1730ECBC7FF4505142C49F1295E6EDA6BCAED7E2C68C5BE91B5A11001F024','C2B9B042DD57830E7D117DAC55AC8AE19407D38E41D88F3215BC3A890444A050','63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179']);
const decode = (name: string) => Buffer.from(process.env[name] || '', 'base64');
const validDate = (cert: X509Certificate) => Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now();
function publicBase() { try { const u = new URL(process.env.WALLET_PUBLIC_BASE_URL || ''); if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null; return u.href.replace(/\/$/,''); } catch { return null; } }
function logoPath(reg: any) {
  const value = reg.event.settings?.logoUrl; if (typeof value !== 'string' || !value.startsWith('/') || value.includes('..') || value.includes('\\')) return null;
  const root = value.startsWith('/uploads/') ? path.join(backend,'uploads') : path.join(backend,'../frontend/public');
  const file = path.resolve(root, value.startsWith('/uploads/') ? value.slice(9) : value.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).size > 2000000) return null;
  return file;
}
export class WalletService {
  private static cache = new Map<string,{ expires: number; value: any }>();
  static clearCache() { this.cache.clear(); }
  static async registration(id: string, user?: AuthUser) {
    const reg = await prisma.registration.findUnique({ where:{id}, include:{ participant:true, courtesyRequests:{select:{status:true}}, event:{include:{settings:true}} } });
    if (!reg) throw new NotFoundError('Entrada no disponible.');
    if (user) { const allowed = await assignedEdition(user); if (allowed && allowed !== reg.eventId) throw new ForbiddenError('Entrada fuera de su edición.'); }
    return reg;
  }
  static eligible(reg: any) { return Boolean(reg.qrCode && !recipientIneligibility(reg,'DIGITAL_TICKET')); }
  static assertEligible(reg: any) { if (!this.eligible(reg)) throw new ForbiddenError('Esta entrada no está autorizada para Wallet.'); }
  static ids(reg: any) { const issuer = process.env.GOOGLE_WALLET_ISSUER_ID || ''; return { serial:digest('eventgrid:'+reg.eventId+':'+reg.id), classId:issuer+'.eg_'+digest(reg.eventId).slice(0,32), objectId:issuer+'.eg_'+digest(reg.eventId+':'+reg.id+':'+digest(reg.qrCode||'')).slice(0,40) }; }
  static appleCredentials() {
    if (process.env.APPLE_WALLET_ENABLED !== 'true') return null;
    try {
      const signerCert=decode('APPLE_WALLET_CERT_PEM_BASE64'),wwdr=decode('APPLE_WALLET_WWDR_PEM_BASE64'),signerKey=decode('APPLE_WALLET_KEY_PEM_BASE64'),root=new X509Certificate(decode('APPLE_WALLET_ROOT_PEM_BASE64'));
      const certificate=new X509Certificate(signerCert),intermediate=new X509Certificate(wwdr);
      const type=process.env.APPLE_WALLET_PASS_TYPE_ID,team=process.env.APPLE_WALLET_TEAM_ID;
      const privateKey=createPrivateKey({key:signerKey,passphrase:process.env.APPLE_WALLET_KEY_PASSPHRASE});
      if (!type || !team || privateKey.asymmetricKeyType !== 'rsa' || !roots.has(root.fingerprint256.replace(/:/g,'')) || ![root,certificate,intermediate].every(validDate) || !intermediate.ca || !intermediate.verify(root.publicKey) || !certificate.checkIssued(intermediate) || !certificate.verify(intermediate.publicKey) || !certificate.subject.split('\n').includes('UID='+type) || !certificate.subject.split('\n').includes('OU='+team) || !createPublicKey(privateKey).export({format:'der',type:'spki'}).equals(certificate.publicKey.export({format:'der',type:'spki'}))) return null;
      return {signerCert,wwdr,signerKey,signerKeyPassphrase:process.env.APPLE_WALLET_KEY_PASSPHRASE};
    } catch { return null; }
  }
  static googleCredentials() {
    if (process.env.GOOGLE_WALLET_ENABLED !== 'true' || process.env.GOOGLE_WALLET_ISSUER_APPROVED !== 'true') return null;
    try {
      const email=process.env.GOOGLE_WALLET_CLIENT_EMAIL || '',issuer=process.env.GOOGLE_WALLET_ISSUER_ID || '',key=decode('GOOGLE_WALLET_KEY_PEM_BASE64').toString();
      const origins=(process.env.GOOGLE_WALLET_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
      if (!/^\d+$/.test(issuer) || !email.endsWith('.iam.gserviceaccount.com') || !origins.length || !origins.every(s=>{const u=new URL(s);return u.protocol==='https:'&&u.origin===s;}) || createPrivateKey(key).asymmetricKeyType!=='rsa') return null;
      return {email,issuer,key,origins};
    } catch { return null; }
  }
  static async googleToken() {
    const config=this.googleCredentials(); if (!config) throw new AppError('Google Wallet no está disponible.',503);
    const key='oauth:'+digest(config.key);const cached=this.cache.get(key);if(cached&&cached.expires>Date.now())return cached.value as string;
    const assertion=jwt.sign({scope:'https://www.googleapis.com/auth/wallet_object.issuer'},config.key,{algorithm:'RS256',issuer:config.email,audience:'https://oauth2.googleapis.com/token',expiresIn:300});
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new AppError('No se pudo verificar Google Wallet.',503);const value=await response.json() as any;
    if(typeof value.access_token!=='string')throw new AppError('Google Wallet no está disponible.',503);
    this.cache.set(key,{expires:Date.now()+Math.min(300,Number(value.expires_in)||300)*1000,value:value.access_token});return value.access_token as string;
  }
  static async googleReady(reg: any) {
    const config=this.googleCredentials();if(!config)return false;
    const classId=this.ids(reg).classId,key='class:'+classId+':'+digest(config.key),cached=this.cache.get(key);if(cached&&cached.expires>Date.now())return cached.value as boolean;
    try {const token=await this.googleToken();const response=await fetch('https://walletobjects.googleapis.com/walletobjects/v1/eventTicketClass/'+classId,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});const data=response.ok?await response.json() as any:null;const value=data?.id===classId&&data?.reviewStatus==='APPROVED';this.cache.set(key,{expires:Date.now()+60000,value});return value;}catch{return false;}
  }
  static async readiness(reg: any) { if(!publicBase()||!this.eligible(reg))return {apple:false,google:false};let apple=false;const logo=logoPath(reg);if(this.appleCredentials()&&logo){try{const meta=await sharp(logo,{limitInputPixels:16000000}).metadata();apple=Boolean(meta.width&&meta.height);}catch{}}return {apple,google:await this.googleReady(reg)}; }
  static capability(reg: any, expires=Date.now()+7*86400000) {
    this.assertEligible(reg);
    const key=createHmac('sha256',process.env.WALLET_LINK_SECRET || ENV.JWT_SECRET).update('eventgrid-wallet-access-v1').digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    const data=Buffer.from(JSON.stringify({purpose:'ticket-wallet',id:reg.id,eventId:reg.eventId,qr:digest(reg.qrCode),expires}));
    return Buffer.concat([iv,cipher.update(data),cipher.final(),cipher.getAuthTag()]).toString('base64url');
  }
  static async authorizeAccess(access: string) {
    try {
      if(!/^[a-zA-Z0-9_-]{50,1500}$/.test(access))throw Error();const b=Buffer.from(access,'base64url');
      const key=createHmac('sha256',process.env.WALLET_LINK_SECRET || ENV.JWT_SECRET).update('eventgrid-wallet-access-v1').digest(),decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(-16));
      const claims=JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString());
      if(claims.purpose!=='ticket-wallet'||!Number.isFinite(claims.expires)||claims.expires<Date.now())throw Error();
      const reg=await this.registration(claims.id);if(reg.eventId!==claims.eventId||digest(reg.qrCode||'')!==claims.qr)throw Error();this.assertEligible(reg);return reg;
    }catch{throw new ForbiddenError('El enlace de esta entrada no está disponible o ha vencido.');}
  }
  static appleData(reg: any) {
    this.assertEligible(reg);return {formatVersion:1,voided:Boolean(reg.attended),serialNumber:this.ids(reg).serial,passTypeIdentifier:process.env.APPLE_WALLET_PASS_TYPE_ID,teamIdentifier:process.env.APPLE_WALLET_TEAM_ID,organizationName:process.env.WALLET_ISSUER_NAME||'EventGrid',description:reg.event.name,logoText:reg.event.name,backgroundColor:this.rgb(reg.event.settings?.primaryColor||'#2563eb'),foregroundColor:this.foreground(reg.event.settings?.primaryColor),labelColor:this.foreground(reg.event.settings?.primaryColor),eventTicket:{headerFields:[{key:'state',label:'ESTADO AL GUARDAR',value:reg.attended?'Asistencia registrada':'Pendiente de check-in'}],primaryFields:[{key:'participant',label:'PARTICIPANTE',value:reg.participant.fullName}],secondaryFields:[{key:'event',label:'EVENTO',value:reg.event.name},{key:'number',label:'REGISTRO',value:reg.registrationNumber}],auxiliaryFields:[{key:'date',label:'FECHA',value:reg.event.startDate.toISOString(),dateStyle:'PKDateStyleMedium',timeStyle:'PKDateStyleShort'},{key:'venue',label:'LUGAR',value:reg.event.venue||'Consulta la ubicación con la organización'}],backFields:[{key:'instructions',label:'ACCESO',value:'Presenta este QR en la recepción del evento. EventGrid confirma la validez y la asistencia.'},{key:'updates',label:'ESTADO',value:'Este pase no recibe actualizaciones automáticas. La validez se comprueba en recepción.'}]},barcodes:[{format:'PKBarcodeFormatQR',message:QrService.payload(reg.qrCode),messageEncoding:'iso-8859-1',altText:reg.registrationNumber}]};
  }
  static foreground(hex: string) {const h=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#2563eb';const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return (r*299+g*587+b*114)/1000>150?'rgb(17, 24, 39)':'rgb(255, 255, 255)';}
  static rgb(hex: string) {const value=/^#[0-9a-f]{6}$/i.test(hex)?hex:'#2563eb';return 'rgb('+[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)).join(', ')+')';}
  static googleData(reg: any) {
    this.assertEligible(reg);const ids=this.ids(reg);return {id:ids.objectId,classId:ids.classId,state:reg.attended?'INACTIVE':'ACTIVE',ticketHolderName:reg.participant.fullName,ticketNumber:reg.registrationNumber,barcode:{type:'QR_CODE',value:QrService.payload(reg.qrCode),alternateText:reg.registrationNumber},hexBackgroundColor:reg.event.settings?.primaryColor||'#2563eb',validTimeInterval:{start:{date:reg.event.startDate.toISOString()},end:{date:reg.event.endDate.toISOString()}},textModulesData:[{id:'status',header:'Estado al guardar',body:reg.attended?'Asistencia registrada':'Pendiente de check-in'},{id:'reception',header:'Recepción',body:'Presenta este QR en la recepción del evento.'},{id:'updates',header:'Validez',body:'EventGrid confirma la validez y asistencia en recepción. Este pase no se actualiza automáticamente.'}]};
  }
  static googleClass(reg: any) {
    const base=publicBase();if(!base)throw new BadRequestError('Falta la URL pública de Wallet.');
    const logo=reg.event.settings?.logoUrl;const assetBase=process.env.WALLET_ASSET_BASE_URL;const image=logo?.startsWith('https://')?logo:logo?.startsWith('/uploads/')?new URL(logo,base).href:logo?.startsWith('/')&&assetBase?.startsWith('https://')?new URL(logo,assetBase).href:null;
    if(!image)throw new BadRequestError('Configure el logo oficial del evento.');
    return {id:this.ids(reg).classId,issuerName:process.env.WALLET_ISSUER_NAME||'EventGrid',reviewStatus:'DRAFT',eventName:localized(reg.event.name),logo:{sourceUri:{uri:image},contentDescription:localized(reg.event.name)},venue:{name:localized(reg.event.venue||'Ubicación por confirmar')},dateTime:{start:reg.event.startDate.toISOString(),end:reg.event.endDate.toISOString()}};
  }
  static async apple(reg: any) {
    const certificates=this.appleCredentials(),logo=logoPath(reg);if(!certificates||!logo)throw new AppError('Apple Wallet no está habilitado.',503);
    const icon=path.join(backend,'../frontend/public/pwa-192x192.png');
    const buffers={'icon.png':await sharp(icon).resize(29,29).png().toBuffer(),'icon@2x.png':await sharp(icon).resize(58,58).png().toBuffer(),'logo.png':await sharp(logo).resize(160,50,{fit:'inside'}).png().toBuffer(),'logo@2x.png':await sharp(logo).resize(320,100,{fit:'inside'}).png().toBuffer(),'pass.json':Buffer.from(JSON.stringify(this.appleData(reg)))};
    const pass=new PKPass(buffers,certificates);pass.setRelevantDate(reg.event.startDate);pass.setExpirationDate(reg.event.endDate);return pass.getAsBuffer();
  }
  static async google(reg: any) {
    if(!await this.googleReady(reg))throw new AppError('Google Wallet no está habilitado para esta edición.',503);
    const config=this.googleCredentials()!,token=await this.googleToken(),object=this.googleData(reg),url='https://walletobjects.googleapis.com/walletobjects/v1/eventTicketObject';
    const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    let response=await fetch(url+'/'+object.id,{method:'PATCH',headers,body:JSON.stringify(object),signal:AbortSignal.timeout(8000)});
    if(response.status===404)response=await fetch(url,{method:'POST',headers,body:JSON.stringify(object),signal:AbortSignal.timeout(8000)});
    if(response.status===409)response=await fetch(url+'/'+object.id,{method:'PATCH',headers,body:JSON.stringify(object),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new AppError('No se pudo preparar el pase de Google Wallet.',503);
    const signed=jwt.sign({iss:config.email,aud:'google',typ:'savetowallet',origins:config.origins,payload:{eventTicketObjects:[{id:object.id}]}},config.key,{algorithm:'RS256',expiresIn:900});
    return 'https://pay.google.com/gp/v/save/'+signed;
  }
  static async emailButtons(reg: any) {
    if(!reg?.id||!reg.qrCode)return '';const ready=await this.readiness(reg);if(!ready.apple&&!ready.google)return '';
    const access=this.capability(reg),base=publicBase()!;return `<p>${[ready.apple?'Apple Wallet':'',ready.google?'Google Wallet':''].filter(Boolean).map(name=>`<a style="display:inline-block;padding:12px 18px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;margin:4px" href="${escape(base+'/ticket#access='+access)}">Añadir a ${name}</a>`).join('')}</p>`;
  }
  static async page(reg: any, access: string) {
    const ready=await this.readiness(reg);const qr=await (await import('qrcode')).default.toDataURL(QrService.payload(reg.qrCode));
    const localLogo=logoPath(reg);let logoUrl='';if(localLogo){try{logoUrl='data:image/png;base64,'+(await sharp(localLogo,{limitInputPixels:16000000}).resize(240,80,{fit:'inside'}).png().toBuffer()).toString('base64');}catch{console.warn('Wallet: event logo could not be rendered.');}}
    const status=reg.attended?'Asistencia registrada':'Pendiente de check-in';const color=/^#[0-9a-f]{6}$/i.test(reg.event.settings?.primaryColor||'')?reg.event.settings.primaryColor:'#2563eb';
    const action=(provider:string,label:string)=>`<form method="post" action="${escape(publicBase()+'/'+provider)}"><input type="hidden" name="access" value="${escape(access)}"><button>${label}</button></form>`;
    return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrada · EventGrid</title><style>body{font:16px system-ui;background:#f3f4f6;color:#111827;margin:0;padding:20px}main{max-width:460px;margin:auto;background:white;border-radius:24px;padding:24px;border-top:8px solid ${color}}button{font:inherit;background:${color};color:white;border:0;border-radius:12px;padding:14px;width:100%;margin:6px 0}img{max-width:100%;display:block;margin:auto}</style><main>${logoUrl?`<img src="${escape(logoUrl)}" alt="${escape(reg.event.name)}" style="max-height:70px">`: ''}<h1>${escape(reg.event.name)}</h1><h2>${escape(reg.participant.fullName)}</h2><p>${escape(reg.registrationNumber)}</p><p>${escape(reg.event.startDate.toLocaleString('es-DO',{timeZone:'America/Santo_Domingo'}))} · ${escape(reg.event.venue||'Ubicación por confirmar')}</p><img src="${qr}" alt="QR de la entrada"><p>Presenta este QR en la recepción del evento.</p><p>Estado actual: ${status}</p>${ready.apple?action('apple','Añadir a Apple Wallet'):''}${ready.google?action('google','Añadir a Google Wallet'):''}<p>El backend confirma la validez y la asistencia. Los pases guardados no se actualizan automáticamente.</p></main></html>`;
  }
}
