import { useDevicePresentation } from './useDevicePresentation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { QrScanModal } from '../qr/QrScanModal';
import { useRealtimeEvent } from '../../context/RealtimeContext';

type Snapshot = {
  station: { id: string; label: string; pc: boolean } | null;
  link: { id: string; status: string; code?: string; expiresAt: string; user: string } | null;
  reading: { id: string; registrationId?: string; status: string; result: string } | null;
};
const empty: Snapshot = { station: null, link: null, reading: null };

export function LinkedScannerPanel({ eventId, busy, onRead, onLinkedMode }: {
  eventId: string; busy: boolean; onRead: (id: string) => Promise<void>; onLinkedMode: (linked: boolean) => void;
}) {
  const presentation = useDevicePresentation();
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<Snapshot>(empty);
  const [stations, setStations] = useState<{ id: string; label: string }[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [scan, setScan] = useState(false);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<string | null>(null);
  const epoch = useRef(0);
  const context = useRef({ busy, onRead }); context.current = { busy, onRead };
  const modeCallback = useRef(onLinkedMode); modeCallback.current = onLinkedMode;
  useEffect(() => { modeCallback.current(Boolean(state.link?.status === 'LINKED' && !state.station?.pc)); }, [state.link?.status, state.station?.pc]);
  const base = `/events/${eventId}/scanner`;
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true, running = false, again = false;
    let lastLinkId: string | null = null;
    setState(empty); seen.current = null; setScan(false);
    const load = async () => {
      if (running) { again = true; return; } running = true;
      const generation = epoch.current;
      try {
        const snapshot: Snapshot = (await api.post(base + '/state', { busy: context.current.busy })).data.data;
        if (!active || generation !== epoch.current) return;
        lastLinkId = snapshot.link?.id || null;
        setState(snapshot); setConnected(true); setNow(Date.now());
        if (snapshot.link?.status !== 'LINKED') setScan(false);
        if (snapshot.station?.pc && snapshot.reading?.status === 'PENDING' && snapshot.reading.registrationId && !context.current.busy && seen.current !== snapshot.reading.id) {
          seen.current = snapshot.reading.id;
          try { await context.current.onRead(snapshot.reading.registrationId); }
          catch { seen.current = null; setMessage('No se pudo abrir la ficha. Reintente la conexión.'); }
        }
        if (!snapshot.link) {
          const available = (await api.get(base + '/stations')).data.data;
          if (active) setStations(available);
        }
      } catch (error: any) { if (active) { setConnected(false); setScan(false); if (error.response?.status === 403) setMessage(error.response.data?.message || 'La vinculación no está autorizada.'); } }
      finally { running = false; if (active && again) { again = false; void load(); } }
    };
    refresh.current = load; void load();
    const timer = window.setInterval(load, 10000);
    const wake = () => { void load(); };
    window.addEventListener('online', wake);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', wake); if (lastLinkId) void api.post(base + '/' + lastLinkId + '/unlink').catch(() => {}); };
  }, [base]);
  useEffect(() => { void refresh.current(); }, [busy]);
  useRealtimeEvent(['SCANNER_CHANGED', 'RESYNC', 'CHECK_IN_CONFIRMED'], () => { void refresh.current(); });
  const act = async (path: string, body = {}) => {
    if (pending) return; epoch.current++; setPending(true); setMessage('');
    try { await api.post(base + path, body); await refresh.current(); }
    catch (error: any) { setMessage(error.response?.data?.message || 'No se pudo completar. Compruebe la conexión.'); }
    finally { setPending(false); }
  };
  useEffect(() => { if (!state.link || state.link.status === 'LINKED') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state.link?.id, state.link?.status]);
  const link = state.link;
  const seconds = link ? Math.max(0, Math.ceil((Date.parse(link.expiresAt) - now) / 1000)) : 0;
  const isPC = presentation.device === 'desktop' || Boolean(state.station?.pc);
  const showPanel = expanded || Boolean(link && !state.station?.pc);
  return <section className="rounded-xl border border-border bg-card p-3 space-y-2 text-sm" aria-label="Vinculación de escáner móvil">
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary" aria-expanded={showPanel} onClick={() => {
        setExpanded(value => !value);
        void refresh.current();
        if (isPC && !state.station?.pc) void act('/station', { label: 'Recepción PC' });
      }}>{isPC && !state.station?.pc ? 'Habilitar escáner móvil' : isPC ? 'Escáner móvil' : 'Vincular teléfono a una PC'}</button>
      {state.station?.pc && <span className="text-xs text-muted-foreground">{link?.status === 'LINKED' ? 'Celular conectado' : 'Estación habilitada'}</span>}
      {presentation.detected === 'ambiguous' && <label className="text-xs text-muted-foreground">Dispositivo
        <select aria-label="Tipo de dispositivo" className="bg-background border border-border rounded-lg text-base ml-2" value={presentation.override} onChange={e => presentation.choose(e.target.value)}>
          <option value="">Detección automática</option><option value="desktop">PC o laptop</option><option value="phone">Teléfono</option>
        </select>
      </label>}
    </div>
    {showPanel && <>
    {!connected && <p role="status">Sin conexión con la estación. No se ha confirmado ninguna asistencia. <button onClick={() => void refresh.current()}>Reintentar</button></p>}
    {message && <p role="alert">{message}</p>}
    {!isPC && !link && <div className="flex flex-wrap gap-2">
      {stations.map(station => <button disabled={pending} key={station.id} className="btn-secondary" onClick={() => void act('/request', { stationId: station.id })}>Vincular a {station.label}</button>)}
      {!stations.length && <span className="text-muted-foreground">Abra Recepción rápida en la computadora y pulse «Habilitar escáner móvil». Puede continuar usando EventGrid normalmente.</span>}
    </div>}
    {state.station?.pc && !link && <p>Estación disponible: {state.station.label}. Inicie sesión con la misma cuenta y edición en el teléfono.</p>}
    {link && <div className="space-y-2">
      <p>{state.station?.pc ? 'Solicitud de ' + link.user : 'Estación: ' + state.station?.label} · {link.status === 'LINKED' ? 'Vinculado' : 'Código temporal (' + seconds + ' s)'}</p>

      {!state.station?.pc && ['REQUESTED', 'APPROVED'].includes(link.status) && <form onSubmit={e => { e.preventDefault(); void act('/' + link.id + '/confirm', { code }); }}><label>Código mostrado en la PC<input className="input-field text-base" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label><button className="btn-primary" disabled={pending || link.status !== 'APPROVED' || code.length !== 6}>Confirmar vinculación</button></form>}
      {link.status === 'LINKED' && !state.station?.pc && <><p>El teléfono solo lee. La PC confirma la asistencia.</p><button className="btn-primary" disabled={!connected || pending || state.reading?.status === 'PENDING'} onClick={() => setScan(true)}>Leer QR para la PC</button></>}
      {state.reading && <p role="status">{state.reading.result} {state.reading.status === 'CONFIRMED' ? 'Asistencia confirmada en el servidor.' : ''}</p>}
      {state.station?.pc && state.reading?.status === 'PENDING' && <button className="btn-secondary" disabled={pending} onClick={() => void act('/' + link.id + '/dismiss')}>Descartar lectura pendiente</button>}
      <button className="btn-secondary" disabled={pending} onClick={() => { setScan(false); void act('/' + link.id + '/unlink'); }}>Desvincular y usar EventGrid normalmente</button>
    </div>}
    </>}
      {link && state.station?.pc && link.status !== 'LINKED' && <div role="dialog" aria-modal="true" aria-label="Autorizar escáner" className="fixed inset-0 z-[80] bg-black/60 p-4 flex items-center justify-center"><div className="bg-card text-foreground border border-border rounded-xl p-5 max-w-md space-y-3"><p>Solicitud desde un celular autenticado. Compruebe que reconoce el teléfono antes de autorizar. Código: <strong className="tracking-widest text-lg">{link.code}</strong></p><button disabled={pending || !seconds || link.status !== 'REQUESTED'} className="btn-primary" onClick={() => void act('/' + link.id + '/decide', { approve: true })}>Autorizar</button><button disabled={pending} className="btn-secondary" onClick={() => void act('/' + link.id + '/decide', { approve: false })}>Rechazar</button></div></div>}
    <QrScanModal isOpen={scan && connected && link?.status === 'LINKED'} onClose={() => setScan(false)} onLinkedRead={async token => {
      if (!link) throw new Error('Dispositivo desvinculado');
      epoch.current++;
      const result = (await api.post(base + '/' + link.id + '/read', { token, requestKey: crypto.randomUUID() })).data.data;
      await refresh.current(); return result.result;
    }} />
  </section>;
}
