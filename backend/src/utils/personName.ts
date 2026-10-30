const particles=new Set(['de','del','la','las','los','y','da','das','do','dos','van','von']);
export function personName(value:string) {
 const text=value.trim();
 if(text!==text.toLocaleLowerCase('es')&&text!==text.toLocaleUpperCase('es'))return text;
 return text.toLocaleLowerCase('es').split(/(\s+)/).map((word,index)=>particles.has(word)&&index>0?word:word.replace(/(^|[-'’])\p{L}/gu,part=>part.toLocaleUpperCase('es'))).join('');
}
export function personPresentation(value:any):any {
 if(!value||typeof value!=='object'||value instanceof Date||typeof value.toJSON==='function')return value;
 if(Array.isArray(value))return value.map(personPresentation);
 const result:any=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['firstName','lastName','fullName','participantName','recipientName'].includes(key)&&typeof v==='string'?personName(v):personPresentation(v)]));
 if(typeof result.firstName==='string'&&typeof result.lastName==='string'&&typeof result.fullName==='string')result.fullName=[result.firstName,result.lastName].filter(Boolean).join(' ');
 return result;
}
export function personWrite(data:any):any {
 if(Array.isArray(data))return data.map(personWrite);
 if(!data||typeof data!=='object'||data instanceof Date||typeof data.toJSON==='function'||Buffer.isBuffer(data))return data;
 const result:any=Object.fromEntries(Object.entries(data).map(([key,value])=>{
  if(['where','connect','disconnect','delete','deleteMany'].includes(key))return [key,value];
  if(['firstName','lastName','fullName'].includes(key)){
   if(typeof value==='string')return [key,personName(value)];
   if(value&&typeof value==='object'&&'set' in value&&typeof value.set==='string')return [key,{...value,set:personName(value.set)}];
  }
  return [key,personWrite(value)];
 }));
 if(typeof result.firstName==='string'&&typeof result.lastName==='string'&&typeof result.fullName==='string')result.fullName=[result.firstName,result.lastName].filter(Boolean).join(' ');
 return result;
}
