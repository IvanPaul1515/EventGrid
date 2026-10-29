import { blankHandwrittenRow, parseHandwritten, type HandwrittenRow } from './handwritten';

export type BulkRow = HandwrittenRow & { fullName:string; institution:string; registrationDate:string; registrationTime:string; paymentDate:string; paymentTime:string; source:string; action:'NEW'|'SKIP'|'USE_EXISTING'|'UPDATE' };
export const blankBulkRow=(pageId:string,id:string):BulkRow=>({...blankHandwrittenRow(pageId,id),selected:true,fullName:'',institution:'',registrationDate:'',registrationTime:'',paymentDate:'',paymentTime:'',source:'',action:'NEW'});
export const BULK_FIELDS = [
 ['firstName','Nombres'],['lastName','Apellidos'],['fullName','Nombre completo por revisar'],['documentId','Cédula'],['email','Correo'],['phone','Teléfono'],
 ['registrationDate','Fecha de inscripción'],['registrationTime','Hora de inscripción'],['date','Fecha de compra'],['time','Hora de compra'],
 ['paymentDate','Fecha de pago'],['paymentTime','Hora de pago'],['timezone','Zona horaria'],['reference','Referencia externa'],
 ['ticketType','Tipo de entrada'],['amount','Importe'],['state','Estado de pago'],['method','Método de pago'],['source','Origen documental'],['institution','Institución'],['notes','Observaciones'],
] as const;
const aliases:Record<string,string[]>={firstName:['nombre','nombres','first name'],lastName:['apellido','apellidos','last name'],fullName:['nombre completo','participante','nombres y apellidos'],documentId:['cedula','documento','doc identidad'],email:['correo','correo electronico','email','e mail'],phone:['telefono','celular','phone'],registrationDate:['fecha inscripcion','fecha de inscripcion','fecha registro'],registrationTime:['hora inscripcion','hora registro'],date:['fecha','fecha compra','fecha de compra','fecha venta'],time:['hora','hora compra','hora de compra'],paymentDate:['fecha pago','fecha de pago'],paymentTime:['hora pago','hora de pago'],timezone:['zona','zona horaria','timezone'],reference:['numero externo','no registro','referencia','referencia externa','referencia compra'],ticketType:['entrada','tarifa','tipo entrada','tipo de entrada'],amount:['importe','monto','monto pagado','amount'],state:['estado','estado pago','estado de pago'],method:['metodo','metodo pago','metodo de pago','forma de pago'],source:['origen','fuente','origen documental'],institution:['institucion','empresa','universidad'],notes:['notas','observaciones']};
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function bulkHeader(value:string) {const text=fold(value);return Object.keys(aliases).find(key=>key===value||aliases[key].includes(text));}
export function delimitedRows(text:string):string[][] {
 const first=text.split(/\r?\n/)[0]||'',separator=first.includes('\t')?'\t':first.includes('|')?'|':first.includes(';')?';':',';
 const rows:string[][]=[],row:string[]=[];let cell='',quoted=false;
 for(let i=0;i<=text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===separator||c==='\n'||c===undefined)){row.push(cell.trim());cell='';if(c!==separator){if(row.some(Boolean))rows.push([...row]);row.length=0;}}else if(c!=='\r'||quoted)cell+=c;}
 if(quoted)throw Error('Hay comillas sin cerrar. Revisa la tabla pegada.');return rows;
}
export function rowsFromCells(cells:unknown[][],pageId:string):BulkRow[] {
 const table=cells.map(row=>row.map(value=>String(value??'').trim())).filter(row=>row.some(Boolean));if(!table.length)return [];
 const mapping=table[0].map(bulkHeader),hasHeaders=mapping.filter(Boolean).length>=2;
 if(hasHeaders&&new Set(mapping.filter(Boolean)).size!==mapping.filter(Boolean).length)throw Error('Hay columnas que apuntan al mismo campo. Revisa los encabezados antes de pegar.');
 const data=hasHeaders?table.slice(1):table;
 if(data.length>200)throw Error('Máximo 200 filas por lote.');
 return data.map((cells,index)=>{
  const row=blankBulkRow(pageId,'row-'+(index+1));row.raw=cells.join(' | ');
  if(hasHeaders){mapping.forEach((target,i)=>{if(target)(row as any)[target]=cells[i]||'';});}
  else {
   const proposal=parseHandwritten(cells.join(' | '),pageId)[0];if(proposal)Object.assign(row,proposal,{id:row.id,selected:true});
   // A full name without labelled columns is ambiguous: retain it rather than guessing surnames.
   row.fullName=cells[0]||'';row.firstName='';row.lastName='';
   row.email=cells.find(c=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))||'';
  }
  const state=fold(row.state);row.state=['paid','pagado','pagada','pago'].includes(state)?'PAID':['pending','pendiente','no pagado'].includes(state)?'PENDING':'REVIEW';
  row.paymentConfirmed=false;row.reviewed=false;return row;
 });
}
export const parseBulkTable=(text:string,pageId:string)=>rowsFromCells(delimitedRows(text),pageId);
export function editBulkRow(row:BulkRow,field:keyof BulkRow,value:unknown):BulkRow {
 return {...row,[field]:value,...(!['reviewed','selected','paymentConfirmed','action'].includes(field)?{reviewed:false,paymentConfirmed:false}:{})};
}
export function duplicateBulkRow(row:BulkRow,id:string):BulkRow {return {...row,id,reference:'',reviewed:false,paymentConfirmed:false,action:'NEW'};}
