import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useReceptionQueue } from './ReceptionQueueContext';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeEvent } from '../../context/RealtimeContext';
import { useDevicePresentation } from './useDevicePresentation';
export type ScannerSnapshot = {
  station: { id: string; label: string; pc: boolean } | null;
  link: { id: string; status: string; code?: string; expiresAt: string; user: string } | null;
  reading: { id: string; registrationId?: string; status: string; result: string } | null;
};
const empty: ScannerSnapshot = { station: null, link: null, reading: null };
type ScannerContextValue = {
  ready: boolean; notice: string; state: ScannerSnapshot; stations: { id: string; label: string }[]; connected: boolean; pending: boolean; message: string;
  presentation: ReturnType<typeof useDevicePresentation>; dismissed: boolean; dismissSuggestion: () => void;
  refresh: () => Promise<void>; act: (path: string, body?: object) => Promise<void>; setBusy: (busy: boolean) => void;
};
const Context = createContext<ScannerContextValue | null>(null);
const stored = (key: string) => { try { return sessionStorage.getItem(key) === 'dismissed'; } catch { return false; } };
export function ScannerProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth(), { currentEvent } = useEdition(), { pathname } = useLocation();
  const presentation = useDevicePresentation();
  const queue = useReceptionQueue();
  const [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  const explicitUnlink = useRef(false);
  const [state, setState] = useState(empty), [stations, setStations] = useState<{ id: string; label: string }[]>([]);
  const [connected, setConnected] = useState(true), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const key = `eventgrid:scanner-suggestion:${currentEvent?.id}:${token?.slice(-24)}`;
  const [dismissed, setDismissed] = useState(() => stored(key));
  const busy = useRef(true), snapshot = useRef(state), epoch = useRef(0), mutation = useRef(false);
  snapshot.current = state;
  const current = useRef({ pathname, device: presentation.device, dismissed }); current.current = { pathname, device: presentation.device, dismissed };
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const eventId = currentEvent?.id, base = `/events/${eventId}/scanner`;
  useEffect(() => {
    let active = true, running: Promise<void> | null = null, again = false, advertised = false;
    setReady(false); setNotice(''); setState(empty); setStations([]); setMessage(''); setDismissed(stored(key)); busy.current = !['/reception','/attendance'].includes(current.current.pathname);
    if (user?.scannerOnly || queue.state.station?.mode === 'QUEUE' || !eventId || !token || !['ADMIN','OPERATOR'].includes(user?.role || '')) { setReady(true); refreshRef.current = async () => {}; return; }
    const load = (): Promise<void> => {
      if (!active) return Promise.resolve();
      if (running) { again = true; return running; }
      running = (async () => {
        do {
          again = false; const generation = epoch.current;
          try {
            const next: ScannerSnapshot = (await api.post(base + '/state', { busy: busy.current })).data.data;
            if (!active || generation !== epoch.current) continue;
            // Presence is optional pairing availability, never an authorization.
            // Reuse the authenticated station lease; a phone still needs PC approval.
            if (!next.station && !next.link && current.current.device === 'desktop' && !advertised) {
              advertised = true;
              await api.post(base + '/station', { label: 'Computadora disponible' });
              again = true; continue;
            }
            if (snapshot.current.link?.status === 'LINKED' && !next.link && !explicitUnlink.current) setNotice('La vinculación ha finalizado o caducado. Puedes utilizar EventGrid normalmente.');
            if (snapshot.current.link && snapshot.current.link.status !== 'LINKED' && !next.link && !explicitUnlink.current) setNotice('Solicitud rechazada o vencida. Puedes solicitar una nueva vinculación.');
            setReady(true); setState(next); snapshot.current = next; setConnected(true); setMessage('');
            const reception = ['/reception','/attendance'].includes(current.current.pathname);
            if (!next.link && (current.current.device !== 'desktop') && (reception || !current.current.dismissed)) {
              const available = (await api.get(base + '/stations')).data.data;
              if (active && generation === epoch.current) setStations(available);
            } else if (active) setStations([]);
          } catch (error: any) {
            if (active && generation === epoch.current) {
              setReady(true); setConnected(false); setStations([]);
              setMessage(error.response?.data?.message || (navigator.onLine ? 'No se pudo consultar la estación. Reintente la conexión.' : 'Sin conexión. No se ha confirmado ninguna asistencia.'));
              if ([401,403].includes(error.response?.status)) { setState(empty); snapshot.current = empty; }
            }
          }
        } while (active && again);
      })().finally(() => { running = null; });
      return running;
    };
    refreshRef.current = load; void load();
    // One owner across module changes. No unlink is ever sent from React cleanup.
    const timer = window.setInterval(() => {
      const c = current.current;
      if (document.visibilityState === 'visible' && navigator.onLine && (snapshot.current.station || snapshot.current.link || ['/reception','/attendance'].includes(c.pathname) || (c.device === 'phone' && !c.dismissed))) void load();
    }, 15000);
    const wake = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); };
    const offline = () => setConnected(false);
    window.addEventListener('online', wake); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', wake);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', wake); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', wake); };
  }, [eventId, token, user?.role, user?.scannerOnly, queue.state.station?.mode, base, key]);
  useRealtimeEvent(['SCANNER_CHANGED','SCANNER_STATIONS_CHANGED','RESYNC','CHECK_IN_CONFIRMED'], event => { if (event.type !== 'CHECK_IN_CONFIRMED' || snapshot.current.link) void refreshRef.current(); });
  const dismissSuggestion = () => { setDismissed(true); try { sessionStorage.setItem(key, 'dismissed'); } catch {} };
  const act = async (path: string, body: object = {}) => {
    if (mutation.current) return;
    mutation.current = true; explicitUnlink.current = path.endsWith('/unlink'); epoch.current++; setPending(true); setMessage(''); setNotice('');
    try { await api.post(base + path, body); await refreshRef.current(); }
    catch (error: any) { await refreshRef.current(); setMessage(error.response?.data?.message || 'No se pudo completar. Compruebe la conexión y consulte el estado antes de reintentar.'); }
    finally { mutation.current = false; explicitUnlink.current = false; setPending(false); }
  };
  const setBusy = useCallback((value: boolean) => { if (busy.current !== value) { busy.current = value; void refreshRef.current(); } }, []);
  return <Context.Provider value={{ ready, notice, state, stations, connected, pending, message, presentation, dismissed, dismissSuggestion, refresh: () => refreshRef.current(), act, setBusy }}>{children}</Context.Provider>;
}
export function useScanner() { const value = useContext(Context); if (!value) throw new Error('ScannerProvider is required'); return value; }
