import { useEffect, useRef, useState } from 'react';
import { useReceptionQueue } from './ReceptionQueueContext';
import { QrScanModal } from '../qr/QrScanModal';
import { ScannerDialog } from './ScannerDialog';

export type QueueShirts = { enabled: boolean; delivered: boolean; sizes: { size: string; available: number }[] };
export function QueueScanFlow({ isOpen, onClose, onResult, allowManual = false }: {
  isOpen: boolean; onClose: () => void; onResult: (result: any) => void; allowManual?: boolean;
}) {
  const q = useReceptionQueue();
  const [preview, setPreview] = useState<{token:string;number:string;shirts:QueueShirts}|null>(null);
  const [size, setSize] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const lock = useRef(false), active = useRef(true);
  useEffect(() => { active.current=true; return () => { active.current=false; }; }, []);
  const send = async () => {
    if (!preview || lock.current) return;
    lock.current=true;setSending(true);setError('');
    try { const result = await q.read(preview.token, size || undefined); if(active.current){setPreview(null);onResult(result);} }
    catch(e:any) { if(active.current)setError(e.response?.data?.message || 'No se pudo confirmar el envío. Puedes reintentar; la cola evita duplicados.'); }
    finally { lock.current=false;if(active.current)setSending(false); }
  };
  return <>
    <QrScanModal isOpen={isOpen} onClose={onClose} allowManual={allowManual} onLinkedRead={async token => {
      try {
        const result=await q.preview(token);
        if(active.current){onClose();if(result.status==='VALID'){setError('');setSize(result.selectedTshirtSize||'');setPreview({token,number:result.number,shirts:result.shirts});}else onResult(result);}
      } catch { if(active.current){onClose();onResult({status:'REJECTED',result:'NETWORK'});} }
      return 'Validación procesada';
    }}/>
    {preview&&<ScannerDialog label="Enviar a recepción" onCancel={sending?undefined:()=>setPreview(null)}>
      <h2 className="text-xl font-bold text-primary">Entrada válida</h2><p className="text-lg font-mono">{preview.number}</p>
      {preview.shirts.enabled&&!preview.shirts.delivered&&<fieldset className="space-y-3"><legend className="font-semibold">¿Qué talla de camiseta utiliza el participante?</legend><div className="grid grid-cols-2 gap-2">{preview.shirts.sizes.map(item=><button key={item.size} type="button" aria-pressed={size===item.size} disabled={sending} className={size===item.size?'btn-primary min-h-14':'btn-secondary min-h-14'} onClick={()=>setSize(item.size)}>{item.size} · {item.available} disponibles</button>)}</div>{!preview.shirts.sizes.length&&<p role="alert">No hay tallas configuradas. Consulta con recepción.</p>}<p className="text-sm text-muted-foreground">La selección no reserva ni entrega una camiseta. La disponibilidad se vuelve a comprobar al entregarla.</p></fieldset>}
      {preview.shirts.delivered&&<p>La camiseta ya figura entregada.</p>}
      {error&&<p role="alert" className="text-destructive">{error}</p>}
      <button className="btn-primary w-full min-h-14" disabled={sending||!q.connected||preview.shirts.enabled&&!preview.shirts.delivered&&!preview.shirts.sizes.some(item=>item.size===size)} onClick={()=>void send()}>{sending?'Enviando…':'Enviar a recepción'}</button>
      <button className="btn-secondary w-full" disabled={sending} onClick={()=>setPreview(null)}>Cancelar lectura</button>
    </ScannerDialog>}
  </>;
}
