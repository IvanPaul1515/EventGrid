import {purchaseChronology} from '../import/intelligence.js';
export function officialOrder(raw:unknown,mappingConfig?:unknown):{position:number;source:string}|null {
 let data:any=raw;if(typeof raw==='string'){try{data=JSON.parse(raw);}catch{return null;}}
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const values=Object.entries(data).filter(([key])=>['no registro','numero de registro','orden oficial de inscripcion'].includes(key.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
 if(values.length!==1)return null;const [source,value]=values[0],text=String(value??'').trim();
 let mapping:any=mappingConfig;if(typeof mapping==='string'){try{mapping=JSON.parse(mapping);}catch{return null;}}if(mapping?.columns&&!['externalReference','officialRegistrationOrder'].includes(mapping.columns[source]))return null;
 if(!/^[0-9]+$/.test(text))return null;const position=Number(text);
 return Number.isSafeInteger(position)&&position>0&&position<=2147483647?{position,source}:null;
}
export function officialEligibility(rows:{id:string;officialRegistrationOrder?:number|null;officialOrderSource?:string|null;importOriginalData?:unknown;importBatch?:{mappingConfig?:unknown}|null}[],cutoff=100){
 const issues:{registrationId:string;reason:string}[]=[],eligible:string[]=[],positions=new Map<number,string[]>();
 for(const row of rows){const parsed=officialOrder(row.importOriginalData,row.importBatch?.mappingConfig),position=row.officialRegistrationOrder??parsed?.position;
  if(!Number.isSafeInteger(position)||!position||position<1||!(row.officialOrderSource||parsed?.source)){issues.push({registrationId:row.id,reason:'Sin secuencia oficial verificable; requiere conciliación.'});continue;}
  if(row.importOriginalData&&!parsed){issues.push({registrationId:row.id,reason:'Fuente oficial incompleta o no reconocida; requiere conciliación.'});continue;}
  if(row.officialRegistrationOrder&&parsed&&row.officialRegistrationOrder!==parsed.position){issues.push({registrationId:row.id,reason:'La fuente cambió el orden ya conservado; no se reasignó.'});continue;}
  positions.set(position,[...(positions.get(position)||[]),row.id]);
 }
 for(const [position,ids] of positions){if(ids.length>1){ids.forEach(id=>issues.push({registrationId:id,reason:`Secuencia oficial ${position} repetida en identidades distintas.`}));}else if(position<=Math.min(100,cutoff))eligible.push(ids[0]);}
 return {eligible,issues};
}

export function capEligibility(rows:any[],policy='OFFICIAL_REGISTRATION',cutoff=100,historyComplete=true){
 if(!historyComplete)return {policy,eligible:[] as string[],issues:rows.map(r=>({registrationId:r.id,reason:'Historial de la edición pendiente de revisión administrativa; no se conceden derechos por un ranking parcial.'})),orders:{} as Record<string,number>};
 if(policy==='OFFICIAL_PURCHASE'){
  const buyers=rows.filter(r=>!r.isCourtesy&&Number(r.amountPaid)>0),chronology=purchaseChronology(buyers);
  return {policy,eligible:chronology.filter(r=>r.position!==null&&r.position<=Math.min(100,cutoff)).map(r=>r.id),issues:chronology.filter(r=>r.position===null).map(r=>({registrationId:r.id,reason:'Compra sin prioridad verificable; faltan fechas, zona o desempate oficial.'})),orders:Object.fromEntries(chronology.filter(r=>r.position!==null).map(r=>[r.id,r.position!])) as Record<string,number>};
 }
 const hasAbsolute=rows.some(r=>r.officialRegistrationOrder||officialOrder(r.importOriginalData,r.importBatch?.mappingConfig));
 if(!hasAbsolute){
  const chronology=purchaseChronology(rows.map(r=>{let dates:any={};try{dates=JSON.parse(r.historicalDates||'{}');}catch{}return {...r,historicalDates:JSON.stringify({purchasedAt:dates.registeredAt,purchaseSequence:dates.registrationSequence})};}));
  return {policy:'OFFICIAL_REGISTRATION',eligible:chronology.filter(r=>r.position!==null&&r.position<=Math.min(100,cutoff)).map(r=>r.id),issues:chronology.filter(r=>r.position===null).map(r=>({registrationId:r.id,reason:'Inscripción sin fecha y hora oficial verificable o con empate sin resolver.'})),orders:Object.fromEntries(chronology.filter(r=>r.position!==null).map(r=>[r.id,r.position!])) as Record<string,number>};
 }
 const result=officialEligibility(rows,cutoff),invalid=new Set(result.issues.map(i=>i.registrationId));
 if(result.issues.length)return {policy:'OFFICIAL_REGISTRATION',eligible:[] as string[],orders:{} as Record<string,number>,issues:rows.map(r=>({registrationId:r.id,reason:'La secuencia conjunta contiene registros o empates pendientes; requiere conciliación antes de conceder nuevos derechos.'}))};
 return {...result,policy:'OFFICIAL_REGISTRATION',orders:Object.fromEntries(rows.filter(r=>!invalid.has(r.id)&&r.officialOrderSource&&r.officialRegistrationOrder).map(r=>[r.id,r.officialRegistrationOrder])) as Record<string,number>};
}
export const capRegistrationSelect={id:true,officialRegistrationOrder:true,officialOrderSource:true,importOriginalData:true,importBatch:{select:{mappingConfig:true}},historicalDates:true,source:true,externalReference:true,amountPaid:true,isCourtesy:true} as const;
// The same policy is checked again inside the stock transaction.
export async function verifiedCapOrder(db:any,eventId:string,registrationId:string,cutoff=100){
 const cap=await db.merchItem.findUnique({where:{eventId_systemCode:{eventId,systemCode:'OFFICIAL_CAP'}}});
 const rows=await db.registration.findMany({where:{eventId,isDemo:false,status:{not:'CANCELLED'}},select:capRegistrationSelect});
 const result=capEligibility(rows,cap?.criterion,cutoff,cap?.historyComplete===true),order=result.orders[registrationId]??null;
 const issue=result.issues.some(i=>i.registrationId===registrationId);
 return {order,policy:result.policy,eligible:!!order&&!issue&&result.eligible.includes(registrationId),pending:issue||!order};
}
