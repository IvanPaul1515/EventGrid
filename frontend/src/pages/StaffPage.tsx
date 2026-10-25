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
  const load = async () => { const request = ++version.current; try { const data = (await api.get('/staff')).data.data; if (request === version.current) setItems(data); } catch { if (request === version.current) setError('No fue posible cargar el staff.'); } };
  useEffect(() => { setDraft(null); load(); return () => { version.current++; }; }, [currentEvent?.id]);
  useRealtimeRefresh('staff', load);
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-display font-bold">Staff / Colaboradores</h1>
      {hasRole(['ADMIN']) && <button className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold" onClick={() => setDraft({ ...empty })}>Agregar colaborador</button>}</div>
    <p className="text-xs text-muted-foreground">Personal de {currentEvent?.name}. Registrar una persona no crea una cuenta ni envía correos. Los aportes institucionales históricos permanecen en Patrocinadores.</p>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
    <div className="bg-card border border-border rounded-2xl overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr>{['Nombre', 'Función / Área', 'Contacto', 'Estado', ''].map((text, i) => <th className="p-3" key={i}>{text}</th>)}</tr></thead><tbody>
      {items.map(item => <tr className="border-t border-border" key={item.id}><td className="p-3">{item.firstName} {item.lastName}</td><td className="p-3">{item.function} / {item.area}</td><td className="p-3 break-all">{item.email}<br />{item.phone}</td><td className="p-3">{item.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</td><td className="p-3">{hasRole(['ADMIN']) && <button onClick={() => setDraft(item)} className="text-primary">Editar</button>}</td></tr>)}
    </tbody></table></div>
    {draft && createPortal(<div className="mobile-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Miembro de staff" className="mobile-form-dialog bg-card border border-border rounded-2xl p-5 w-full max-w-xl max-h-[90dvh] overflow-y-auto">
      <h2 className="text-lg font-bold">Miembro de staff</h2><form className="mobile-form-body space-y-3 mt-4" onSubmit={async e => {
        e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
        try { const data = { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), phone: draft.phone }; await (draft.id ? api.put('/staff/' + draft.id, data) : api.post('/staff', data)); setDraft(null); await load(); }
        catch (err: any) { setError(err.response?.data?.message || 'Revise los datos del staff.'); } finally { lock.current = false; setBusy(false); }
      }}>
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        {(['firstName', 'lastName', 'email', 'phone'] as const).map((field, i) => <label key={field} className="block text-xs text-muted-foreground">{['Nombre', 'Apellido', 'Correo electrónico', 'Teléfono'][i]}<input required={['firstName', 'lastName', 'email'].includes(field)} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} value={draft[field] || ''} onChange={e => setDraft({ ...draft, [field]: e.target.value })} className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-foreground" /></label>)}
        <div className="mobile-form-actions flex justify-end gap-3 py-3"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button disabled={busy} className="px-4 py-2 rounded-full bg-primary text-white">Guardar</button></div>
      </form></div></div>, document.body)}
  </div>;
}
