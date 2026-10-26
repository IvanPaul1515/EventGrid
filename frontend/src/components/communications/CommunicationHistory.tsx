import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../services/api';
import { useEdition } from '../../context/EditionContext';
import { useAuth } from '../../context/AuthContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { formatEmailStatus, formatTemplateName } from '../../utils/emailFormatters';
import { SendSingleEmailModal } from './SendSingleEmailModal';
export function CommunicationHistory({ registrationId, onClose }: {
    registrationId: string;
    onClose?: () => void;
}) {
    const { currentEvent } = useEdition(), { hasRole } = useAuth();
    const [data, setData] = useState<any>(null), [page, setPage] = useState(1), [error, setError] = useState(''), [loading, setLoading] = useState(false), [sending, setSending] = useState(false), [detail, setDetail] = useState<string | null>(null);
    const sequence = useRef(0);
    const load = async () => { if (!currentEvent)
        return; const id = ++sequence.current; setLoading(true); setError(''); try {
        const res = await api.get('/communications/tracking/registration/' + registrationId, { params: { eventId: currentEvent.id, page, limit: 10 } });
        if (id === sequence.current)
            setData(res.data);
    }
    catch {
        if (id === sequence.current)
            setError('No se pudo consultar el historial. Intenta nuevamente.');
    }
    finally {
        if (id === sequence.current)
            setLoading(false);
    } };
    useEffect(() => { setData(null); setPage(1); setDetail(null); setSending(false); return () => { sequence.current++; }; }, [registrationId, currentEvent?.id]);
    useEffect(() => { void load(); return () => { sequence.current++; }; }, [registrationId, currentEvent?.id, page]);
    useRealtimeRefresh('communications', load);
    const reg = data?.registration;
    const body = <section className="space-y-3 min-w-0"><div className="flex justify-between items-start gap-3"><div><h2 className="font-bold">Comunicaciones</h2>{reg && <><p>{reg.participant.fullName} · {reg.registrationNumber}</p><p className="text-xs break-all text-muted-foreground">{reg.participant.email}</p></>}</div>{onClose && <button type="button" onClick={onClose} aria-label="Cerrar comunicaciones" className="p-2">✕</button>}</div>{error && <p role="alert">{error} <button type="button" onClick={load}>Reintentar</button></p>}{loading && <p role="status">Consultando historial...</p>}{data && !error && <><p className="text-xs text-muted-foreground">{data.pagination.total} comunicaciones registradas · Ordenadas de más reciente a más antigua.</p>{data.summary && <p className="text-xs text-muted-foreground">Intentos registrados: {data.summary.totalAttempts} · Última comunicación: {data.summary.lastAttempt ? new Date(data.summary.lastAttempt).toLocaleString('es-DO') : '—'} · Plantillas: {data.summary.templates.map(formatTemplateName).join(', ') || '—'}</p>}{data.data.length === 0 ? <p>No hay comunicaciones registradas</p> : data.data.map((item: any) => <article className="p-3 rounded-xl border border-border space-y-1 break-words" key={item.source + item.id}><p className="font-semibold text-sm">{formatTemplateName(item.templateCode)} <span className="text-xs font-normal">· {formatEmailStatus(item.status).label}</span></p><p className="text-xs">{item.subject}</p><p className="text-xs text-muted-foreground">{item.date ? new Date(item.date).toLocaleString('es-DO') : 'Sin fecha'} · {item.actorName || 'Responsable no disponible'}</p><button type="button" className="text-primary text-xs underline" onClick={() => setDetail(detail === item.id ? null : item.id)}>Ver comunicación</button>{detail === item.id && <dl className="text-xs space-y-1"><dt>Destinatario</dt><dd className="break-all">{item.recipientEmail}</dd><dt>Identificador</dt><dd className="break-all">{item.messageId || item.id}</dd><dt>Procesamiento</dt><dd>{formatEmailStatus(item.status).description} · Intentos: {item.attempts}</dd>{item.errorMessage && <><dt>Motivo</dt><dd>{item.errorMessage}</dd></>}<dd className="text-muted-foreground">Se muestran metadatos guardados. El contenido histórico completo puede no estar almacenado.</dd></dl>}</article>)}<div className="flex justify-between"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>{page} / {data.pagination.totalPages}</span><button type="button" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>{hasRole(['ADMIN', 'OPERATOR']) && reg && <button type="button" className="bg-primary text-white px-3 py-2 rounded-lg" onClick={() => setSending(true)}>Enviar correo</button>}</>}{sending && reg && currentEvent && <SendSingleEmailModal isOpen registrationId={reg.id} recipientName={reg.participant.fullName} recipientEmail={reg.participant.email} eventId={currentEvent.id} onClose={() => setSending(false)} onSent={() => { void load(); }}/>}</section>;
    return onClose ? createPortal(<div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}><div role="dialog" aria-modal="true" aria-label="Comunicaciones del participante" className="h-[100dvh] w-full max-w-xl bg-card p-4 sm:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>{body}</div></div>, document.body) : body;
}
