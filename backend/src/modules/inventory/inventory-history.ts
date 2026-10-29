export function inventoryHistory(rows:{id:string;entityId:string|null;action:string;changes:unknown;createdAt:Date}[],item:{id:string;size:string}){
 return rows.flatMap(row=>{
  let c:any;try{c=typeof row.changes==='string'?JSON.parse(row.changes):row.changes;}catch{return [];}if(!c)return [];
  const own=row.entityId===item.id&&row.action.startsWith('TSHIRT_'),initial=row.action==='TSHIRT_INVENTORY_INIT'&&Array.isArray(c.sizes)?c.sizes.find((r:any)=>r.size===item.size):null,imported=c.module==='TSHIRT_INVENTORY'&&c.size===item.size;
  if(!own&&!initial&&!imported)return [];
  const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
  return [{id:row.id,createdAt:row.createdAt,action:row.action,before:numeric(c.previous?.initialQuantity??c.before),after:numeric(c.current?.initialQuantity??c.after??initial?.quantity??c.initialQuantity),quantity:numeric(c.quantity)}];
 });
}
