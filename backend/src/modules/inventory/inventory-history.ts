export function inventoryHistory(rows:{id:string;entityId:string|null;action:string;changes:unknown;createdAt:Date}[],item:{id:string;size:string}){
 return rows.flatMap(row=>{
  let c:any;try{c=typeof row.changes==='string'?JSON.parse(row.changes):row.changes;}catch{return [];}if(!c)return [];
  const own=row.entityId===item.id&&/^(TSHIRT_|STAFF_TSHIRT_)/.test(row.action),initial=row.action==='TSHIRT_INVENTORY_INIT'&&Array.isArray(c.sizes)?c.sizes.find((r:any)=>r.size===item.size):null,imported=c.module==='TSHIRT_INVENTORY'&&c.size===item.size;
  if(!own&&!initial&&!imported)return [];
  const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
  const labels:Record<string,string>={TSHIRT_INVENTORY_INIT:'Carga inicial',TSHIRT_INVENTORY_CREATE:'Alta de talla',TSHIRT_INVENTORY_UPDATE:'Ajuste de existencias',STAFF_TSHIRT_RESERVE:'Reserva de staff',STAFF_TSHIRT_RELEASE:'Liberación de reserva'};
  return [{id:row.id,createdAt:row.createdAt,action:row.action,label:labels[row.action]||'Movimiento de existencias',before:numeric(c.previous?.initialQuantity??c.previousReserved??c.before),after:numeric(c.current?.initialQuantity??c.newReserved??c.after??initial?.quantity??c.initialQuantity),quantity:numeric(c.quantity??c.releasedQuantity)}];
 });
}
