import React from 'react';
export const NON_DELIVERY_REASONS=['Talla solicitada agotada','El participante no desea camiseta','Otro motivo'];
export type DeliveryChoice='DELIVER'|'NO_DELIVERY'|null;
export function ShirtDeliveryChoice({value,onChange,disabled,canDeliver=true}:{value:DeliveryChoice;onChange:(value:DeliveryChoice)=>void;disabled:boolean;canDeliver?:boolean}){
 return <div role="group" aria-label="Decisión de entrega" className="grid grid-cols-1 sm:grid-cols-2 gap-3">{([['DELIVER','Entregar camiseta'],['NO_DELIVERY','No entregar camiseta']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={value===key} className={(value===key?'btn-primary':'btn-secondary')+' min-h-16'} disabled={disabled||key==='DELIVER'&&!canDeliver} onClick={()=>onChange(key)}>{label}</button>)}</div>;
}
