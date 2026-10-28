import { useEffect, useRef, useState } from 'react';
import { useReceptionQueue } from './ReceptionQueueContext';
import { QrScanModal } from '../qr/QrScanModal';
import { ScannerDialog } from './ScannerDialog';
import { qrFailureStatus, qrFeedback } from '../../utils/qrFeedback';
import { useEdition } from '../../context/EditionContext';

export type QueueShirts = { enabled: boolean; delivered: boolean; sizes: { size: string; available: number }[] };
export function QueueScanFlow({ isOpen, onClose, onResult, allowManual = false }: {
  isOpen: boolean; onClose: () => void; onResult: (result: any) => void; allowManual?: boolean;
}) {
  const q = useReceptionQueue();
  const {currentEvent}=useEdition();
  const [preview, setPreview] = useState<{token:string;requestKey:string;name:string;organization?:string;number:string;shirts:QueueShirts}|null>(null);
  const [size, setSize] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const lock = useRef(false), active = useRef(true);
  const scope=useRef(0);
  useEffect(() => { active.current=true; return () => { active.current=false; }; }, []);
  useEffect(()=>{scope.current++;setPreview(null);},[currentEvent?.id,q.state.device?.id]);
  const send = async () => {
    if (!preview || lock.current) return;
    lock.current=true;setSending(true);setError('');
    try { const result = await q.read(preview.token, size || undefined,preview.requestKey); if(active.current){setPreview(null);onResult(result);} }
    catch(e:any) { if(active.current)setError(qrFeedback(qrFailureStatus(e)).title); }
    finally { lock.current=false;if(active.current)setSending(false); }
  };
  return <>
    <QrScanModal isOpen={isOpen} onClose={()=>{scope.current++;onClose();}} allowManual={allowManual} onLinkedRead={async token => {
      const requestScope=scope.current,requestKey=crypto.randomUUID();
      try {
        const result=await q.preview(token,requestKey);
        if(active.current&&requestScope===scope.current){onClose();if(result.status==='VALID'){setError('');setSize(result.selectedTshirtSize||'');setPreview({token,requestKey,name:result.name,organization:result.organization,number:result.number,shirts:result.shirts});}else onResult(result);}
      } catch(e:any) { if(active.current&&requestScope===scope.current){onClose();onResult({status:'REJECTED',result:qrFailureStatus(e)});} }
      return 'Validación procesada';
    }}/>
    {preview&&<ScannerDialog label="Enviar a recepción" onCancel={sending?undefined:()=>setPreview(null)}>
      <h2 className="text-xl font-bold text-primary">Entrada válida</h2><h3 className="text-xl font-semibold break-words">{preview.name}</h3>{preview.organization&&<p className="text-muted-foreground">{preview.organization}</p>}<p className="text-lg font-mono">Entrada: {preview.number}</p>
      {preview.shirts.enabled&&!preview.shirts.delivered&&<fieldset className="space-y-3"><legend className="font-semibold">¿Qué talla de camiseta utiliza el participante?</legend><div className="grid grid-cols-2 gap-2">{preview.shirts.sizes.map(item=><button key={item.size} type="button" aria-pressed={size===item.size} disabled={sending} className={size===item.size?'btn-primary min-h-14':'btn-secondary min-h-14'} onClick={()=>setSize(item.size)}><span className="block font-bold">Talla: {item.size}</span><span className="block text-xs font-normal">Disponibles: {item.available} unidades</span></button>)}</div>{!preview.shirts.sizes.length&&<p role="alert">No hay tallas configuradas. Consulta con recepción.</p>}<p className="text-sm text-muted-foreground">La selección no reserva ni entrega una camiseta. La disponibilidad se vuelve a comprobar al entregarla.</p></fieldset>}
      {preview.shirts.delivered&&<p>La camiseta ya figura entregada.</p>}
      {error&&<p role="alert" className="text-destructive">{error}</p>}
      <button className="btn-primary w-full min-h-14" disabled={sending||!q.connected||preview.shirts.enabled&&!preview.shirts.delivered&&!preview.shirts.sizes.some(item=>item.size===size)} onClick={()=>void send()}>{sending?'Enviando…':'Enviar a recepción'}</button>
      <button className="btn-secondary w-full" disabled={sending} onClick={()=>setPreview(null)}>Cancelar lectura</button>
    </ScannerDialog>}
  </>;
}
