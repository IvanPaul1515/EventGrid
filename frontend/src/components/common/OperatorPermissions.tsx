import {useEffect,useState} from 'react';
import {api} from '../../services/api';
export function OperatorPermissions({value,onChange,legacy=false,disabled=false}:{value?:string[];onChange:(value:string[])=>void;legacy?:boolean;disabled?:boolean}) {
 const [definitions,setDefinitions]=useState<{capabilities:Record<string,string>;profiles:Record<string,{label:string;capabilities:string[]}>}>(),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/users/capability-profiles').then(r=>{if(active)setDefinitions(r.data.data);}).catch(()=>{if(active)setError('No se pudieron consultar las plantillas. No se cambiarán los permisos existentes.');});return()=>{active=false;};},[]);
 if(error)return <p role="alert" className="text-sm text-destructive">{error}</p>;
 if(!definitions)return <p role="status" className="text-sm">Consultando permisos…</p>;
 const effective=value??(legacy?undefined:definitions.profiles.RECEPTION.capabilities);
 const selected=Object.entries(definitions.profiles).find(([,profile])=>effective&&profile.capabilities.length===effective.length&&profile.capabilities.every(c=>effective.includes(c)))?.[0]||'';
 return <fieldset disabled={disabled} className="border border-border rounded-xl p-3 space-y-3"><legend className="font-semibold text-sm">Permisos del operador</legend>
 {legacy&&value===undefined&&<p className="text-xs text-muted-foreground">Permisos heredados conservados. Selecciona una plantilla para sustituirlos expresamente.</p>}
 <label className="block text-sm">Plantilla<select className="input-field w-full mt-1" value={selected} onChange={e=>{if(e.target.value)onChange([...definitions.profiles[e.target.value].capabilities]);}}><option value="">{effective?'Permisos personalizados':'Conservar permisos existentes'}</option>{Object.entries(definitions.profiles).map(([key,profile])=><option value={key} key={key}>{profile.label}</option>)}</select></label>
 <div className="grid sm:grid-cols-2 gap-2">{Object.entries(definitions.capabilities).map(([key,label])=><label key={key} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={!effective} checked={effective?.includes(key)||false} onChange={e=>onChange(e.target.checked?[...(effective||[]),key]:(effective||[]).filter(value=>value!==key))}/>{label}</label>)}</div>
 <p className="text-xs text-muted-foreground">Las plantillas no conceden administración, estadísticas administrativas ni autorización de cortesías. Los controles también se aplican en la API.</p></fieldset>;
}
