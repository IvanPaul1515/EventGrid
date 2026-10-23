import React, { useRef, useState } from 'react';
import { useEdition } from '../../context/EditionContext';
import { api } from '../../services/api';
type Row = { fullName: string; email: string; role: string; assignedEventId: string; staffArea: string; userId?: string };
export function PersonnelInvitations({ users, onSaved }: { users: any[]; onSaved: () => void }) {
  const { events, currentEvent } = useEdition();
  const blank = (): Row => ({ fullName: '', email: '', role: 'OPERATOR', assignedEventId: currentEvent?.id || '', staffArea: '' });
  const [rows, setRows] = useState<Row[]>([]); const [preview, setPreview] = useState(false); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false); const requestKey = useRef(crypto.randomUUID());
  const emails = rows.map(row => row.email.toLowerCase().trim());
  const errors = rows.map((row, i) => !row.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) ? 'Nombre y correo válidos requeridos'
    : emails.indexOf(emails[i]) !== i ? 'Correo duplicado en este lote'
    : !row.userId && users.some(user => user.email.toLowerCase() === emails[i]) ? 'Usuario existente: selecciónelo en la lista de cuentas' : '');
  return <details className="bg-card border border-border rounded-2xl p-4"><summary className="font-bold cursor-pointer">Invitar personal</summary>
    <p className="text-xs text-muted-foreground my-3">Una sola confirmación autoriza este lote. Con el proveedor desactivado, las invitaciones quedan pendientes sin intentar enviarlas.</p>
    {!preview && <div className="space-y-3">{rows.map((row, index) => <div className="border border-border rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2" key={index}>
      {(['fullName', 'email', 'staffArea'] as const).map((field, i) => <input key={field} aria-label={['Nombre del invitado', 'Correo del invitado', 'Función / Área'][i]} placeholder={['Nombre', 'Correo', 'Función / Área (opcional)'][i]} type={field === 'email' ? 'email' : 'text'} value={row[field]} disabled={Boolean(row.userId)} onChange={e => { setRows(rows.map((r, j) => j === index ? { ...r, [field]: e.target.value } : r)); requestKey.current = crypto.randomUUID(); }} className="p-2 rounded-xl bg-background border border-border" />)}
      <select aria-label="Rol del invitado" value={row.role} disabled={Boolean(row.userId)} onChange={e => setRows(rows.map((r, j) => j === index ? { ...r, role: e.target.value } : r))} className="p-2 rounded-xl bg-background border border-border"><option value="ADMIN">Administrador</option><option value="OPERATOR">Operador</option><option value="VIEWER">Consulta</option></select>
      <select aria-label="Edición del invitado" disabled={Boolean(row.userId)} value={row.assignedEventId} onChange={e => setRows(rows.map((r, j) => j === index ? { ...r, assignedEventId: e.target.value } : r))} className="p-2 rounded-xl bg-background border border-border">{events.map(event => <option key={event.id} value={event.id}>{event.name} · {event.year}</option>)}</select>
      <button type="button" className="text-primary text-xs" onClick={() => setRows(rows.filter((_, j) => j !== index))}>Retirar destinatario</button>{errors[index] && <p className="text-xs text-rose-500">{errors[index]}</p>}
    </div>)}<div className="flex flex-wrap gap-3"><button onClick={() => { setRows([...rows, blank()]); requestKey.current = crypto.randomUUID(); }} className="text-primary text-xs">Agregar persona</button>
      <select aria-label="Agregar cuenta existente" value="" className="bg-background border border-border rounded-xl p-2 text-xs" onChange={e => {
        const user = users.find(u => u.id === e.target.value); if (!user || rows.some(row => row.userId === user.id)) return;
        setRows([...rows, { ...user, userId: user.id, assignedEventId: user.assignedEventId || currentEvent?.id || '', staffArea: user.staffArea || '' }]); requestKey.current = crypto.randomUUID();
      }}><option value="">Agregar cuenta existente...</option>{users.map(user => <option key={user.id} value={user.id}>{user.fullName} · {user.email}</option>)}</select>
      <button disabled={!rows.length || errors.some(Boolean)} onClick={async () => {
        try { const result = (await api.post('/users/invitations/preview', { rows })).data.data;
          if (result.issues.length) { setMessage(result.issues.join('\n')); return; }
          setMessage(''); setPreview(true);
        } catch (err: any) { setMessage(err.response?.data?.message || 'Revise los datos antes de enviar.'); }
      }} className="px-4 py-2 rounded-full bg-primary text-white text-xs">Vista previa</button></div></div>}
    {preview && <div className="space-y-3"><p className="text-sm font-bold">Confirmar envío de {rows.length} invitaciones</p>{rows.map(row => <p className="text-xs break-words" key={row.email}>{row.fullName} · {row.email} · {row.role === 'ADMIN' ? 'Administrador' : row.role === 'OPERATOR' ? 'Operador' : 'Consulta'} · {events.find(e => e.id === row.assignedEventId)?.name}</p>)}
      <div className="flex gap-3"><button disabled={busy} onClick={() => { setPreview(false); requestKey.current = crypto.randomUUID(); }}>Volver</button><button disabled={busy} className="px-4 py-2 bg-primary text-white rounded-full text-xs" onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
        try {
          const ids: string[] = [];
          const updatedRows = [...rows];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.userId) { ids.push(row.userId); continue; }
            const response = await api.post('/users', row); const id = response.data.data.id; ids.push(id);
            updatedRows[i] = { ...row, userId: id }; setRows([...updatedRows]);
          }
          const result = (await api.post('/users/invitations/send', { userIds: ids, requestKey: requestKey.current, confirmed: true })).data.data;
          setMessage(result.results.map((item: any) => `${updatedRows.find(row => row.userId === item.userId)?.email || item.userId}: ${item.status}${item.reason ? ' · ' + item.reason : ''}`).join('\n') || 'Lote ya en procesamiento. No se duplicó el envío.');
          onSaved();
        } catch (err: any) { setMessage(err.response?.data?.message || 'No se completó la operación. No se reintentará automáticamente.'); }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Procesando...' : 'Enviar invitaciones'}</button></div></div>}
    <p role="status" className="text-xs mt-3 whitespace-pre-line break-words">{message}</p>
  </details>;
}
