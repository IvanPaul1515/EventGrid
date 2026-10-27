import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ScannerDialog } from './ScannerDialog';
import { useReceptionQueue, QueueRow } from './ReceptionQueueContext';
import { useEdition } from '../../context/EditionContext';
import type { QueueShirts } from './QueueScanFlow';

type Detail = { name:string;number:string;canCheckIn:boolean;blockedReason?:string;selectedTshirtSize?:string;shirts:QueueShirts };
export function QueueQuickConfirm({ row, onClose, onFull, onConfirmed }: {
  row:QueueRow;onClose:()=>void;onFull:()=>Promise<void>;onConfirmed:(message:string)=>void;
}) {
  const q=useReceptionQueue(),{currentEvent}=useEdition();
  const [detail,setDetail]=useState<Detail|null>(null),[size,setSize]=useState(''),[deliver,setDeliver]=useState(false);
  const [error,setError]=useState(''),[sending,setSending]=useState(false);
  const lock=useRef(false),base=`/events/${currentEvent?.id}/reception-queue/entries/${row.id}`;
  useEffect(()=>{
    let active=true;setDetail(null);setError('');setDeliver(false);
    api.get(base+'/details').then(res=>{if(active){setDetail(res.data.data);setSize(res.data.data.selectedTshirtSize||'');}}).catch(()=>{if(active)setError('No se pudo consultar la entrada. Vuelve a la cola y reintenta.');});
    return()=>{active=false;};
  },[base]);
  const confirm=async()=>{
    if(lock.current||!detail)return;lock.current=true;setSending(true);setError('');
    try{const result=await q.act('/entries/'+row.id+'/confirm',{confirmed:true,tshirtSize:detail.shirts.enabled&&!detail.shirts.delivered?size||undefined:undefined,tshirtDelivered:deliver});onConfirmed(result.message);}
    catch(e:any){setError(e.response?.data?.message||'Sin confirmación del servidor. Revisa el estado de la entrada antes de reintentar.');}
    finally{lock.current=false;setSending(false);}
  };
  const availability=detail?.shirts.sizes.find(item=>item.size===size)?.available||0;
  return <ScannerDialog label="Confirmar entrada" onCancel={sending?undefined:onClose}>
    <h2 className="text-xl font-bold">Confirmar entrada</h2><h3 className="text-xl font-semibold break-words">{row.name}</h3><p className="font-mono text-lg">{row.number}</p>
    {!detail&&!error&&<p role="status">Validando entrada…</p>}
    {detail&&<>
      <p role="status" className={detail.canCheckIn?'text-primary font-semibold':'text-destructive font-semibold'}>{detail.canCheckIn?'Entrada válida':detail.blockedReason}</p>
      {detail.shirts.enabled&&<div className="space-y-3">
        {detail.shirts.delivered?<p className="font-semibold">Camiseta entregada · {detail.selectedTshirtSize||'Talla registrada'}</p>:<>
          <label className="block space-y-2 font-semibold">Talla seleccionada<select className="input-field text-lg" value={size} disabled={sending} onChange={e=>{setSize(e.target.value);setDeliver(false);}}><option value="" disabled>Seleccionar talla</option>{detail.shirts.sizes.map(item=><option key={item.size} value={item.size}>{item.size} · {item.available} disponibles</option>)}</select></label>
          <p className="text-sm text-muted-foreground">Disponibles: {availability}. La selección no reserva inventario; se comprueba al entregar.</p>
          <label className="flex items-center gap-3 min-h-12"><input type="checkbox" checked={deliver} disabled={sending||!size||availability<1} onChange={e=>setDeliver(e.target.checked)}/>Entregar camiseta</label>
          {availability<1&&size&&<p className="text-sm text-destructive">Talla sin existencias. Puedes corregir la talla o dejar la entrega pendiente.</p>}
        </>}
      </div>}
      <button className="btn-primary w-full min-h-14" disabled={sending||!q.connected||!detail.canCheckIn||deliver&&(!size||availability<1)} onClick={()=>void confirm()}>{sending?'Confirmando…':'Confirmar asistencia'}</button>
    </>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    <button className="btn-secondary w-full min-h-12" disabled={sending} onClick={()=>void onFull().catch(()=>setError('No se pudo abrir la ficha completa. Comprueba la conexión.'))}>Revisar ficha completa</button>
    <button className="btn-secondary w-full min-h-12" disabled={sending} onClick={onClose}>Volver a la cola</button>
  </ScannerDialog>;
}
