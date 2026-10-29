import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
type Courtesy = {
    id: string;
    status: string;
    reason: string;
    exceptionType?: string;
    agreementReference?: string;
    decisionReason?: string;
    createdAt: string;
    event: {
        name: string;
    };
    requestedBy: {
        fullName: string;
    };
    decidedBy?: {
        fullName: string;
    };
    registration: {
        id: string;
        registrationNumber: string;
        participant: {
            fullName: string;
        };
    };
};
const labels: Record<string, string> = { PENDING: 'Pendiente de autorización', APPROVED: 'Cortesía aprobada', REJECTED: 'Cortesía rechazada' };
export const CourtesyRequestsPanel: React.FC<{focusId?:string}> = ({focusId}) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentEvent } = useEdition();
    const [rows, setRows] = useState<Courtesy[]>([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState<string | null>(null);
    const [history, setHistory] = useState(false);
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const latest = useRef(0);
    const load = useCallback(async () => {
        if (!currentEvent || user?.role === 'VIEWER')
            return;
        const sequence = ++latest.current;
        try {
            const res = await api.get('/participants/courtesy-requests', { params: focusId?{id:focusId}:user?.role === 'ADMIN' && !history ? { status: 'PENDING' } : {} });
            if (sequence === latest.current) {
                setRows(res.data.data);
                setError('');
            }
        }
        catch {
            if (sequence === latest.current)
                setError('No se pudieron consultar las cortesías. Reintente para conocer el resultado real.');
        }
    }, [currentEvent?.id, user?.role, history, focusId]);
    useEffect(() => { setRows([]); setMessage(''); void load(); return () => { latest.current++; }; }, [load]);
    useRealtimeRefresh('courtesies', load);
    useEffect(() => { const listener = () => { void load(); }; window.addEventListener('eventgrid:data-refresh', listener); return () => window.removeEventListener('eventgrid:data-refresh', listener); }, [load]);
    const decide = async (id: string, decision: string) => {
        if (busy)
            return;
        setBusy(id);
        setMessage('');
        try {
            const res = await api.post(`/participants/courtesy-requests/${id}/decision`, { decision, reason: reasons[id] || undefined });
            setMessage(res.data.message);
        }
        catch (err: any) {
            setMessage(err.response?.data?.message || 'Resultado sin confirmar. Consulte la lista antes de reintentar.');
        }
        finally {
            await load();
            setBusy(null);
        }
    };
    if (!user || user.role === 'VIEWER')
        return null;
    if(!focusId&&!rows.length&&!error&&!message)return null;
    return <details open={focusId?true:undefined} className="border border-border rounded-xl bg-card p-4">
    <summary className="font-semibold cursor-pointer">{user.role === 'ADMIN' ? 'Cortesías pendientes' : 'Mis solicitudes de cortesía'} ({rows.filter(r => r.status === 'PENDING').length})</summary>
    <div className="mt-3 space-y-3">
      <button type="button" onClick={() => void load()} className="text-sm text-primary">Consultar resultado / Actualizar</button>
      {user.role === 'ADMIN' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)}/>Mostrar historial</label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
      {!error && !rows.length && <p className="text-sm text-muted-foreground">No hay solicitudes disponibles para esta cuenta y edición.</p>}
      <p className="text-xs text-muted-foreground">Historial reciente: hasta 100 solicitudes. Las pendientes no equivalen a entradas liquidadas.</p>
      {rows.map(r => <div key={r.id} className="border-t border-border pt-3 space-y-2 text-sm">
        <p className="font-semibold">{r.registration.participant.fullName} · {r.registration.registrationNumber}</p>
        <p>{r.event.name} · {r.requestedBy.fullName} · {new Date(r.createdAt).toLocaleString()}</p>
        <p className="break-words">{r.exceptionType || 'COURTESY'} · {r.reason}{r.agreementReference ? ` · Acuerdo: ${r.agreementReference}` : ''}</p><p role="status">{labels[r.status] || r.status}{r.decidedBy ? ` · ${r.decidedBy.fullName}` : ''}</p>
        {r.status === 'APPROVED' && <button type="button" className="text-primary" onClick={() => navigate('/reception', { state: { registrationId: r.registration.id } })}>Retomar registro</button>}
        {r.decisionReason && <p>{r.decisionReason}</p>}
        {user.role === 'ADMIN' && r.status === 'PENDING' && <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Motivo del rechazo ${r.registration.registrationNumber}`} placeholder="Motivo del rechazo (opcional)" value={reasons[r.id] || ''} onChange={e => setReasons(prev => ({ ...prev, [r.id]: e.target.value }))} className="bg-background border border-border rounded-lg p-2 max-w-full"/>
          <button type="button" disabled={busy !== null} onClick={() => void decide(r.id, 'APPROVED')} className="bg-primary text-primary-foreground rounded-lg px-3 py-2 disabled:opacity-50">Aprobar</button>
          <button type="button" disabled={busy !== null} onClick={() => void decide(r.id, 'REJECTED')} className="border border-border rounded-lg px-3 py-2 disabled:opacity-50">Rechazar</button>
        </div>}
      </div>)}
    </div>
  </details>;
};
