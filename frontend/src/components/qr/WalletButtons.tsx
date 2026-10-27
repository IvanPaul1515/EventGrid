import { useEffect, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
export function WalletButtons({ registrationId, revision }: { registrationId: string; revision?: string }) {
  const [ready,setReady]=useState({apple:false,google:false}),[busy,setBusy]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let active=true;setReady({apple:false,google:false});setError('');void api.get(`/wallet/${registrationId}/options`).then(r=>{if(active)setReady(r.data.data);}).catch(()=>{});return()=>{active=false;};},[registrationId,revision]);
  const add=async(provider:'apple'|'google')=>{if(busy)return;setBusy(provider);setError('');try{
    if(provider==='apple'){const r=await api.post(`/wallet/${registrationId}/apple`,{}, {responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download='entrada.pkpass';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    else{const r=await api.post(`/wallet/${registrationId}/google`);if(!r.data.data.url.startsWith('https://pay.google.com/gp/v/save/'))throw Error();window.location.assign(r.data.data.url);}
  }catch{setError('No pudimos preparar el pase. Tu entrada original sigue disponible.');}finally{setBusy('');}};
  if(!ready.apple&&!ready.google)return null;
  return <div className="space-y-2 print:hidden"><div className="grid gap-2">{(['apple','google'] as const).filter(p=>ready[p]).map(p=><button key={p} className="btn-secondary min-h-12 flex justify-center items-center gap-2" disabled={Boolean(busy)} onClick={()=>void add(p)}>{busy===p?<Loader2 className="w-4 h-4 animate-spin" />:<Wallet className="w-4 h-4" />}Añadir a {p==='apple'?'Apple Wallet':'Google Wallet'}</button>)}</div>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}<p className="text-xs text-muted-foreground">Wallet no actualiza el estado automáticamente. La validez se comprueba en recepción.</p></div>;
}
