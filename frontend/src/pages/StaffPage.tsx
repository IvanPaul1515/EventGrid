import { PhoneInput } from '../components/common/PhoneInput';
import { formatPhone, normalizedPhone } from '../utils/phone';
import { PersonnelNavigation } from '../components/common/PersonnelNavigation';
import { UserInvitationModal } from '../components/common/UserInvitationModal';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
const empty = { firstName: '', lastName: '', email: '', phone: '' };
export function StaffPage() {
  const { currentEvent } = useEdition(); const { hasRole } = useAuth();
  const [items, setItems] = useState<any[]>([]); const [draft, setDraft] = useState<any>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const lock = useRef(false);
  const [access, setAccess] = useState<any>(null);
  const [role, setRole] = useState('OPERATOR');
  const [invitationIds, setInvitationIds] = useState<string[] | null>(null);
  const [phoneOriginal, setPhoneOriginal] = useState('');
  const edit = (item: any) => { setError(''); setPhoneOriginal(item.phone || ''); setDraft(item); };
  const openAccess = async (item: any) => { setError(''); try { const result = (await api.get('/staff/' + item.id + '/access')).data.data; setRole('OPERATOR'); setAccess({ staff: item, ...result }); } catch (err: any) { setError(err.response?.data?.message || 'No fue posible consultar el acceso.'); } };
  const load = async () => { const request = ++version.current; try { const data = (await api.get('/staff')).data.data; if (request === version.current) setItems(data); } catch { if (request === version.current) setError('No fue posible cargar el staff.'); } };
  useEffect(() => { setDraft(null); setAccess(null); setInvitationIds(null); load(); return () => { version.current++; }; }, [currentEvent?.id]);
  useRealtimeRefresh('staff', load);
  return <div className="space-y-5">
    <PersonnelNavigation />
    {hasRole(['ADMIN'])&&<Link className="btn-secondary inline-flex" to="/users?create=1">Agregar usuario</Link>}
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-display font-bold">Staff / Colaboradores</h1>
      {hasRole(['ADMIN']) && <button className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold" onClick={() => edit({ ...empty })}>Agregar colaborador</button>}</div>
    <p className="text-xs text-muted-foreground">Personal de {currentEvent?.name}. Registrar una persona no crea una cuenta ni envía correos. Los aportes institucionales históricos permanecen en Patrocinadores.</p>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}

    <div className="hidden md:block bg-card border border-border rounded-2xl overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr>{['Colaborador', 'Correo electrónico', 'Teléfono', 'Acciones'].map(text => <th className="p-3" key={text}>{text}</th>)}</tr></thead><tbody>
      {items.map(item => <tr className="border-t border-border" key={item.id}><td className="p-3">{item.firstName} {item.lastName}{item.status !== 'ACTIVE' && <span className="block text-muted-foreground">Inactivo</span>}</td><td className="p-3 break-all">{item.email}</td><td className="p-3 whitespace-nowrap">{item.phone ? formatPhone(item.phone) : '—'}</td><td className="p-3">{hasRole(['ADMIN']) && <div className="flex flex-wrap gap-3"><button onClick={() => edit(item)} className="text-primary">Editar</button><button onClick={() => openAccess(item)} className="text-primary">{item.userId ? 'Consultar acceso' : 'Crear acceso a EventGrid'}</button></div>}</td></tr>)}
    </tbody></table></div>
    <div className="md:hidden space-y-3">{items.map(item => <article key={item.id} className="p-4 bg-card border border-border rounded-2xl space-y-2 text-sm"><p className="font-bold">{item.firstName} {item.lastName}</p><p className="break-all">{item.email}</p><p>{item.phone ? formatPhone(item.phone) : 'Sin teléfono'}</p>{item.status !== 'ACTIVE' && <p className="text-muted-foreground">Inactivo</p>}{hasRole(['ADMIN']) && <div className="flex flex-wrap gap-4"><button onClick={() => edit(item)} className="text-primary py-2">Editar</button><button onClick={() => openAccess(item)} className="text-primary py-2">{item.userId ? 'Consultar acceso' : 'Crear acceso a EventGrid'}</button></div>}</article>)}</div>
    {access && createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Acceso del colaborador" className="mobile-form-dialog bg-card border border-border rounded-2xl p-5 w-full max-w-md max-h-[90dvh] overflow-y-auto space-y-4">
      <h2 className="font-bold">Acceso a EventGrid</h2><p>{access.staff.firstName} {access.staff.lastName}</p><p className="break-all text-sm">{access.staff.email}</p>
      {access.account ? <p className="text-sm">Cuenta {access.account.fullName} · {access.account.role}. {access.linked ? 'Vinculada.' : 'Ya existe. Confirme para vincularla sin cambiar sus permisos.'}</p> : <label className="block text-sm">Rol<select className="block w-full bg-background border border-border rounded-xl p-2 mt-1" value={role} onChange={e => setRole(e.target.value)}><option value="OPERATOR">Operador</option><option value="VIEWER">Consulta</option><option value="ADMIN">Administrador</option></select></label>}
      <p className="text-xs text-muted-foreground">Crear o vincular el acceso no envía correos.</p>
      {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => setAccess(null)}>Cerrar</button>
      {!access.linked && <button disabled={busy} className="bg-primary text-primary-foreground px-3 py-2 rounded-xl" onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true); setError('');
        try { const result = (await api.post('/staff/' + access.staff.id + '/access', { role, linkExisting: Boolean(access.account) })).data.data; setAccess({ ...access, account: result, linked: true }); await load(); } catch(err: any) { setError(err.response?.data?.message || 'No fue posible crear el acceso.'); } finally { lock.current = false; setBusy(false); }
      }}>{access.account ? 'Vincular cuenta existente' : 'Crear cuenta pendiente'}</button>}
      {access.linked && access.account && <><Link className="text-primary py-2" to="/users">Consultar en Usuarios</Link><button className="text-primary py-2" onClick={() => { setInvitationIds([access.account.id]); setAccess(null); }}>Invitar usuario</button></>}
      </div></div></div>, document.body)}
    {invitationIds && <UserInvitationModal ids={invitationIds} onClose={() => setInvitationIds(null)} onSaved={() => { void load(); }} />}
    {draft && createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Miembro de staff" className="mobile-form-dialog bg-card border border-border rounded-2xl p-5 w-full max-w-xl max-h-[90dvh] overflow-y-auto">
      <h2 className="text-lg font-bold">Miembro de staff</h2><form className="mobile-form-body space-y-3 mt-4" onSubmit={async e => {
        e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
        try { const phone = draft.phone === phoneOriginal ? draft.phone : normalizedPhone(draft.phone || ''); if (phone === null) { setError('Teléfono inválido. Para otros países incluya el prefijo internacional, por ejemplo +34.'); return; } const data = { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), phone }; await (draft.id ? api.put('/staff/' + draft.id, data) : api.post('/staff', data)); setDraft(null); await load(); }
        catch (err: any) { setError(err.response?.data?.message || 'Revise los datos del staff.'); } finally { lock.current = false; setBusy(false); }
      }}>
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        {(['firstName', 'lastName', 'email', 'phone'] as const).map((field, i) => <label key={field} className="block text-xs text-muted-foreground">{['Nombre', 'Apellido', 'Correo electrónico', 'Teléfono'][i]}{field === 'phone' ? <PhoneInput value={draft.phone || ''} onChange={value => setDraft({ ...draft, phone: value })} className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-foreground" /> : <input required={['firstName', 'lastName', 'email'].includes(field)} type={field === 'email' ? 'email' : 'text'} value={draft[field] || ''} onChange={e => setDraft({ ...draft, [field]: e.target.value })} className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-foreground" />}</label>)}
        <div className="mobile-form-actions flex justify-end gap-3 py-3"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button disabled={busy} className="px-4 py-2 rounded-full bg-primary text-white">Guardar</button></div>
      </form></div></div>, document.body)}
  </div>;
}
