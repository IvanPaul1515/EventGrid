import React from 'react';
export const NON_DELIVERY_REASONS=['Agotada','El participante no la solicitó','Talla no disponible','Entrega pendiente','Otro motivo'];
export type DeliveryChoice='DELIVER'|'NO_DELIVERY'|null;
export function ShirtDeliveryChoice({value,onChange,disabled}:{value:DeliveryChoice;onChange:(value:DeliveryChoice)=>void;disabled:boolean}){
 return <div role="group" aria-label="Decisión de entrega" className="grid grid-cols-1 sm:grid-cols-2 gap-3">{([['DELIVER','Entregar camiseta'],['NO_DELIVERY','No entregar camiseta']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={value===key} className={(value===key?'btn-primary':'btn-secondary')+' min-h-16'} disabled={disabled} onClick={()=>onChange(key)}>{label}</button>)}</div>;
}
