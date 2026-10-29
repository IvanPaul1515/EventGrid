export type CapabilityUser={role:string;scannerOnly?:boolean;operationalPermissions?:string|null};
export function userCapability(user:CapabilityUser|null|undefined,capability:string) {
 if(!user||user.scannerOnly)return false;
 if(user.role==='ADMIN')return true;
 if(user.role==='VIEWER')return ['REPORTS_READ','EXPORT'].includes(capability);
 if(user.role!=='OPERATOR')return false;
 if(user.operationalPermissions==null)return !capability.startsWith('OPINIONS_');
 try{const values=JSON.parse(user.operationalPermissions);return Array.isArray(values)&&values.includes(capability);}catch{return false;}
}

const participantCapabilities=['REGISTRATION_CREATE','REGISTRATION_EDIT','CHECK_IN','QUEUE_MANAGE','PAYMENT_REGISTER','SALE_REGISTER','SHIRT_DELIVER','CAP_DELIVER','REPORTS_READ','EXPORT'];
/** Navigation mirrors the additional operator restrictions; API guards remain authoritative. */
export function canOpenSection(user:CapabilityUser|null|undefined,path:string):boolean {
 if(!user)return false;
 if(path==='/opinions')return userCapability(user,'OPINIONS_READ')||userCapability(user,'OPINIONS_MANAGE');
 if(user.role!=='OPERATOR'||user.scannerOnly||user.operationalPermissions==null)return true;
 const section='/' + (path.split('/').filter(Boolean)[0]??'');
 const any=(...capabilities:string[])=>capabilities.some(cap=>userCapability(user,cap));
 switch(section){
  case '/': return any('REPORTS_READ');
  case '/reception':return any('CHECK_IN','QUEUE_MANAGE');
  case '/participants': case '/attendance':return any(...participantCapabilities);
  case '/import':return any('IMPORT_MANAGE');
  case '/sales':return any('PAYMENT_REGISTER','SALE_REGISTER','REPORTS_READ');
  case '/inventory':return any('SHIRT_DELIVER','CAP_DELIVER','REPORTS_READ','CHECK_IN','QUEUE_MANAGE');
  case '/speakers':return any('SPEAKERS_MANAGE');
  case '/schedule':return any('SPEAKERS_MANAGE','REPORTS_READ');
  case '/sponsors':case '/staff':return any('REPORTS_READ');
  case '/notifications':return true;
  case '/opinions':return any('OPINIONS_READ','OPINIONS_MANAGE');
  default:return false;
 }
}

export function operatorHome(user:CapabilityUser|null|undefined):string|null {
 return ['/','/reception','/participants','/sales','/inventory','/import','/speakers','/opinions'].find(path=>canOpenSection(user,path))??null;
}
