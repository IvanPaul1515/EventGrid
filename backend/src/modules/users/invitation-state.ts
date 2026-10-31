export type InvitationBlock={code:string;reason:string};
export function invitationBlocks(input:{domainConfigured:boolean;domainVerified:boolean;smtpEnabled:boolean;smtpConfigured:boolean;mailBlocked:boolean}):InvitationBlock[]{
 const blocks:InvitationBlock[]=[];
 if(!input.domainConfigured)blocks.push({code:'PUBLIC_DOMAIN_MISSING',reason:'Falta configurar el dominio público HTTPS. No se puede generar una invitación utilizable externamente.'});
 else if(!input.domainVerified)blocks.push({code:'PUBLIC_DOMAIN_UNVERIFIED',reason:'El dominio público HTTPS debe verificarse antes de enviar invitaciones.'});
 if(input.mailBlocked)blocks.push({code:'MAIL_BLOCKED',reason:'Los envíos reales están bloqueados por la configuración del entorno.'});
 if(!input.smtpEnabled)blocks.push({code:'SMTP_DISABLED',reason:'El proveedor de correo está desactivado.'});
 else if(!input.smtpConfigured)blocks.push({code:'SMTP_INCOMPLETE',reason:'La configuración SMTP está incompleta. No se intentó enviar.'});
 return blocks;
}
export function invitationDiagnostic(accountStatus:string,invitation:any,blocks:InvitationBlock[],latestAttempt?:any,now=new Date()){
 const tokenState=!invitation?.expiresAt?'NONE':invitation.usedAt?'USED':invitation.revokedAt?'REVOKED':new Date(invitation.expiresAt)<=now?'EXPIRED':'ACTIVE';
 const interrupted=invitation?.status==='PROCESSING'&&now.getTime()-new Date(invitation.createdAt).getTime()>120000;
 const deliveryState=interrupted?'UNKNOWN_DELIVERY_STATUS':invitation?.status||'PENDING';
 const state=accountStatus==='ACTIVE'?'ACTIVATED':tokenState==='EXPIRED'?'EXPIRED':deliveryState;
 return {state,deliveryState,tokenState,blocks,canSend:blocks.length===0,requiresDuplicateRiskConfirmation:deliveryState==='UNKNOWN_DELIVERY_STATUS',hasProviderReference:Boolean(invitation?.messageId),latestAttempt:latestAttempt?{status:latestAttempt.status,reason:latestAttempt.reason||null,at:latestAttempt.at,attempted:latestAttempt.attempted??null,...safeProviderDiagnostic({code:latestAttempt.errorCode,command:latestAttempt.stage,responseCode:latestAttempt.responseCode})}:null,
  explanation:interrupted?'El proceso anterior terminó sin registrar un resultado definitivo. Investiga antes de autorizar un reenvío.':deliveryState==='UNKNOWN_DELIVERY_STATUS'?'El intento anterior pudo ser aceptado. No se reenviará sin confirmar expresamente el riesgo de duplicado.':null};
}
export function providerAddress(value:any){return String(typeof value==='object'?value?.address||'':value||'').replace(/^.*<([^>]+)>$/,'$1').trim().toLowerCase();}
export function safeProviderDiagnostic(error:any){return {errorCode:/^[A-Z][A-Z0-9_]{1,31}$/.test(error?.code||'')?error.code:undefined,stage:['CONN','CONNECTION','AUTH','EHLO','STARTTLS','MAIL','RCPT','DATA','SOCKET'].includes(error?.command)?error.command:undefined,responseCode:Number.isInteger(error?.responseCode)&&error.responseCode>=100&&error.responseCode<600?error.responseCode:undefined};}
