import {useCallback,useEffect,useState} from 'react';
import {inventoryService,TshirtInventoryItem} from '../../services/inventory.service';
import {useEdition} from '../../context/EditionContext';
import {useRealtimeRefresh} from '../../context/RealtimeContext';
export function QueueInventorySummary(){
 const {currentEvent}=useEdition(),[items,setItems]=useState<TshirtInventoryItem[]>([]),[error,setError]=useState(false);
 const load=useCallback(async()=>{try{const result=await inventoryService.getInventory(currentEvent?.id);setItems(result.items.filter(item=>item.isActive));setError(false);}catch{setError(true);}},[currentEvent?.id]);
 useEffect(()=>{void load();},[load]);useRealtimeRefresh('inventory',load);
 return <section aria-label="Inventario de camisetas" className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-bold">Inventario de camisetas</h2>{error?<p role="alert">No se pudo consultar el inventario. <button className="underline" onClick={()=>void load()}>Reintentar</button></p>:<div className="flex flex-wrap gap-2">{items.map(item=><div key={item.id} className="rounded-xl border border-border px-3 py-2"><strong className={Number(item.availableForParticipants??item.availableQuantity)<=0?'text-destructive':'text-primary'}>{item.size} — {item.availableForParticipants??item.availableQuantity}</strong><p className="text-xs text-muted-foreground">{item.physicalRemaining!==undefined?`Físicas: ${item.physicalRemaining} · `:''}Reservas pendientes staff: {item.staffPendingQuantity||0}{Number(item.availableForParticipants??item.availableQuantity)<=0?' · Agotada':''}</p></div>)}</div>}<p className="text-xs text-muted-foreground">Disponibles para participantes; las reservas de staff están protegidas. Escanear o seleccionar talla no descuenta unidades.</p></section>;
}
