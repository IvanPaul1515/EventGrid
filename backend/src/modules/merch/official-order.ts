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
  if(!position||!(row.officialOrderSource||parsed?.source)){issues.push({registrationId:row.id,reason:'Sin secuencia oficial verificable; requiere conciliación.'});continue;}
  if(row.officialRegistrationOrder&&parsed&&row.officialRegistrationOrder!==parsed.position){issues.push({registrationId:row.id,reason:'La fuente cambió el orden ya conservado; no se reasignó.'});continue;}
  positions.set(position,[...(positions.get(position)||[]),row.id]);
 }
 for(const [position,ids] of positions){if(ids.length>1){ids.forEach(id=>issues.push({registrationId:id,reason:`Secuencia oficial ${position} repetida en identidades distintas.`}));}else if(position<=cutoff)eligible.push(ids[0]);}
 return {eligible,issues};
}
