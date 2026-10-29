import {createPortal} from 'react-dom';
import {type ReactNode,useId,useState} from 'react';

export function ReceptionTool({target,children}:{target?:HTMLElement|null;children:ReactNode}) {
  return target===undefined?<>{children}</>:target?createPortal(children,target):null;
}

export function ReceptionTools({onTarget}:{onTarget:(node:HTMLDivElement|null)=>void}) {
  const [open,setOpen]=useState(false),id=useId();
  return <aside aria-label="Herramientas de recepción" className="order-1 xl:order-2 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto self-start rounded-2xl border border-border bg-card p-3 space-y-3">
    <button type="button" className="xl:hidden w-full min-h-11 text-left font-semibold" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>Herramientas de recepción {open?'−':'+'}</button>
    <h2 className="hidden xl:block font-semibold">Herramientas de recepción</h2>
    <div id={id} className={`${open?'block':'hidden'} xl:block space-y-4`} ref={onTarget}/>
  </aside>;
}

export function ReceptionHeading({name,connected,counters}:{name?:string;connected:boolean;counters:{totalRegistrations:number;attendedCount:number;pendingCount:number}}) {
 return <header className="space-y-3"><div className="flex flex-wrap justify-between items-center gap-2"><div><p className="text-xs text-muted-foreground">{name||'Edición seleccionada'}</p><h1 className="text-2xl font-display font-bold">Recepción rápida</h1></div><span role="status" className={connected?'text-sm text-emerald-600 dark:text-emerald-400':'text-sm text-destructive'}>{connected?'En línea':'Sin conexión'}</span></div>
 <dl className="grid grid-cols-3 gap-2">{[['Registrados',counters.totalRegistrations],['Presentes',counters.attendedCount],['Pendientes de llegada',counters.pendingCount]].map(([label,value])=><div key={label} className="rounded-xl bg-card border border-border p-3 min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-bold">{value}</dd></div>)}</dl></header>;
}
