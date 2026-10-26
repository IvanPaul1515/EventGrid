import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
export const RecoveryPage: React.FC = () => {
    const location = useLocation();
    const reset = location.pathname === '/reset-password';
    const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => { const changed = () => { const next = new URLSearchParams(window.location.hash.slice(1)).get('token'); if (next) {
        setToken(next);
        setAttempt(value => value + 1);
    } }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [message, setMessage] = useState(''), [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'done'>('loading'), [busy, setBusy] = useState(false);
    const saving = useRef(false);
    useEffect(() => { if (!reset) {
        setState('valid');
        return;
    } window.history.replaceState(null, '', location.pathname); let active = true; if (!token) {
        setState('invalid');
        setMessage('Solicitud inválida.');
        return;
    } setState('loading'); setMessage(''); api.post('/auth/recovery/validate', { token }).then(() => { if (active)
        setState('valid'); }).catch(err => { if (active) {
        setState('invalid');
        setMessage(err.response?.data?.message || 'No se pudo validar el enlace. Solicita uno nuevo o reintenta con conexión.');
    } }); return () => { active = false; }; }, [reset, token, attempt]);
    const submit = async (e: React.FormEvent) => { e.preventDefault(); if (saving.current)
        return; if (reset && password !== repeat) {
        setMessage('Las contraseñas no coinciden.');
        return;
    } saving.current = true; setBusy(true); try {
        const res = await api.post(reset ? '/auth/recovery/confirm' : '/auth/recovery/request', reset ? { token, password } : { email });
        setMessage(res.data.message);
        setPassword('');
        setRepeat('');
        setState('done');
    }
    catch (err: any) {
        setMessage(err.response?.data?.message || 'No se pudo confirmar la operación. No se reintentó automáticamente.');
    }
    finally {
        saving.current = false;
        setBusy(false);
    } };
    return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"><section className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4"><p className="font-bold">EVENTGRID</p><h1 className="text-xl font-bold">{reset ? 'Establecer nueva contraseña' : 'Recuperar acceso'}</h1>{message && <p role="status" className="text-sm">{message}</p>}{state === 'loading' && <p>Validando enlace…</p>}{state === 'valid' && <form onSubmit={submit} className="space-y-3">{reset ? <><label className="block text-sm">Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 mt-1 bg-background border border-border rounded-lg"/></label><label className="block text-sm">Repetir contraseña<input type="password" autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)} className="w-full p-3 mt-1 bg-background border border-border rounded-lg"/></label></> : <label className="block text-sm">Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 mt-1 bg-background border border-border rounded-lg"/></label>}<button disabled={busy} className="w-full p-3 bg-primary text-primary-foreground rounded-lg disabled:opacity-50">{reset ? 'Guardar contraseña' : 'Solicitar enlace de recuperación'}</button></form>}{state === 'invalid' && <Link className="block text-primary" to="/forgot-password">Solicitar un enlace nuevo</Link>}<Link className="block text-sm text-primary" to="/login">Iniciar sesión</Link></section></main>;
};
