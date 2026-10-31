import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { invitationLabel, roleLabel } from '../../utils/invitationStatus';
import { UserItem,InvitationDiagnostic } from '../../services/users.service';
export function UserInvitationModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<UserItem[]>([]); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [riskConfirmed,setRiskConfirmed]=useState(false),[dispatchStatus,setDispatchStatus]=useState('');
  const [error, setError] = useState(''); const [reinvite, setReinvite] = useState(false); const [results, setResults] = useState<any[] | null>(null);
  const lock = useRef(false); const requestKey = useRef(crypto.randomUUID());
  useEffect(() => { let active = true; api.post('/users/invitations/selection', { userIds: ids }).then(response => { if (active) setUsers(response.data.data); }).catch(() => { if (active) setError('No fue posible validar la selección. Cierre y vuelva a preparar el lote.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const eligible = users.filter(user => reinvite || user.accountStatus !== 'ACTIVE');
  const hasUnknown=eligible.some(u=>u.invitationDiagnostic?.requiresDuplicateRiskConfirmation);
  const anyReady=eligible.some(u=>u.invitationDiagnostic?.canSend!==false);
  const valid = users.length === new Set(ids).size && users.every(user => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email));
  const send = async () => {
    if (lock.current || !valid) return; lock.current = true; setBusy(true); setError('');
    try {
      const response = await api.post('/users/invitations/send', { userIds: eligible.map(user => user.id), requestKey: requestKey.current, reinvite,confirmedDuplicateRisk:riskConfirmed, confirmed: true });
      setResults(response.data.data.results);setDispatchStatus(response.data.data.status);try{onSaved();}catch{console.error('No se pudo actualizar la lista de invitaciones.');}
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
      <InvitationDiagnosticNotice diagnostic={user.invitationDiagnostic}/>
      {user.invitation?.expiresAt && <p className="text-xs text-muted-foreground">Vence: {new Date(user.invitation.expiresAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</p>}
      {!results && user.accountStatus === 'ACTIVE' && !reinvite && <p className="text-xs text-muted-foreground">Se excluirá: cuenta ya activada.</p>}
      {results?.find(item => item.userId === user.id)?.reason && <p className="text-xs text-muted-foreground">{results.find(item => item.userId === user.id).reason}</p>}
    </li>)}</ul>
    {!results && <label className="flex items-start gap-3 text-xs"><input className="w-5 h-5 shrink-0 accent-primary" type="checkbox" disabled={busy} checked={reinvite} onChange={e => { setReinvite(e.target.checked); requestKey.current = crypto.randomUUID(); }} /><span>Autorizar reinvitación de cuentas activadas o con enlace vigente. Se invalidarán los enlaces anteriores; las contraseñas actuales no cambian hasta que el destinatario use el nuevo enlace.</span></label>}
    {!results&&hasUnknown&&<label className="flex items-start gap-3 text-xs"><input className="w-5 h-5 shrink-0 accent-primary" type="checkbox" disabled={busy} checked={riskConfirmed} onChange={e=>{setRiskConfirmed(e.target.checked);if(e.target.checked)setReinvite(true);requestKey.current=crypto.randomUUID();}}/><span>He investigado el resultado desconocido y autorizo un nuevo envío aunque puedan llegar dos mensajes. Se invalidará el enlace anterior.</span></label>}
    {!results&&!anyReady&&<p role="alert" className="text-sm text-amber-600 dark:text-amber-400">No se intentará enviar: resuelve primero los bloqueos indicados. El dominio público se configura en Administración → Configuración general.</p>}
    <p className="text-xs text-muted-foreground">{results ? 'Aceptado por el proveedor no significa recibido en la bandeja de entrada. Sin proveedor habilitado no se intenta enviar.' : `${eligible.length} destinatarios incluidos. Un enlace vigente no se reenvía sin autorizar reinvitación. Una confirmación autoriza únicamente esta selección.`}</p>
    <div className="mobile-form-actions flex flex-wrap justify-end gap-3 py-2"><button disabled={busy} onClick={onClose}>{results ? 'Cerrar' : 'Cancelar'}</button>{results&&dispatchStatus==='PROCESSING'&&<button className="btn-secondary" disabled={busy} onClick={()=>void send()}>{busy?'Consultando…':'Consultar progreso (no reenvía)'}</button>}{!results && <button disabled={busy || loading || !valid || !eligible.length || !anyReady} onClick={() => { void send(); }} className="px-4 py-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Procesando...' : 'Confirmar envío'}</button>}</div>
  </section></div>, document.body);
}
export function InvitationDiagnosticNotice({diagnostic,compact=false}:{diagnostic?:InvitationDiagnostic|null;compact?:boolean}){if(!diagnostic)return null;return <div className="text-xs space-y-1">{diagnostic.blocks.map(b=><p className="text-amber-600 dark:text-amber-400" key={b.code}>{b.reason}</p>)}{diagnostic.explanation&&<p>{compact?'Resultado desconocido: consulta el historial antes de reenviar.':diagnostic.explanation}</p>}{!compact&&<><p>Token: {{ACTIVE:'vigente',EXPIRED:'vencido',USED:'utilizado',REVOKED:'invalidado',NONE:'no generado'}[diagnostic.tokenState]||diagnostic.tokenState}. {diagnostic.hasProviderReference?'Referencia del proveedor registrada.':'Sin referencia del proveedor registrada.'}</p>{diagnostic.latestAttempt&&<p>Última operación: {invitationLabel(diagnostic.latestAttempt.status)} · {new Date(diagnostic.latestAttempt.at).toLocaleString('es-DO')}. {diagnostic.latestAttempt.reason}{diagnostic.latestAttempt.errorCode&&<span> Código: {diagnostic.latestAttempt.errorCode} {diagnostic.latestAttempt.stage||''}.</span>}</p>}</>}</div>;}

export function InvitationHistory({ user, onClose }: { user: UserItem; onClose: () => void }) {
  const [diagnostic,setDiagnostic]=useState<InvitationDiagnostic|null>(null);const [items, setItems] = useState<any[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; api.get(`/users/${user.id}/invitations`).then(response => { if (active) {setItems(response.data.data);setDiagnostic(response.data.diagnostic);} }).catch(() => { if (active) setError('No fue posible consultar el historial.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user.id]);
  useRealtimeRefresh('users', async () => { const response = await api.get(`/users/${user.id}/invitations`); {setItems(response.data.data);setDiagnostic(response.data.diagnostic);} });
  return createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Historial de invitaciones" className="bg-card border border-border rounded-2xl p-5 w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-4"><h2 className="font-bold">Invitaciones de {user.fullName}</h2><InvitationDiagnosticNotice diagnostic={diagnostic}/>{error && <p role="alert">{error}</p>}{loading && <p role="status">Cargando historial...</p>}<ul className="space-y-2">{items.map(item => <li key={item.id} className="text-xs border border-border rounded-xl p-3">{invitationLabel(item.status)} · {new Date(item.createdAt).toLocaleString('es-DO')} {item.usedAt ? '· Utilizado' : item.revokedAt ? '· Invalidado' : item.expiresAt && new Date(item.expiresAt) <= new Date() ? '· Enlace vencido' : ''}{item.errorMessage && <p>{item.errorMessage}</p>}</li>)}</ul>{!loading && !items.length && <p className="text-xs">Sin invitaciones registradas.</p>}<button onClick={onClose} className="px-4 py-2 rounded-full bg-primary text-primary-foreground">Cerrar</button></section></div>, document.body);
}
