import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../../services/api';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { formatEmailStatus, formatTemplateName } from '../../utils/emailFormatters';
export function CommunicationOverview({ compact = false }: {
    compact?: boolean;
}) {
    const { currentEvent } = useEdition(), [data, setData] = useState<any>(null), [error, setError] = useState('');
    const sequence = useRef(0);
    const load = async () => { if (!currentEvent)
        return; const id = ++sequence.current; try {
        const res = await api.get('/communications/tracking/summary', { params: { eventId: currentEvent.id } });
        if (id === sequence.current) {
            setData(res.data.data);
            setError('');
        }
    }
    catch {
        if (id === sequence.current)
            setError('No se pudo cargar el resumen de comunicaciones.');
    } };
    useEffect(() => { setData(null); setError(''); void load(); return () => { sequence.current++; }; }, [currentEvent?.id]);
    useRealtimeRefresh('communications', load);
    useRealtimeRefresh('participants', load);
    const cards = compact ? [['Aceptados', data?.accepted], ['Pendientes', data?.pending], ['Fallidos o inciertos', (data?.failed || 0) + (data?.uncertain || 0)], ['Sin entrada digital', data?.missingDigital]] : [['Intentos registrados', data?.totalAttempts], ['Aceptados por proveedor', data?.accepted], ['Pendientes', data?.pending], ['Procesando', data?.processing], ['Fallidos', data?.failed], ['Entrega incierta', data?.uncertain], ['Simulados', data?.simulated], ['Participantes únicos contactados', data?.uniqueContacted], ['Confirmados sin entrada digital', data?.missingDigital], ['Correos inválidos excluidos', data?.invalidExcluded]];
    return <section className="rounded-2xl border border-border bg-card p-4 space-y-4 min-w-0" aria-label="Resumen de comunicaciones"><div className="flex justify-between gap-2"><h2 className="font-bold">Comunicaciones</h2>{compact ? <Link className="text-primary text-xs" to="/communications">Abrir comunicaciones</Link> : <button type="button" className="text-primary text-xs" onClick={load}>Actualizar resumen</button>}</div>{error ? <p role="alert">{error} <button type="button" onClick={load}>Reintentar</button></p> : !data ? <p role="status">Cargando resumen...</p> : <><div className={`grid grid-cols-2 ${compact ? 'lg:grid-cols-4' : 'md:grid-cols-3 xl:grid-cols-5'} gap-3`}>{cards.map(([label, value]) => <div key={label} className="border border-border bg-background rounded-xl p-3 min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value ?? 0}</p></div>)}</div>{!compact && <><p className="text-xs text-muted-foreground">{data.scope}. {data.missingDefinition} Los intentos registrados incluyen simulaciones, identificadas por separado; nunca cuentan como contactos reales. Un participante contactado se cuenta una sola vez aunque tenga varios intentos. Pendientes son registros preparados, no órdenes automáticas de envío.</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[['Correos por día', data.days, 'day'], ['Distribución de estados', data.distribution.map((x: any) => ({ ...x, name: formatEmailStatus(x.status).label })), 'name'], ['Correos por plantilla', data.templates.map((x: any) => ({ ...x, name: formatTemplateName(x.name) })), 'name']].map(([title, rows, key]: any) => <div key={title} className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><ResponsiveContainer width="100%" height={220}><BarChart data={rows}><XAxis dataKey={key} tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/><Tooltip /><Bar dataKey="count" name="Comunicaciones" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div>)}<div className="min-w-0"><h3 className="text-sm font-semibold">Evolución de comunicaciones — días UTC con actividad</h3><ResponsiveContainer width="100%" height={220}><LineChart data={data.days}><XAxis dataKey="day" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/><Tooltip /><Line dataKey="count" name="Comunicaciones" stroke="hsl(var(--primary))"/></LineChart></ResponsiveContainer></div></div><h3 className="text-sm font-semibold">Últimas comunicaciones</h3>{data.recent.length ? data.recent.map((r: any) => <p key={r.source + r.id} className="text-xs break-words">{formatTemplateName(r.templateCode)} · {formatEmailStatus(r.status).label} · {r.date ? new Date(r.date).toLocaleString('es-DO') : 'Sin fecha'}</p>) : <p className="text-sm text-muted-foreground">No hay comunicaciones registradas</p>}</>}</>}</section>;
}
