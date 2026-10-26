import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { api } from '../../services/api';
type Overview = {
    connectedOperators: {
        id: string;
        fullName: string;
    }[];
    entriesByOperator: {
        operator: string;
        count: number;
    }[];
    recentEntries: {
        registrationNumber: string;
        attendedAt: string;
        participant: {
            fullName: string;
        };
        attendedByUser?: {
            fullName: string;
        };
    }[];
    pendingCourtesies: number;
    recordedErrors: {
        action: string;
        at: string;
    }[];
    errorScope: string;
};
export const ReceptionOverview: React.FC = () => {
    const { user } = useAuth();
    const { currentEvent } = useEdition();
    const latest = useRef(0);
    const [open, setOpen] = useState(false), [data, setData] = useState<Overview | null>(null), [error, setError] = useState('');
    const load = useCallback(async () => { if (!open || user?.role !== 'ADMIN')
        return; const sequence = ++latest.current; try {
        const res = await api.get('/attendance/operations');
        if (sequence === latest.current) {
            setData(res.data.data);
            setError('');
        }
    }
    catch {
        if (sequence === latest.current)
            setError('No se pudo consultar el estado de recepción.');
    } }, [open, user?.role, currentEvent?.id]);
    useEffect(() => { setData(null); void load(); return () => { latest.current++; }; }, [load]);
    useRealtimeRefresh('operations', load);
    if (user?.role !== 'ADMIN')
        return null;
    return <details onToggle={e => setOpen(e.currentTarget.open)} className="p-4 border border-border rounded-xl bg-card">
    <summary className="font-semibold cursor-pointer">Supervisión de recepción</summary>
    <div className="mt-3 space-y-3 text-sm"><button type="button" onClick={() => void load()} className="text-primary">Actualizar estado</button>{error && <p role="alert">{error}</p>}
      {data && <><p>Operadores con conexión SSE: {data.connectedOperators.length}. Esto no indica presencia física ni actividad operativa.</p><p>{data.connectedOperators.map(u => u.fullName).join(', ') || 'Sin conexiones identificadas'}</p>
        <p>Cortesías pendientes: {data.pendingCourtesies}</p><p>Ingresos registrados por responsable: {data.entriesByOperator.map(o => `${o.operator}: ${o.count}`).join(' · ') || 'Sin ingresos'}</p>
        <ul>{data.recentEntries.map(r => <li key={r.registrationNumber}>{r.participant.fullName} · {r.registrationNumber} · {new Date(r.attendedAt).toLocaleTimeString()} · {r.attendedByUser?.fullName || 'Sin responsable'}</li>)}</ul>
        <p>Errores auditados recientes: {data.recordedErrors.length}</p><p className="text-xs text-muted-foreground">{data.errorScope}</p></>}
    </div>
  </details>;
};
