import {useState} from 'react';
import {useReceptionQueue} from './ReceptionQueueContext';
import {useAuth} from '../../context/AuthContext';
import {useEdition} from '../../context/EditionContext';
import {ScannerDialog} from './ScannerDialog';
export function QueueSuggestion(){
 const q=useReceptionQueue(),{token}=useAuth(),{currentEvent}=useEdition();
 const key=`eventgrid:queue-suggestion:${currentEvent?.id}:${token?.slice(-24)}`;
 const [dismissed,setDismissed]=useState(()=>{try{return sessionStorage.getItem(key)==='dismissed';}catch{return false;}}),[station,setStation]=useState('');
 const dismiss=()=>{setDismissed(true);try{sessionStorage.setItem(key,'dismissed');}catch{}};
 if(dismissed||!q.stations.length||q.state.device||q.scannerOpen)return null;
 return <ScannerDialog label="Computadora disponible" onCancel={dismiss}><h2 className="text-xl font-bold">Computadora disponible</h2><p>Hemos detectado una estación de recepción disponible. Puedes vincular este teléfono como escáner QR o seguir utilizando EventGrid normalmente.</p>{q.stations.length>1&&<label className="block space-y-2">Estación<select className="input-field" value={station||q.stations[0].id} onChange={e=>setStation(e.target.value)}>{q.stations.map(s=><option key={s.id} value={s.id}>{s.label} · Recepción por cola</option>)}</select></label>}<div className="grid gap-3"><button className="btn-primary" disabled={q.pending} onClick={()=>{dismiss();q.setScannerOpen(true);void q.act('/request',{stationId:station||q.stations[0].id}).catch(()=>{});}}>Vincular como escáner</button><button className="btn-secondary" onClick={dismiss}>Continuar normalmente</button></div></ScannerDialog>;
}
