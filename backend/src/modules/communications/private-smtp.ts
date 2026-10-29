import {InitializationError} from '../../utils/initializationError.js';
import {z} from 'zod';
export function privateSmtpInput(env:Record<string,string|undefined>){
 const required=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM_EMAIL','SMTP_FROM_NAME','SMTP_SECURE'] as const;
 const missing=required.filter(key=>!env[key]?.trim());if(missing.length)return {ready:false as const,missing};
 const host=env.SMTP_HOST!.trim(),port=Number(env.SMTP_PORT),secure=env.SMTP_SECURE;
 if(!/^[a-z\d.-]+$/i.test(host)||!Number.isInteger(port)||port<1||port>65535||!['true','false'].includes(secure!))throw new InitializationError('SMTP_HOST, SMTP_PORT or SMTP_SECURE is invalid. Values were not logged.');
 if(!z.string().email().safeParse(env.SMTP_FROM_EMAIL).success||env.SMTP_REPLY_TO&&!z.string().email().safeParse(env.SMTP_REPLY_TO).success)throw new InitializationError('SMTP_FROM_EMAIL or SMTP_REPLY_TO is invalid.');
 return {ready:true as const,config:{host,port,secure:secure==='true',user:env.SMTP_USER!,password:env.SMTP_PASSWORD!,fromEmail:env.SMTP_FROM_EMAIL!,fromName:env.SMTP_FROM_NAME!,replyToEmail:env.SMTP_REPLY_TO||null,isEnabled:false}};
}
export const smtpSecurity=(secure:boolean)=>({requireTLS:!secure,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2' as const}});
/** Provision once from private runtime input, never enable a provider or process historical jobs. */
export async function initializePrivateSmtp(client:any,env:Record<string,string|undefined>,encrypt:(value:string)=>string|null){
 const existing=await client.emailConfig.findFirst({where:{eventId:null}});if(existing)return {status:'PRESERVED',missing:[] as string[]};
 const input=privateSmtpInput(env);if(!input.ready)return {status:'PENDING',missing:input.missing};
 const password=encrypt(input.config.password);if(!password)throw new InitializationError('Private SMTP encryption failed; no configuration was stored.');
 await client.$transaction(async(tx:any)=>{
  // Serialize bootstrap callers and preserve a configuration that was initialized concurrently.
  if(await tx.emailConfig.findFirst({where:{eventId:null}}))return;
  await tx.emailConfig.create({data:{...input.config,eventId:null,password}});
 },{isolationLevel:'Serializable'});
 return {status:'PREPARED_DISABLED',missing:[] as string[]};
}
