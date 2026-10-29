export type ShirtStock={initialQuantity:number;deliveredQuantity:number;staffDeliveredQuantity?:number;staffReservedQuantity?:number;availableQuantity:number;physicalRemaining?:number;pendingDelivery:number};
export function shirtStock(row:ShirtStock){
 const total=row.initialQuantity,delivered=row.deliveredQuantity+(row.staffDeliveredQuantity||0),reserved=(row.staffReservedQuantity||0)-(row.staffDeliveredQuantity||0),physical=total-delivered,free=physical-reserved;
 return {total,delivered,reserved,physical,free,pending:row.pendingDelivery,discrepancy:[total,delivered,reserved,physical,free,row.pendingDelivery].some(v=>!Number.isFinite(v)||v<0)||row.availableQuantity!==free||row.physicalRemaining!==undefined&&row.physicalRemaining!==physical};
}
export function capGroup(quota:number,assigned:number,delivered:number){
 return {quota,assigned,delivered,pending:assigned-delivered,unassigned:quota-assigned,discrepancy:[quota,assigned,delivered].some(v=>!Number.isFinite(v)||v<0)||delivered>assigned||assigned>quota};
}
export function stockAlerts(stock:ReturnType<typeof shirtStock>,threshold:number|null){
 const result:string[]=[];if(stock.discrepancy)result.push('Discrepancia de inventario: requiere conciliación administrativa.');
 if(stock.free<=0)result.push('Sin unidades libres para participantes.');else if(threshold!==null&&stock.free<=threshold)result.push('Stock bajo según el umbral configurado.');
 if(stock.pending>stock.free)result.push('Las solicitudes pendientes superan las unidades libres para entrega.');return result;
}
