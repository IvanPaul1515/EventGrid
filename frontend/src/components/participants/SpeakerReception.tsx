import {useEffect,useState} from 'react';
import {api} from '../../services/api';
import {useEdition} from '../../context/EditionContext';
export function SpeakerReception({registrationId,attended}:{registrationId:string;attended:boolean}){
 const {currentEvent}=useEdition(),[speaker,setSpeaker]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setSpeaker(null);setError('');api.get(`/events/${currentEvent?.id}/speakers/registration/${registrationId}`).then(r=>{if(active)setSpeaker(r.data.data);}).catch(()=>{if(active)setError('No se pudieron consultar las charlas del charlista.');});return()=>{active=false;};},[currentEvent?.id,registrationId]);
 return <section className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2"><strong className="text-primary">CHARLISTA</strong><p>Estado de llegada: {attended?'Presente':speaker?.arrivalStatus==='INCIDENT'?'Incidencia':'No ha llegado'}</p>{error&&<p role="alert">{error}</p>}{speaker?.credentialRevokedAt&&<p className="text-destructive">Credencial revocada</p>}{speaker?.talks?.map((t:any)=><p key={t.id} className="text-sm break-words">{t.title} · {t.day||'Fecha pendiente'} · {t.startTime&&t.endTime?`${t.startTime}–${t.endTime}`:'Horario pendiente'} · {t.room||'Salón pendiente'}</p>)}{speaker&&speaker.talks.length===0&&<p className="text-sm">Sin charlas asociadas todavía.</p>}</section>;
}
