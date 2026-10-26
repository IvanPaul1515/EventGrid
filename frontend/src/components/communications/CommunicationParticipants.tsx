import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { CommunicationHistory } from './CommunicationHistory';
import { SendSingleEmailModal } from './SendSingleEmailModal';
import { formatEmailStatus, formatTemplateName } from '../../utils/emailFormatters';
const filters = [['ALL', 'Todos'], ['NONE', 'Sin comunicaciones'], ['ACCEPTED', 'Con correo aceptado'], ['PENDING', 'Pendientes'], ['FAILED', 'Fallidos'], ['UNCERTAIN', 'Resultado incierto'], ['DIGITAL', 'Con entrada digital aceptada'], ['MISSING_DIGITAL', 'Confirmados sin entrada digital'], ['COURTESY', 'Cortesías'], ['CONFIRMED', 'Confirmados'], ['UNPAID', 'Pendientes de pago']];
export function CommunicationParticipants({ initialTemplate = 'DIGITAL_TICKET' }: {
    initialTemplate?: string;
}) {
    const { currentEvent } = useEdition(), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [filter, setFilter] = useState('ALL'), [page, setPage] = useState(1), [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [history, setHistory] = useState<string | null>(null), [send, setSend] = useState<any>(null);
    const seq = useRef(0);
    useEffect(() => { const timer = setTimeout(() => { setTerm(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
    useEffect(() => { setData(null); setHistory(null); setSend(null); setPage(1); setSearch(''); setTerm(''); }, [currentEvent?.id]);
    const load = async () => { if (!currentEvent)
        return; const id = ++seq.current; setLoading(true); setError(''); try {
        const res = await api.get('/communications/tracking/participants', { params: { eventId: currentEvent.id, search: term, filter, page, limit: 15 } });
        if (id === seq.current)
            setData(res.data);
    }
    catch {
        if (id === seq.current)
            setError('No se pudieron consultar los participantes.');
    }
    finally {
        if (id === seq.current)
            setLoading(false);
    } };
    useEffect(() => { void load(); return () => { seq.current++; }; }, [currentEvent?.id, term, filter, page]);
    useRealtimeRefresh('communications', load);
    useRealtimeRefresh('participants', load);
    return <section className="space-y-3 min-w-0"><div className="flex flex-col sm:flex-row gap-2"><input aria-label="Buscar participantes para comunicaciones" placeholder="Nombre, apellidos, correo, cédula o registro" className="bg-card border border-border rounded-lg p-3 text-base min-w-0 flex-1" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="Estado de comunicación" className="bg-card border border-border rounded-lg p-3 text-base min-w-0" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>{filters.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div><p className="text-xs text-muted-foreground">Selecciona un participante para usar la plantilla {formatTemplateName(initialTemplate)}. Solo las plantillas autorizadas para tu rol están disponibles.</p>{error && <p role="alert">{error} <button type="button" onClick={load}>Reintentar</button></p>}{loading && <p role="status">Consultando participantes...</p>}{data && !error && <><div role="table" aria-label="Participantes y comunicaciones" className="rounded-xl border border-border divide-y divide-border">{data.data.map((r: any) => <div key={r.id} role="row" className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center"><div role="cell"><p className="font-semibold text-sm">{r.fullName}</p><p className="font-mono text-xs">{r.registrationNumber}</p></div><p role="cell" className="text-xs break-all">{r.email}</p><div role="cell" className="text-xs"><p>{r.lastStatus ? formatEmailStatus(r.lastStatus).label : 'Sin comunicaciones'}</p>{r.lastTemplate && <p>{formatTemplateName(r.lastTemplate)}</p>}{r.lastAttempt && <p>{new Date(r.lastAttempt).toLocaleString('es-DO')}</p>}</div><div role="cell" className="flex gap-3 text-xs"><button type="button" className="text-primary min-h-11" onClick={() => setHistory(r.id)}>Ver historial</button><button type="button" className="text-primary min-h-11" onClick={() => setSend(r)}>Vista previa / Enviar</button></div></div>)}{data.data.length === 0 && <p className="p-4 text-sm">No hay participantes para estos filtros.</p>}</div><div className="flex justify-between text-sm"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>Anterior</button><span>{page} / {data.pagination.totalPages} · {data.pagination.total} registros</span><button type="button" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage(v => v + 1)}>Siguiente</button></div></>}{history && <CommunicationHistory registrationId={history} onClose={() => setHistory(null)}/>}{send && currentEvent && <SendSingleEmailModal isOpen registrationId={send.id} recipientName={send.fullName} recipientEmail={send.email} eventId={currentEvent.id} initialTemplate={initialTemplate} onClose={() => setSend(null)} onSent={load}/>}</section>;
}
