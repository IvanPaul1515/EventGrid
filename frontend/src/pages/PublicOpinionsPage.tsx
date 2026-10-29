import {useEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import axios from 'axios';
import {api} from '../services/api';
import {resolveImageUrl} from '../utils/imageUrl';
type Question={id:string;label:string;type:'RATING'|'TEXT'|'YES_NO';kind:'EVENT'|'ABSENCE'};
// Public responses never use the authenticated client, cookies, participant IDs or local-storage identity.
const publicApi=axios.create({baseURL:api.defaults.baseURL,timeout:30000,withCredentials:false});
export default function PublicOpinionsPage(){
 const {key}=useParams(),[data,setData]=useState<{name:string;appearance?:{logoUrl?:string;primaryColor?:string};questions:Question[];categories:string[]}>(),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0);
 const [mode,setMode]=useState<'EVENT'|'ABSENCE'|'SUGGESTION'>('EVENT'),[answers,setAnswers]=useState<Record<string,string|number|boolean>>({}),[text,setText]=useState(''),[category,setCategory]=useState('Organización'),[website,setWebsite]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [online,setOnline]=useState(navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const lock=useRef(false),responseId=useRef(crypto.randomUUID()),suggestionId=useRef(crypto.randomUUID());
 useEffect(()=>{const controller=new AbortController();setData(undefined);setLoadError('');setAnswers({});setMessage('');setError('');responseId.current=crypto.randomUUID();suggestionId.current=crypto.randomUUID();publicApi.get('/public/opinions/'+encodeURIComponent(key||''),{signal:controller.signal}).then(r=>setData(r.data.data)).catch(e=>{if(!controller.signal.aborted)setLoadError(e.response?.status===404?'La encuesta no está disponible.':'No se pudo conectar. Intenta nuevamente.');});return()=>controller.abort();},[key,attempt]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('');setError('');
  try{
   if(mode==='SUGGESTION')await publicApi.post(`/public/opinions/${key}/suggestions`,{id:suggestionId.current,category,text,website});
   else await publicApi.post(`/public/opinions/${key}/responses`,{id:responseId.current,kind:mode,answers:Object.fromEntries(Object.entries(answers).filter(([id])=>data?.questions.some(q=>q.id===id&&q.kind===mode))),website});
   setMessage('Gracias. Tu opinión fue recibida.');if(mode==='SUGGESTION'){setText('');suggestionId.current=crypto.randomUUID();}else{setAnswers({});responseId.current=crypto.randomUUID();}
  }catch(e:any){setError(e.response?.status===429?'Espera un minuto antes de volver a enviar.':e.response?.status===400?'Revisa las respuestas y las preguntas disponibles.':'No se pudo confirmar el envío. Conservamos tus respuestas; puedes reintentar.');}finally{lock.current=false;setBusy(false);}
 };
 const color=data?.appearance?.primaryColor;
 return <main className="min-h-[100dvh] bg-background text-foreground p-4 pt-safe pb-safe" style={color&&/^#[\da-f]{6}$/i.test(color)?{'--opinion-color':color} as React.CSSProperties:undefined}><div className="max-w-2xl mx-auto space-y-5 py-6">
 <header className="space-y-2">{data?.appearance?.logoUrl&&<img className="max-h-20 max-w-56 object-contain" src={resolveImageUrl(data.appearance.logoUrl)} alt={data.name}/>}<p className="font-bold tracking-wider text-sm">EVENTGRID</p><h1 className="text-2xl font-bold">¡Queremos escuchar tu opinión!</h1><p>{data?.name}</p></header>
 <p className="text-sm text-muted-foreground">Participación voluntaria y anónima. No necesitas una cuenta, correo ni entrada. No vinculamos las respuestas con participantes. Los controles antispam no garantizan una respuesta única por persona.</p>
 {loadError?<section role="alert"><p>{loadError}</p><button className="btn-secondary mt-3" onClick={()=>setAttempt(v=>v+1)}>Reintentar</button></section>:!data?<p role="status">Consultando encuesta…</p>:<>
 <nav aria-label="Tipo de opinión" className="flex flex-wrap gap-2">{([['EVENT','Encuesta'],['SUGGESTION','Solo una sugerencia'],['ABSENCE','No asistí']] as const).map(([value,label])=><button disabled={busy} type="button" aria-pressed={mode===value} key={value} className={mode===value?'btn-primary':'btn-secondary'} onClick={()=>{setMode(value);setMessage('');setError('');}}>{label}</button>)}</nav>
 <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-4">
 <label aria-hidden="true" className="hidden">Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
 {mode==='SUGGESTION'?<><label className="block">Categoría<select className="input-field w-full mt-2" value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>{data.categories.map(value=><option key={value}>{value}</option>)}</select></label><label className="block">Sugerencia<textarea required minLength={5} maxLength={3000} className="input-field w-full mt-2" rows={5} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/></label></>:data.questions.filter(q=>q.kind===mode).map(q=><fieldset key={q.id} disabled={busy} className="space-y-2"><legend className="font-semibold">{q.label}</legend>{q.type==='TEXT'?<textarea className="input-field w-full" rows={3} maxLength={2000} value={String(answers[q.id]??'')} onChange={e=>setAnswers(old=>({...old,[q.id]:e.target.value}))}/>:<div className="flex flex-wrap gap-2">{(q.type==='RATING'?[1,2,3,4,5]:[true,false]).map(value=><label key={String(value)} className="border border-border rounded-xl p-3 flex items-center gap-2"><input type="radio" name={q.id} checked={answers[q.id]===value} onChange={()=>setAnswers(old=>({...old,[q.id]:value}))}/>{typeof value==='boolean'?value?'Sí':'No':value}</label>)}</div>}</fieldset>)}
 {mode==='ABSENCE'&&<p className="text-sm text-muted-foreground">Comparte únicamente el motivo que desees. Esta respuesta no se vincula a una inscripción ni acredita una ausencia.</p>}
 <p className="text-xs text-muted-foreground">Las respuestas y sugerencias son privadas para el equipo autorizado. Las preguntas son opcionales; comparte al menos una respuesta.</p>
 <button type="submit" className="btn-primary w-full min-h-12" style={color&&/^#[\da-f]{6}$/i.test(color)?{backgroundColor:color}:undefined} disabled={busy||!online}>{busy?'Enviando…':'Enviar opinión'}</button>
 {!online&&<p role="alert">Sin conexión. Reconéctate antes de enviar.</p>}{message&&<p role="status" className="text-primary">{message}</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}
 </form></>}
 </div></main>;
}
