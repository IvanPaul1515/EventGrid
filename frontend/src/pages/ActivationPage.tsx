import React, { useState,useEffect } from 'react';
import { api } from '../services/api';
import { Link, useSearchParams,useLocation } from 'react-router-dom';
export function ActivationPage() {
  const [params] = useSearchParams(); const [password, setPassword] = useState(''); const [repeat, setRepeat] = useState('');
  const location=useLocation(),token=params.get('token')||new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const [username,setUsername]=useState(''),[valid,setValid]=useState(false);
  useEffect(()=>{let active=true;setValid(false);setUsername('');api.post('/auth/invitation-info',{token}).then(r=>{if(active){setUsername(r.data.data.username||'');setValid(true);}}).catch(()=>{if(active)setMessage('Enlace inválido, vencido o ya utilizado.');});return()=>{active=false;};},[token]);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  return <div className="min-h-screen bg-background flex justify-center items-center p-4"><form className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    if (password !== repeat) { setMessage('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try { await api.post('/auth/accept-invitation', { token, password,username }); setDone(true); setMessage('Cuenta activada. Puede iniciar sesión con usuario o correo.'); }
    catch (err: any) { setMessage(err.response?.data?.message || 'No fue posible activar la cuenta.'); } finally { setBusy(false); }
  }}><h1 className="text-xl font-bold font-display">Establecer contraseña</h1>
    {!done && <><p className="text-xs text-muted-foreground">Enlace de un solo uso, válido durante 24 horas.</p>
      <label className="block text-sm">Nombre de usuario<input aria-label="Nombre de usuario" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} disabled={!valid} className="input-field w-full"/></label>
      <input aria-label="Nueva contraseña" autoComplete="new-password" type="password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-background border border-border rounded-xl" />
      <input aria-label="Repetir contraseña" autoComplete="new-password" type="password" required value={repeat} onChange={e => setRepeat(e.target.value)} className="w-full p-3 bg-background border border-border rounded-xl" />
      <button disabled={busy||!valid} className="w-full px-4 py-3 bg-primary text-white rounded-full">Activar mi cuenta</button></>}
    <p role="status" className="text-sm">{message}</p>{done && <Link to="/login" className="text-primary">Iniciar sesión</Link>}
  </form></div>;
}
