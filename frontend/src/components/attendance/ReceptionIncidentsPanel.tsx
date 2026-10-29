import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { api } from '../../services/api';
type Incident = {
    id: string;
    participantLabel: string;
    description: string;
    category: string;
    status: string;
    resolution?: string;
    createdAt: string;
    createdBy: {
        fullName: string;
    };
    assignedTo?: {
        fullName: string;
    };
};
const categories: Record<string, string> = { NOT_FOUND: 'Participante no encontrado', EMAIL: 'Correo incorrecto', PAYMENT: 'Entrada pendiente de pago', QR: 'QR inválido', DUPLICATE: 'Registro duplicado', SHIRT: 'Problema con camiseta', ADMIN: 'Asistencia administrativa', OTHER: 'Otro problema' };
const labels: Record<string, string> = { OPEN: 'Abierta', REVIEW: 'En revisión', RESOLVED: 'Resuelta', CANCELLED: 'Cancelada' };
export const ReceptionIncidentsPanel: React.FC<{focusId?:string}> = ({focusId}) => {
    const { user } = useAuth(), { currentEvent } = useEdition();
    const [rows, setRows] = useState<Incident[]>([]), [subject, setSubject] = useState(''), [description, setDescription] = useState(''), [category, setCategory] = useState('OTHER'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [resolutions, setResolutions] = useState<Record<string, string>>({});
    const key = useRef(crypto.randomUUID()), sequence = useRef(0);
    const load = useCallback(async (search?: string) => { if (user?.role === 'VIEWER')
        return; const n = ++sequence.current; try {
        const res = await api.get('/attendance/incidents', { params: focusId?{id:focusId}:search ? { search } : {} });
        if (n === sequence.current)
            setRows(res.data.data);
    }
    catch {
        if (n === sequence.current)
            setMessage('No se pudo consultar el resultado de las incidencias.');
    } }, [currentEvent?.id, user?.role, focusId]);
    useEffect(() => { setRows([]); void load(); return () => { sequence.current++; }; }, [load]);
    useRealtimeRefresh('incidents', () => load());
    const create = async (e: React.FormEvent) => { e.preventDefault(); if (busy)
        return; setBusy(true); try {
        const res = await api.post('/attendance/incidents', { requestKey: key.current, participantLabel: subject, description, category });
        setMessage(res.data.message);
        key.current = crypto.randomUUID();
        setSubject('');
        setDescription('');
    }
    catch (err: any) {
        setMessage(err.response?.data?.message || 'Resultado sin confirmar: consulte la lista antes de reintentar.');
    }
    finally {
        await load();
        setBusy(false);
    } };
    const decide = async (id: string, status: string) => { if (busy)
        return; setBusy(true); try {
        await api.patch('/attendance/incidents/' + id, { status, resolution: resolutions[id] || undefined });
        setMessage('Incidencia actualizada.');
    }
    catch (err: any) {
        setMessage(err.response?.data?.message || 'Resultado sin confirmar. Consulte la lista.');
    }
    finally {
        await load();
        setBusy(false);
    } };
    if (!user || user.role === 'VIEWER')
        return null;
    return <details open={focusId?true:undefined} className={rows.length||focusId?"p-4 border border-border rounded-xl bg-card":"text-sm"}><summary className="font-semibold cursor-pointer">{focusId?'Incidencia seleccionada':rows.length?`Incidencias de recepción (${rows.filter(r => ['OPEN', 'REVIEW'].includes(r.status)).length})`:'Abrir / gestionar incidencias de recepción'}</summary><div className="mt-3 space-y-3 text-sm">{message && <p role="status">{message}</p>}<p className="text-xs text-muted-foreground">Abra una incidencia solo si necesita intervención. No modifica pagos, cortesías ni asistencia.</p>{!focusId&&<form onSubmit={create} className="space-y-2"><label className="block">Participante o referencia mínima<input required minLength={2} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} className="w-full p-2 bg-background border border-border rounded-lg"/></label><button type="button" onClick={() => void load(subject)} className="text-primary">Buscar coincidencias</button><label className="block">Categoría<select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 bg-background border border-border rounded-lg">{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block">Descripción<textarea required minLength={3} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 bg-background border border-border rounded-lg"/></label><button disabled={busy} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg">Abrir incidencia</button></form>}<button type="button" onClick={() => void load()} className="text-primary">Consultar resultado / Actualizar</button><p className="text-xs text-muted-foreground">Hasta 100 incidencias recientes de esta edición.</p>{rows.map(r => <article key={r.id} className="border-t border-border pt-3 space-y-2"><p className="font-semibold">{r.participantLabel} · {categories[r.category]}</p><p className="break-words">{r.description}</p><p>{labels[r.status]} · {r.createdBy.fullName} · {new Date(r.createdAt).toLocaleString()}</p>{r.assignedTo && <p>Responsable: {r.assignedTo.fullName}</p>}{r.resolution && <p>Resolución: {r.resolution}</p>}{user.role === 'ADMIN' && ['OPEN', 'REVIEW'].includes(r.status) && <div className="flex flex-wrap gap-2"><input aria-label={'Resolución ' + r.participantLabel} placeholder="Solución aplicada" value={resolutions[r.id] || ''} onChange={e => setResolutions(prev => ({ ...prev, [r.id]: e.target.value }))} className="p-2 bg-background border border-border rounded-lg max-w-full"/>{[['REVIEW', 'En revisión'], ['RESOLVED', 'Resolver'], ['CANCELLED', 'Cancelar']].map(([status, label]) => <button key={status} type="button" disabled={busy} onClick={() => void decide(r.id, status)} className="px-3 py-2 border border-border rounded-lg">{label}</button>)}</div>}</article>)}</div></details>;
};
