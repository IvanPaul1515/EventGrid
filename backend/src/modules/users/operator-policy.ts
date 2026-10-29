import {ForbiddenError} from '../../utils/errors.js';

export const OPERATOR_CAPABILITIES = {
 REGISTRATION_CREATE:'Registrar participantes', REGISTRATION_EDIT:'Editar participantes', CHECK_IN:'Confirmar check-in',
 QUEUE_MANAGE:'Gestionar cola y estaciones', PAYMENT_REGISTER:'Registrar pagos', SALE_REGISTER:'Registrar ventas',
 SHIRT_DELIVER:'Entregar camisetas', CAP_DELIVER:'Entregar gorras', IMPORT_MANAGE:'Gestionar importaciones',
 SPEAKERS_MANAGE:'Gestionar charlistas', REPORTS_READ:'Consultar reportes', EXPORT:'Exportar información',
 INCIDENTS_MANAGE:'Gestionar incidencias', OPINIONS_READ:'Consultar opiniones', OPINIONS_MANAGE:'Revisar sugerencias',
} as const;
export type OperatorCapability=keyof typeof OPERATOR_CAPABILITIES;
const operational=(Object.keys(OPERATOR_CAPABILITIES) as OperatorCapability[]).filter(c=>!c.startsWith('OPINIONS_'));
export const OPERATOR_PROFILES={
 FULL:{label:'Operador completo',capabilities:operational},
 RECEPTION:{label:'Solo recepción',capabilities:['CHECK_IN','QUEUE_MANAGE','SHIRT_DELIVER','CAP_DELIVER','INCIDENTS_MANAGE'] as OperatorCapability[]},
 REGISTRATION:{label:'Registro de participantes',capabilities:['REGISTRATION_CREATE','REGISTRATION_EDIT'] as OperatorCapability[]},
 DELIVERIES:{label:'Control de entregas',capabilities:['SHIRT_DELIVER','CAP_DELIVER'] as OperatorCapability[]},
 FINANCE:{label:'Operaciones financieras',capabilities:['PAYMENT_REGISTER','SALE_REGISTER','REPORTS_READ','EXPORT'] as OperatorCapability[]},
} as const;
export type CapabilityUser={role:string;scannerOnly?:boolean;operationalPermissions?:string|null};
export function capabilitiesFor(user:CapabilityUser):OperatorCapability[] {
 if(user.scannerOnly)return [];
 if(user.role==='ADMIN')return Object.keys(OPERATOR_CAPABILITIES) as OperatorCapability[];
 if(user.role==='VIEWER')return ['REPORTS_READ','EXPORT'];
 if(user.role!=='OPERATOR')return [];
 if(user.operationalPermissions==null)return [...operational]; // Existing accounts keep their existing role guards.
 try {const data=JSON.parse(user.operationalPermissions);return Array.isArray(data)&&data.every(c=>typeof c==='string'&&Object.prototype.hasOwnProperty.call(OPERATOR_CAPABILITIES,c))?[...new Set(data)] as OperatorCapability[]:[];}catch{return [];}
}
export function serializeCapabilities(role:string,scannerOnly:boolean,profile:keyof typeof OPERATOR_PROFILES='RECEPTION',custom?:OperatorCapability[]) {
 if(role!=='OPERATOR')return null;
 return JSON.stringify(scannerOnly?[]:[...new Set(custom??OPERATOR_PROFILES[profile].capabilities)]);
}
const participantRead:OperatorCapability[]=['REGISTRATION_CREATE','REGISTRATION_EDIT','CHECK_IN','QUEUE_MANAGE','PAYMENT_REGISTER','SALE_REGISTER','SHIRT_DELIVER','CAP_DELIVER','REPORTS_READ','EXPORT'];
/** Additional restrictions for explicitly configured operators; the existing RBAC/edition checks still apply. */
export function assertOperationalAccess(user:CapabilityUser,method:string,rawPath:string,body:any={}) {
 if(user.role==='ADMIN'&&!user.scannerOnly)return;
 if(user.scannerOnly)return; // The existing scanner-only allowlist is applied immediately afterwards in authenticateToken.
 if(user.role!=='OPERATOR'||user.operationalPermissions==null)return;
 const path=rawPath.toLowerCase().replace(/^\/events\/[^/]+(?=\/)/,'');
 const read=['GET','HEAD'].includes(method.toUpperCase()),caps=new Set(capabilitiesFor(user));
 const need=(...any:OperatorCapability[])=>{if(!any.some(c=>caps.has(c)))throw new ForbiddenError('Tu cuenta no tiene autorización para esta operación.');};
 if(/^\/auth\/(me|logout|change-password|profile)$/.test(path)||/^\/notifications(?:\/|$)/.test(path)||/^\/events(?:\/[^/]+)?$/.test(path)&&read||/^\/realtime(?:\/|$)/.test(path)&&read||/^\/stream$/.test(path)&&read)return;
 if(/\/export(?:\/|$)/.test(path)){need('EXPORT');return;}
 if(path.startsWith('/statistics'))throw new ForbiddenError('Las estadísticas son exclusivas del administrador.');
 if(path.startsWith('/opinions')){if(read)need('OPINIONS_READ','OPINIONS_MANAGE');else need('OPINIONS_MANAGE');return;}
 if(path.startsWith('/import')){need('IMPORT_MANAGE');return;}
 if(path.startsWith('/speakers')){need('SPEAKERS_MANAGE');return;}
 if(path.startsWith('/finance')){need(read?'REPORTS_READ':'PAYMENT_REGISTER');return;}
 if(path.startsWith('/attendance/incidents')){need('INCIDENTS_MANAGE');return;}
 if(path.startsWith('/attendance/daily-sales')){need('REPORTS_READ','PAYMENT_REGISTER','SALE_REGISTER');return;}
 if(path.startsWith('/reception-queue')) {
  if(read)need('QUEUE_MANAGE','CHECK_IN');else need('QUEUE_MANAGE');
  if(!read&&/\/entries\/[^/]+\/confirm$/.test(path)){need('CHECK_IN');if(body.tshirtDelivered===true)need('SHIRT_DELIVER');if(body.capDecision==='DELIVER')need('CAP_DELIVER');}
  if(!read&&path.endsWith('/incident'))need('INCIDENTS_MANAGE');
  return;
 }
 if(path.startsWith('/scanner')){need('CHECK_IN');return;}
 if(read&&(/^\/participants(?:\/|$)/.test(path)||/^\/attendance(?:\/|$)/.test(path))){need(...participantRead);return;}
 if(read&&(/^\/inventory(?:\/|$)/.test(path)||/^\/merch(?:\/|$)/.test(path))){need('SHIRT_DELIVER','CAP_DELIVER','REPORTS_READ','CHECK_IN','QUEUE_MANAGE');return;}
 if(read&&/^\/(schedule|staff|sponsors)(?:\/|$)/.test(path)){need('REPORTS_READ','SPEAKERS_MANAGE');return;}
 if(read&&path.startsWith('/qr/')){need(...participantRead);return;}
 if(!read&&path.startsWith('/qr/')){need('CHECK_IN');return;}
 if(method==='POST'&&path==='/participants'){need('REGISTRATION_CREATE');if(Number(body.amountPaid??body.totalAmount??0)>0)need('PAYMENT_REGISTER');return;}
 if(method==='POST'&&path==='/participants/onsite-sale'){need('SALE_REGISTER');return;}
 if(method==='PUT'&&/^\/participants\/[^/]+$/.test(path)){need('REGISTRATION_EDIT');if(['amountPaid','totalAmount','balanceDue'].some(key=>Object.prototype.hasOwnProperty.call(body,key)))need('PAYMENT_REGISTER');return;}
 if(method==='POST'&&/^\/participants\/[^/]+\/payments$/.test(path)){need('PAYMENT_REGISTER');return;}
 if(method==='PUT'&&/^\/participants\/[^/]+\/tshirt-size$/.test(path)){need('REGISTRATION_EDIT','SHIRT_DELIVER');return;}
 if(method==='POST'&&/^\/participants\/[^/]+\/(deliver-tshirt|return-tshirt)$/.test(path)){need('SHIRT_DELIVER');return;}
 if(method==='POST'&&path==='/attendance/check-in'){need('CHECK_IN');if(body.tshirtDelivered===true)need('SHIRT_DELIVER');return;}
 if(method==='POST'&&/^\/merch\/deliver\/[^/]+$/.test(path)){need('CAP_DELIVER');return;}
 if(method==='POST'&&/^\/merch\/defer\/[^/]+$/.test(path)){need('CAP_DELIVER');return;}
 throw new ForbiddenError('Esta función no está incluida en los permisos de tu cuenta.');
}
