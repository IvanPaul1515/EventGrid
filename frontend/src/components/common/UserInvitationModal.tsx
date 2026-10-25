import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { invitationLabel, roleLabel } from '../../utils/invitationStatus';
import { UserItem } from '../../services/users.service';
export function UserInvitationModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<UserItem[]>([]); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [reinvite, setReinvite] = useState(false); const [results, setResults] = useState<any[] | null>(null);
  const lock = useRef(false); const requestKey = useRef(crypto.randomUUID());
  useEffect(() => { let active = true; api.post('/users/invitations/selection', { userIds: ids }).then(response => { if (active) setUsers(response.data.data); }).catch(() => { if (active) setError('No fue posible validar la selección. Cierre y vuelva a preparar el lote.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const eligible = users.filter(user => reinvite || user.accountStatus !== 'ACTIVE');
  const valid = users.length === new Set(ids).size && users.every(user => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email));
  const send = async () => {
    if (lock.current || !valid) return; lock.current = true; setBusy(true); setError('');
    try {
      const response = await api.post('/users/invitations/send', { userIds: eligible.map(user => user.id), requestKey: requestKey.current, reinvite, confirmed: true });
      setResults(response.data.data.results); onSaved();
    } catch (failure: any) { setError(failure.response?.data?.message || 'No se confirmó el resultado. Reintentar esta misma confirmación consulta el mismo lote y evita duplicarlo.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Confirmar invitaciones" className="bg-card border border-border rounded-2xl p-5 w-full max-w-xl max-h-[90dvh] overflow-y-auto space-y-4">
    <h2 className="text-lg font-bold">{results ? 'Resultado de invitaciones' : `¿Enviar invitaciones a ${ids.length} usuarios?`}</h2>
    {loading && <p role="status">Validando destinatarios...</p>}
    {!loading && !valid && <p role="alert" className="text-sm text-destructive">La selección cambió o contiene correos inválidos. Cierre el diálogo y prepare nuevamente el lote.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="space-y-3 text-sm">{users.map(user => <li className="border border-border rounded-xl p-3 break-words" key={user.id}>
      <strong>{user.fullName}</strong><p>{user.email} · {roleLabel(user.role)}</p><p className="text-xs text-muted-foreground">{invitationLabel(results?.find(item => item.userId === user.id)?.status || user.invitationState)}</p>
      {user.invitation?.expiresAt && <p className="text-xs text-muted-foreground">Vence: {new Date(user.invitation.expiresAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</p>}
      {!results && user.accountStatus === 'ACTIVE' && !reinvite && <p className="text-xs text-muted-foreground">Se excluirá: cuenta ya activada.</p>}
      {results?.find(item => item.userId === user.id)?.reason && <p className="text-xs text-muted-foreground">{results.find(item => item.userId === user.id).reason}</p>}
    </li>)}</ul>
    {!results && <label className="flex items-start gap-3 text-xs"><input className="w-5 h-5 shrink-0 accent-primary" type="checkbox" disabled={busy} checked={reinvite} onChange={e => { setReinvite(e.target.checked); requestKey.current = crypto.randomUUID(); }} /><span>Autorizar reinvitación de cuentas activadas o con enlace vigente. Se invalidarán los enlaces anteriores; las contraseñas actuales no cambian hasta que el destinatario use el nuevo enlace.</span></label>}
    <p className="text-xs text-muted-foreground">{results ? 'Aceptado por el proveedor no significa recibido en la bandeja de entrada. Sin proveedor habilitado no se intenta enviar.' : `${eligible.length} destinatarios incluidos. Un enlace vigente no se reenvía sin autorizar reinvitación. Una confirmación autoriza únicamente esta selección.`}</p>
    <div className="mobile-form-actions flex flex-wrap justify-end gap-3 py-2"><button disabled={busy} onClick={onClose}>{results ? 'Cerrar' : 'Cancelar'}</button>{!results && <button disabled={busy || loading || !valid || !eligible.length} onClick={() => { void send(); }} className="px-4 py-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Procesando...' : 'Confirmar envío'}</button>}</div>
  </section></div>, document.body);
}
export function InvitationHistory({ user, onClose }: { user: UserItem; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; api.get(`/users/${user.id}/invitations`).then(response => { if (active) setItems(response.data.data); }).catch(() => { if (active) setError('No fue posible consultar el historial.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user.id]);
  useRealtimeRefresh('users', async () => { const response = await api.get(`/users/${user.id}/invitations`); setItems(response.data.data); });
  return createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Historial de invitaciones" className="bg-card border border-border rounded-2xl p-5 w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-4"><h2 className="font-bold">Invitaciones de {user.fullName}</h2>{error && <p role="alert">{error}</p>}{loading && <p role="status">Cargando historial...</p>}<ul className="space-y-2">{items.map(item => <li key={item.id} className="text-xs border border-border rounded-xl p-3">{invitationLabel(item.status)} · {new Date(item.createdAt).toLocaleString('es-DO')} {item.usedAt ? '· Utilizado' : item.revokedAt ? '· Invalidado' : item.expiresAt && new Date(item.expiresAt) <= new Date() ? '· Enlace vencido' : ''}{item.errorMessage && <p>{item.errorMessage}</p>}</li>)}</ul>{!loading && !items.length && <p className="text-xs">Sin invitaciones registradas.</p>}<button onClick={onClose} className="px-4 py-2 rounded-full bg-primary text-primary-foreground">Cerrar</button></section></div>, document.body);
}
