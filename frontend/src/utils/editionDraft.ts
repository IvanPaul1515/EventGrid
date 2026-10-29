export function newEditionDraft(){
 return {id:crypto.randomUUID(),step:0,name:'',slug:'',year:new Date().getFullYear(),startDate:'',endDate:'',venue:'',status:'PLANNING',primaryColor:'#2563eb',secondaryColor:'#1e40af',accentColor:'#0ea5e9',backgroundColor:'#09090b',themeMode:'dark',timeZone:'America/Santo_Domingo',currencyCode:'DOP',currencySymbol:'RD$',registrationPrefix:'EV-',ticketName:'Entrada general',ticketPrice:'',includesTshirt:true,shirts:'S:0\nM:0\nL:0\nXL:0',capsEnabled:false,capQuantity:'0',participantQuota:'0',staffQuota:'0',capCriterion:'OFFICIAL_REGISTRATION',surveyEnabled:false};
}
export type EditionDraft=ReturnType<typeof newEditionDraft>;
export function editionDraftKey(userId?:string,token?:string|null){
 if(!userId||!token)return null;
 try{const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return typeof payload.sid==='string'&&payload.sid.length<=128?'eventgrid:edition-draft:v1:'+JSON.stringify([userId,payload.sid]):null;}catch{return null;}
}
export function readEditionDraft(storage:Pick<Storage,'getItem'>,key:string|null,now=Date.now()):EditionDraft {
 const defaults=newEditionDraft();if(!key)return defaults;
 try{const saved=JSON.parse(storage.getItem(key)||'null'),value=saved?.draft;
  if(saved?.version!==1||!Number.isFinite(saved.at)||now-saved.at>86400000||saved.at>now||!value||!Object.keys(defaults).every(k=>typeof value[k]===typeof defaults[k as keyof EditionDraft]))return defaults;
  if(!/^[a-f\d-]{36}$/i.test(value.id)||!Number.isInteger(value.step)||value.step<0||value.step>5||!Number.isInteger(value.year)||Object.values(value).some(v=>typeof v==='string'&&v.length>3000))return defaults;
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,value[k]])) as EditionDraft;
 }catch{return defaults;}
}
export function editionSetupPayload(draft:EditionDraft){
 const startDate=new Date(draft.startDate),endDate=new Date(draft.endDate);
 if(!Number.isFinite(+startDate)||!Number.isFinite(+endDate)||endDate<startDate)throw Error('Revisa las fechas de inicio y finalización.');
 const shirts=draft.includesTshirt?draft.shirts.split(/\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const match=/^([^:]{1,40}):\s*(\d+)$/.exec(line);if(!match)throw Error('Escribe cada talla como M:20, una por línea.');return {size:match[1].trim(),quantity:Number(match[2])};
 }):[];
 return {id:draft.id,name:draft.name.trim(),slug:draft.slug.trim(),year:draft.year,startDate:startDate.toISOString(),endDate:endDate.toISOString(),venue:draft.venue.trim(),status:draft.status,
  appearance:{primaryColor:draft.primaryColor,secondaryColor:draft.secondaryColor,accentColor:draft.accentColor,backgroundColor:draft.backgroundColor,themeMode:draft.themeMode,timeZone:draft.timeZone,currencyCode:draft.currencyCode,currencySymbol:draft.currencySymbol,registrationPrefix:draft.registrationPrefix},
  ticket:{name:draft.ticketName.trim(),price:Number(draft.ticketPrice),includesTshirt:draft.includesTshirt},shirts,
  caps:{enabled:draft.capsEnabled,quantity:Number(draft.capQuantity),participantQuota:Number(draft.participantQuota),staffQuota:Number(draft.staffQuota),criterion:draft.capCriterion},surveyEnabled:draft.surveyEnabled,confirmed:true};
}
