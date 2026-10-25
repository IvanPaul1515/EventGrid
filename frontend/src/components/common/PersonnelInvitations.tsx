import React, { useRef, useState, useEffect } from 'react';
import { useEdition } from '../../context/EditionContext';
import { api } from '../../services/api';
import { roleLabel } from '../../utils/invitationStatus';
type Row = { fullName: string; email: string; role: string; userId?: string };
export function PersonnelInvitations({ users, onSaved }: { users: any[]; onSaved: () => void }) {
  const { currentEvent } = useEdition();
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState(false); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  useEffect(() => { setRows([]); setPreview(false); setMessage(''); }, [currentEvent?.id]);
  const emails = rows.map(row => row.email.trim().toLowerCase());
  const errors = rows.map((row, i) => row.fullName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emails[i]) ? 'Nombre y correo válidos requeridos'
    : emails.indexOf(emails[i]) !== i ? 'Correo duplicado en este lote'
    : !row.userId && users.some(user => user.email.toLowerCase() === emails[i]) ? 'Usuario existente: selecciónelo en la lista general' : '');
  const prepare = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
    try {
      const result = (await api.post('/users/invitations/preview', { rows: rows.map(row => ({ ...row, email: row.email.trim().toLowerCase(), assignedEventId: currentEvent?.id })) })).data.data;
      if (result.issues.length) setMessage(result.issues.join('\n')); else setPreview(true);
    } catch (error: any) { setMessage(error.response?.data?.message || 'Revise los datos.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const create = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); const updated = [...rows];
    try {
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].userId) continue;
        const result = await api.post('/users', { fullName: updated[i].fullName.trim(), email: updated[i].email.trim().toLowerCase(), role: updated[i].role });
        updated[i] = { ...updated[i], userId: result.data.data.id }; setRows([...updated]);
      }
      setMessage('Cuentas pendientes creadas. Selecciónelas en la lista general para autorizar sus invitaciones. No se enviaron correos.');
      setRows([]); setPreview(false); onSaved();
    } catch (error: any) { setMessage(error.response?.data?.message || 'No se completó la creación. Las cuentas ya creadas se conservan.'); onSaved(); }
    finally { lock.current = false; setBusy(false); }
  };
  return <details className="bg-card border border-border rounded-2xl p-4"><summary className="font-bold cursor-pointer">Agregar varios usuarios</summary>
    <p className="text-xs text-muted-foreground my-3">Crear cuentas no envía correos. Después seleccione las cuentas en la lista y confirme Enviar invitaciones.</p>
    {!preview && <div className="space-y-3">{rows.map((row, index) => <div className="border border-border rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2" key={index}>
      {(['fullName', 'email'] as const).map((field, i) => <input key={field} aria-label={['Nombre del invitado', 'Correo del invitado'][i]} placeholder={['Nombre completo', 'Correo electrónico'][i]} type={field === 'email' ? 'email' : 'text'} value={row[field]} disabled={busy || Boolean(row.userId)} onChange={e => setRows(rows.map((item, j) => j === index ? { ...item, [field]: e.target.value } : item))} className="min-w-0 p-2 rounded-xl bg-background border border-border" />)}
      <select aria-label="Rol del invitado" disabled={busy || Boolean(row.userId)} value={row.role} onChange={e => setRows(rows.map((item, j) => j === index ? { ...item, role: e.target.value } : item))} className="p-2 rounded-xl bg-background border border-border">{['ADMIN', 'OPERATOR', 'VIEWER'].map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
      <button disabled={busy} type="button" className="text-primary text-xs" onClick={() => setRows(rows.filter((_, j) => j !== index))}>Retirar persona</button>{errors[index] && <p className="text-xs text-destructive">{errors[index]}</p>}
    </div>)}<div className="flex flex-wrap gap-3"><button disabled={busy || rows.length >= 50} onClick={() => setRows([...rows, { fullName: '', email: '', role: 'OPERATOR' }])} className="text-primary text-xs">Agregar persona</button>
      <button disabled={busy || !rows.length || errors.some(Boolean)} onClick={() => { void prepare(); }} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs">Vista previa</button></div></div>}
    {preview && <div className="space-y-3"><p className="text-sm font-bold">Crear {rows.length} cuentas pendientes</p>{rows.map(row => <p className="text-xs break-words" key={row.email}>{row.fullName} · {row.email} · {roleLabel(row.role)}</p>)}
      <div className="flex gap-3"><button disabled={busy} onClick={() => setPreview(false)}>Volver</button><button disabled={busy} className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs" onClick={() => { void create(); }}>{busy ? 'Procesando...' : 'Crear usuarios'}</button></div></div>}
    <p role="status" className="text-xs mt-3 whitespace-pre-line break-words">{message}</p>
  </details>;
}
