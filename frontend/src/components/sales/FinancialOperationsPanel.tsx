import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { TicketType } from '../../types';
type Pending = { id: string; registrationNumber: string; externalReference?: string; balanceDue: number; requiresReview: boolean; participant: { fullName: string } };
type Review = { id: string; code: string; reason: string; registrationId?: string };
type Refund = { id: string; status: string; version: number; amount: number; channel: string; registration: { registrationNumber: string; participant: { fullName: string } } };
type Preview = { token: string; rows: { id: string; eligible: boolean; reason: string }[] };
const nextStatuses: Record<string, string[]> = { REQUESTED: ['REVIEW', 'APPROVED', 'REJECTED'], REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['PENDING_RETURN'], PENDING_RETURN: ['REFUNDED'] };
const statusLabels: Record<string, string> = { REQUESTED: 'Solicitado', REVIEW: 'En revisión', APPROVED: 'Aprobado', REJECTED: 'Rechazado', PENDING_RETURN: 'Pendiente de devolución', REFUNDED: 'Devuelto y confirmado' };
export function FinancialOperationsPanel({ eventId, tickets, onChange }: { eventId: string; tickets: TicketType[]; onChange: () => void }) {
  const [pending, setPending] = useState<Pending[]>([]), [reviews, setReviews] = useState<Review[]>([]), [refunds, setRefunds] = useState<Refund[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState(''), [deadline, setDeadline] = useState(''), [ticket, setTicket] = useState('');
  const [platform, setPlatform] = useState(''), [reference, setReference] = useState(''), [method, setMethod] = useState('');
  const [paymentId, setPaymentId] = useState(''), [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [action, setAction] = useState<{ path: string; body: Record<string, unknown>; label: string } | null>(null);
  const sequence = useRef(0), requestKey = useRef(crypto.randomUUID());
  const base = `/events/${eventId}/finance`;
  const load = useCallback(async () => {
    const version = ++sequence.current;
    try {
      const [p, r, f, settings] = await Promise.all([...['pending', 'reviews', 'refunds'].map(path => api.get(`/events/${eventId}/finance/${path}`)), api.get(`/events/${eventId}`)]);
      if (version === sequence.current) { setPending(p.data.data); setReviews(r.data.data); setRefunds(f.data.data); const d = settings.data.data?.settings?.paymentDeadlineAt; setDeadline(d ? new Date(new Date(d).getTime() - 4 * 3600000).toISOString().slice(0, 16) : ''); }
    } catch { if (version === sequence.current) setMessage('No se pudo consultar el estado financiero. Reintente antes de operar.'); }
  }, [eventId]);
  useEffect(() => { setPending([]); setReviews([]); setRefunds([]); setSelected([]); setPreview(null); setAction(null); setMessage(''); void load(); return () => { sequence.current++; }; }, [load]);
  useRealtimeRefresh('sales', load);
  const execute = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      if (reason.trim().length < 3) throw new Error('Indique un motivo de al menos tres caracteres.');
      if (action.path === '/deadline') await api.put(base + action.path, { ...action.body, reason });
      else await api.post(base + action.path, { ...action.body, reason, confirmed: true });
      setMessage('Operación registrada. No se ha enviado correo ni ejecutado una transferencia.');
      setAction(null); setPreview(null); setSelected([]); requestKey.current = crypto.randomUUID();
      await load(); onChange();
    } catch (error: any) { setMessage(error.response?.data?.message || error.message || 'Resultado sin confirmar; consulte el estado antes de repetir.'); }
    finally { setBusy(false); }
  };
  const preparePreview = async () => {
    if (busy) return; setBusy(true); setMessage(''); setPreview(null);
    try { const res = await api.post(base + '/nonpayment/preview', { ids: selected }); setPreview(res.data.data); }
    catch (error: any) { setMessage(error.response?.data?.message || 'No se pudo obtener la vista previa.'); }
    finally { setBusy(false); }
  };
  return <details className="card p-4 space-y-3">
    <summary className="font-semibold cursor-pointer">Revisión administrativa de pagos y devoluciones</summary>
    <p className="text-sm text-muted-foreground">Los vencimientos no cancelan entradas automáticamente. Los reembolsos registran decisiones y devoluciones realizadas fuera de EventGrid.</p>
    <button type="button" onClick={() => void load()} disabled={busy} className="btn-secondary">Actualizar estado</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    <label className="block text-sm">Motivo de la operación<input className="input-field text-base" value={reason} maxLength={1500} onChange={e => { setReason(e.target.value); setAction(null); }} /></label>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-sm">Fecha límite · Santo Domingo<input type="datetime-local" className="input-field text-base" value={deadline} onChange={e => { setDeadline(e.target.value); setAction(null); }} /></label>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setAction({ path: '/deadline', body: { paymentDeadlineAt: deadline ? new Date(deadline + ':00-04:00').toISOString() : null }, label: deadline ? 'Guardar fecha límite de pago' : 'Retirar fecha límite de pago' })}>Revisar fecha límite</button>
    </div>
    <h3 className="font-semibold">Pendientes ({pending.length})</h3>
    <div className="max-h-64 overflow-auto space-y-2">{pending.map(p => <label key={p.id} className="flex gap-2 border-t border-border pt-2 text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(p.id)} onChange={e => { setPreview(null); setAction(null); setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id)); }} /><span>{p.participant.fullName} · {p.registrationNumber} · {p.externalReference || 'Sin referencia externa'} · RD$ {Number(p.balanceDue).toFixed(2)}{p.requiresReview ? ' · Requiere revisión individual' : ''}</span></label>)}</div>
    <button type="button" className="btn-secondary" disabled={busy || !selected.length || selected.length > 100} onClick={() => void preparePreview()}>Previsualizar cancelación por impago (máximo 100)</button>
    {preview && <div className="space-y-2 text-sm">{preview.rows.map(r => <p key={r.id}>{pending.find(p => p.id === r.id)?.registrationNumber}: {r.eligible ? 'Elegible' : 'Excluido'} · {r.reason}</p>)}<button type="button" className="btn-secondary" disabled={busy || !preview.rows.some(r => r.eligible)} onClick={() => setAction({ path: '/nonpayment/cancel', body: { token: preview.token }, label: 'Cancelar únicamente las entradas elegibles de esta vista previa' })}>Revisar cancelación</button></div>}
    <h3 className="font-semibold">Discrepancias ({reviews.length})</h3>
    <p className="text-xs text-muted-foreground">Asignar una tarifa o vincular una fuente no acredita dinero. Después de resolver, vuelva a importar la fuente para conciliar.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-sm">Tarifa para revisión<select className="input-field text-base" value={ticket} onChange={e => { setTicket(e.target.value); setAction(null); }}><option value="">Sin asignación de tarifa</option>{tickets.filter(t => t.isActive && Number(t.price) > 0).map(t => <option key={t.id} value={t.id}>{t.name} · {Number(t.price).toFixed(2)}</option>)}</select></label>
      <label className="text-sm">Plataforma confirmada<input className="input-field text-base" value={platform} maxLength={100} onChange={e => { setPlatform(e.target.value); setAction(null); }} /></label>
      <label className="text-sm">Referencia confirmada<input className="input-field text-base" value={reference} maxLength={250} onChange={e => { setReference(e.target.value); setAction(null); }} /></label>
    </div>
    {reviews.map(r => <div key={r.id} className="border-t border-border pt-2 text-sm"><p>{r.code} · {r.reason}</p><button type="button" className="btn-secondary" disabled={busy} onClick={() => setAction({ path: `/reviews/${r.id}/resolve`, body: { ...(r.code === 'AMBIGUOUS_TARIFF' ? { ticketTypeId: ticket } : {}), ...(r.code === 'SOURCE_ASSOCIATION' ? { externalPlatform: platform, externalReference: reference } : {}) }, label: 'Resolver esta discrepancia con el motivo y datos indicados' })}>Revisar resolución</button></div>)}
    <h3 className="font-semibold">Solicitar devolución</h3>
    <p className="text-xs text-muted-foreground">Use el identificador del pago que aparece en la ficha financiera. Nunca se ejecuta un movimiento bancario.</p>
    <div className="grid sm:grid-cols-2 gap-2"><label className="text-sm">Identificador del pago<input className="input-field text-base" value={paymentId} onChange={e => { setPaymentId(e.target.value); requestKey.current = crypto.randomUUID(); setAction(null); }} /></label><label className="text-sm">Importe RD$<input className="input-field text-base" type="number" min="0.01" step="0.01" value={amount} onChange={e => { setAmount(e.target.value); requestKey.current = crypto.randomUUID(); setAction(null); }} /></label></div>
    <button type="button" className="btn-secondary" disabled={busy || !paymentId || !(Number(amount) > 0)} onClick={() => setAction({ path: '/refunds', body: { paymentId, amount: Number(amount), requestKey: requestKey.current }, label: 'Registrar solicitud de devolución, sin devolver dinero' })}>Revisar solicitud</button>
    <div className="grid sm:grid-cols-2 gap-2"><label className="text-sm">Referencia de devolución realizada<input className="input-field text-base" value={reference} onChange={e => { setReference(e.target.value); setAction(null); }} /></label><label className="text-sm">Método de devolución<input className="input-field text-base" value={method} onChange={e => { setMethod(e.target.value); setAction(null); }} /></label></div>
    {refunds.map(r => <div key={r.id} className="border-t border-border pt-2 text-sm space-y-2"><p>{r.registration.participant.fullName} · {r.registration.registrationNumber} · {r.channel} · RD$ {Number(r.amount).toFixed(2)} · {statusLabels[r.status] || r.status}</p><div className="flex flex-wrap gap-2">{(nextStatuses[r.status] || []).map(status => <button type="button" className="btn-secondary" disabled={busy} key={status} onClick={() => setAction({ path: `/refunds/${r.id}/transition`, body: { status, version: r.version, reference, method }, label: status === 'REFUNDED' ? 'Confirmar que la devolución ya fue realizada fuera de EventGrid; no basta con haberla aprobado' : `Cambiar a: ${statusLabels[status]}` })}>{statusLabels[status]}</button>)}</div></div>)}
    {action && <div className="border border-border rounded-lg p-4 space-y-3" role="alert"><p>{action.label}</p><p className="text-sm">Motivo: {reason || 'Obligatorio'}</p><div className="flex gap-2"><button type="button" className="btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => void execute()}>Confirmar operación</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => setAction(null)}>Volver</button></div></div>}
  </details>;
}
