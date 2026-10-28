type StockRow={size:string;initialQuantity:number;deliveredQuantity:number;staffDeliveredQuantity?:number;availableQuantity:number;physicalRemaining?:number;pendingDelivery:number};
// Pending requests overlap physical stock; they are a separate grouped series.
export function inventoryChart(rows:StockRow[]){return rows.map(r=>({size:r.size,total:r.initialQuantity,delivered:r.deliveredQuantity+(r.staffDeliveredQuantity||0),available:r.physicalRemaining??r.initialQuantity-r.deliveredQuantity-(r.staffDeliveredQuantity||0),participantAvailable:r.availableQuantity,pending:r.pendingDelivery}));}
