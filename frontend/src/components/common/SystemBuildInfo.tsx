import React,{useEffect,useState} from 'react';
import {api} from '../../services/api';
import {frontendBuild} from '../../utils/buildInfo';
import type {BuildMetadata} from '../../../../scripts/build-info.mjs';
export function SystemBuildInfo() {
 const [backend,setBackend]=useState<BuildMetadata|null>(null);
 const [unavailable,setUnavailable]=useState(false);
 useEffect(()=>{let active=true;api.get('/health').then(r=>{if(active){setBackend(r.data.build||null);setUnavailable(!r.data.build);}}).catch(()=>{if(active)setUnavailable(true);});return()=>{active=false;};},[]);
 const row=(name:string,info:BuildMetadata)=><div><dt className="font-semibold">{name} · {info.version}</dt><dd className="break-words">Commit: <span title={info.commit}>{info.commit.slice(0,12)}</span> · {info.environment}<br/>Build: {info.builtAt}</dd></div>;
 return <details className="rounded-xl border border-border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Información del sistema</summary><dl className="grid gap-3 pt-3 sm:grid-cols-2">{row('Frontend',frontendBuild)}{backend?row('Backend',backend):<div>{unavailable?'Versión del backend no disponible.':'Consultando versión del backend…'}</div>}</dl></details>;
}
