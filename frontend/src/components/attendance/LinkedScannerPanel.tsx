import { useLocation } from 'react-router-dom';
import { useScanner } from './ScannerContext';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { QrScanModal } from '../qr/QrScanModal';

export function LinkedScannerPanel({ eventId, busy, onRead, onLinkedMode }: {
  eventId: string; busy: boolean; onRead: (id: string) => Promise<void>; onLinkedMode: (linked: boolean) => void;
}) {
  const location = useLocation();
  const { state, stations, connected, pending, message, presentation, refresh, act, setBusy } = useScanner();
  const [readError, setReadError] = useState('');
  const [expanded, setExpanded] = useState(false), [code, setCode] = useState(''), [scan, setScan] = useState(false), [now, setNow] = useState(Date.now());
  const seen = useRef<string | null>(null), callback = useRef(onRead); callback.current = onRead;
  const modeCallback = useRef(onLinkedMode); modeCallback.current = onLinkedMode;
  useEffect(() => { modeCallback.current(Boolean(state.link?.status === 'LINKED' && !state.station?.pc)); }, [state.link?.status, state.station?.pc]);
  useEffect(() => { setBusy(busy); }, [busy, setBusy]);
  useEffect(() => () => { setBusy(true); }, [eventId]);
  const openReading = async (id: string) => { try { await callback.current(id); setReadError(''); } catch { setReadError('No se pudo abrir la ficha. Compruebe la conexión y reintente.'); } };
  useEffect(() => {
    if (!state.link || !connected) setScan(false);
    const reading = state.reading;
    if (state.station?.pc && reading?.status === 'PENDING' && reading.registrationId && !busy && seen.current !== reading.id) {
      seen.current = reading.id;
      void openReading(reading.registrationId);
    }
  }, [state, busy, connected]);
  useEffect(() => { if (location.state?.openScannerLink) setExpanded(true); }, [location.key, location.state]);
  useEffect(() => { setExpanded(Boolean(location.state?.openScannerLink)); setCode(''); setScan(false); seen.current = null; }, [eventId]);
  useEffect(() => { if (!state.link || state.link.status === 'LINKED') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state.link?.id, state.link?.status]);
  const link = state.link;
  const seconds = link ? Math.max(0, Math.ceil((Date.parse(link.expiresAt) - now) / 1000)) : 0;
  const isPC = presentation.device === 'desktop' || (presentation.device === 'ambiguous' && Boolean(state.station?.pc));
  const showPanel = expanded || Boolean(link && !state.station?.pc);
  return <section className="rounded-xl border border-border bg-card p-3 space-y-2 text-sm" aria-label="Vinculación de escáner móvil">
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary" aria-expanded={showPanel} onClick={() => {
        setExpanded(value => !value);
        void refresh();
        if (isPC && !state.station?.pc) void act('/station', { label: 'Recepción PC' });
      }}>{isPC && !state.station?.pc ? 'Habilitar escáner móvil' : isPC ? 'Escáner móvil' : 'Vincular teléfono a una PC'}</button>
      {state.station?.pc && <span className="text-xs text-muted-foreground">{link?.status === 'LINKED' ? 'Celular conectado' : 'Estación de recepción disponible'}</span>}
      {presentation.detected === 'ambiguous' && <label className="text-xs text-muted-foreground">Dispositivo
        <select aria-label="Tipo de dispositivo" className="bg-background border border-border rounded-lg text-base ml-2" value={presentation.override} onChange={e => presentation.choose(e.target.value)}>
          <option value="">Detección automática</option><option value="desktop">PC o laptop</option><option value="phone">Teléfono</option>
        </select>
      </label>}
    </div>
    {readError && <p role="alert">{readError} <button className="btn-secondary" onClick={() => { if (state.reading?.registrationId) void openReading(state.reading.registrationId); }}>Reintentar abrir ficha</button></p>}
    {showPanel && <>
    {!connected && <p role="status">Sin conexión con la estación. No se ha confirmado ninguna asistencia. <button onClick={() => void refresh()}>Reintentar</button></p>}
    {message && <p role="alert">{message}</p>}
    {!isPC && state.station?.pc && <button className="btn-secondary" disabled={pending} onClick={() => void act('/station/disable')}>Deshabilitar estación de esta sesión y usar como teléfono</button>}
    {!isPC && !link && !state.station?.pc && <div className="flex flex-wrap gap-2">
      {stations.map(station => <button disabled={pending} key={station.id} className="btn-secondary" onClick={() => void act('/request', { stationId: station.id })}>Vincular a {station.label}</button>)}
      {!stations.length && <span className="text-muted-foreground">Para vincular este teléfono, abre Recepción rápida en tu PC y selecciona Habilitar escáner móvil.</span>}
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
      const result = (await api.post(`/events/${eventId}/scanner/` + link.id + '/read', { token, requestKey: crypto.randomUUID() })).data.data;
      await refresh();
      if (result.status === 'REJECTED') {
        const messages: Record<string,string> = { ALREADY_CHECKED_IN: 'Esta entrada ya tiene asistencia registrada.', INVALID_CODE: 'El código QR no es válido.', CANCELLED: 'La entrada está cancelada.', EDITION_MISMATCH: 'La entrada pertenece a otra edición.' };
        throw { response: { data: { message: messages[result.result] || 'Lectura rechazada. No se ha confirmado asistencia.' } } };
      }
      setScan(false);
      return result.result;
    }} />
  </section>;
}
