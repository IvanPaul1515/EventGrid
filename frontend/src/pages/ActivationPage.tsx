import React, { useState } from 'react';
import { api } from '../services/api';
import { Link, useSearchParams } from 'react-router-dom';
export function ActivationPage() {
  const [params] = useSearchParams(); const [password, setPassword] = useState(''); const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  return <div className="min-h-screen bg-background flex justify-center items-center p-4"><form className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    if (password !== repeat) { setMessage('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try { await api.post('/auth/accept-invitation', { token: params.get('token'), password }); setDone(true); setMessage('Contraseña establecida. Puede iniciar sesión.'); }
    catch (err: any) { setMessage(err.response?.data?.message || 'No fue posible activar la cuenta.'); } finally { setBusy(false); }
  }}><h1 className="text-xl font-bold font-display">Establecer contraseña</h1>
    {!done && <><p className="text-xs text-muted-foreground">Enlace de un solo uso, válido durante 24 horas.</p>
      <input aria-label="Nueva contraseña" autoComplete="new-password" type="password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-background border border-border rounded-xl" />
      <input aria-label="Repetir contraseña" autoComplete="new-password" type="password" required value={repeat} onChange={e => setRepeat(e.target.value)} className="w-full p-3 bg-background border border-border rounded-xl" />
      <button disabled={busy} className="w-full px-4 py-3 bg-primary text-white rounded-full">Guardar contraseña</button></>}
    <p role="status" className="text-sm">{message}</p>{done && <Link to="/login" className="text-primary">Iniciar sesión</Link>}
  </form></div>;
}
