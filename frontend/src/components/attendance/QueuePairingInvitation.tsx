import {useEffect,useState} from 'react';
import {ScannerDialog} from './ScannerDialog';
export type PairingInvitation={code:string;expiresAt:string;qrDataUrl:string};
export function QueuePairingInvitation({value,pending,active,onRegenerate,onClose}:{value:PairingInvitation;pending:boolean;active:boolean;onRegenerate:()=>void;onClose:()=>void}){
 const [now,setNow]=useState(Date.now()),[copied,setCopied]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const seconds=Math.max(0,Math.ceil((Date.parse(value.expiresAt)-now)/1000));
 return <ScannerDialog label="Vincular nuevo escáner" onCancel={onClose}>
  <h2 className="text-xl font-bold">Vincular nuevo escáner</h2>
  <p>Desde el teléfono, abre EventGrid y selecciona Escanear QR de vinculación.</p>
  {seconds>0&&active?<img className="w-60 h-60 max-w-full mx-auto rounded-xl bg-white p-2" src={value.qrDataUrl} alt="QR temporal de vinculación de esta estación"/>:<p role="status">Invitación vencida, utilizada o revocada.</p>}
  <p role="status" className="text-sm text-muted-foreground">{seconds>0&&active?`Vence en ${seconds} s · Un solo uso`:'Genera otra invitación para vincular un teléfono.'}</p>
  <p className="text-sm text-muted-foreground">Autoriza al colaborador desde esta PC. No se solicita un segundo código.</p>
  {active&&seconds>0&&<details><summary className="cursor-pointer text-sm">Alternativa sin cámara</summary><p className="font-mono text-xl tracking-widest text-center py-3">{value.code}</p><button className="btn-secondary w-full" onClick={()=>void navigator.clipboard?.writeText(value.code).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'Código copiado':'Copiar código alternativo'}</button></details>}
  <button className="btn-primary w-full" disabled={pending} onClick={onRegenerate}>Regenerar QR</button><button className="btn-secondary w-full" disabled={pending} onClick={onClose}>Cerrar y revocar</button>
 </ScannerDialog>;
}
