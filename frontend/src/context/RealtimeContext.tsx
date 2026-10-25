import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useEdition } from './EditionContext';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
export interface RealtimeEvent<T = any> { type: string; eventId: string; timestamp: string; data: T; }
export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
interface RealtimeContextType { status: RealtimeStatus; isConnected: boolean; lastEvent: RealtimeEvent | null; reconnect: () => void; }
const RealtimeContext = createContext<RealtimeContextType>({ status: 'disconnected', isConnected: false, lastEvent: null, reconnect: () => {} });
export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentEvent, refreshEditions } = useEdition(); const { isAuthenticated, refreshSession, token } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>('disconnected'); const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const manual = useRef<() => void>(() => {}); const configuration = useRef(refreshEditions); configuration.current = refreshEditions;
  useEffect(() => {
    if (!isAuthenticated || !currentEvent?.id || !token) { setStatus('disconnected'); return; }
    const eventId = currentEvent.id; let active = true; let source: EventSource | null = null; let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined; let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let settingsTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = (payload: RealtimeEvent) => {
      if (!active) return; setLastEvent(payload);
      window.dispatchEvent(new CustomEvent('eventgrid:realtime', { detail: payload }));
      window.dispatchEvent(new CustomEvent(`eventgrid:realtime:${payload.type}`, { detail: payload }));
    };
    const resync = () => { publish({ type: 'RESYNC', eventId, timestamp: new Date().toISOString(), data: {} }); void refreshSession(); };
    const close = () => { source?.close(); source = null; clearTimeout(retryTimer); clearTimeout(stableTimer); };
    const connect = () => {
      close(); if (!active || !navigator.onLine) { setStatus('disconnected'); return; }
      setStatus(attempts ? 'reconnecting' : 'connecting');
      const base = (api.defaults.baseURL || '/api/v1').replace(/\/$/, '');
      const es = new EventSource(`${base}/events/${eventId}/stream?token=${encodeURIComponent(token)}`); source = es;
      es.onopen = () => {
        if (!active || source !== es) return; setStatus('connected'); resync();
        stableTimer = setTimeout(() => { attempts = 0; }, 10000);
      };
      es.onmessage = event => {
        if (!active || source !== es) return;
        try {
          const payload: RealtimeEvent = JSON.parse(event.data);
          if (payload.type === 'ACCESS_CHANGED') { void refreshSession(); return; }
          if (payload.eventId !== eventId) return;
          if (payload.type === 'DATA_CHANGED' && payload.data?.domains?.includes('settings')) {
            clearTimeout(settingsTimer); settingsTimer = setTimeout(() => { void configuration.current(true); }, 200);
          }
          publish(payload);
        } catch { if (import.meta.env.DEV) console.warn('EventGrid: mensaje SSE no válido.'); }
      };
      es.onerror = () => {
        if (!active || source !== es) return; close();
        if (++attempts > 5 || !navigator.onLine) { setStatus('disconnected'); return; }
        setStatus('reconnecting'); retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts));
      };
    };
    const wake = () => { if (source?.readyState === EventSource.OPEN) resync(); else { attempts = 0; connect(); } };
    const visible = () => { if (document.visibilityState === 'visible') wake(); };
    const offline = () => { close(); setStatus('disconnected'); };
    manual.current = wake; connect();
    window.addEventListener('online', wake); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
    return () => { active = false; close(); clearTimeout(settingsTimer); manual.current = () => {}; window.removeEventListener('online', wake); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [isAuthenticated, currentEvent?.id, token, refreshSession]);
  const reconnect = useCallback(() => manual.current(), []);
  return <RealtimeContext.Provider value={{ status, isConnected: status === 'connected', lastEvent, reconnect }}>{children}</RealtimeContext.Provider>;
};
export const useRealtime = () => useContext(RealtimeContext);
export function useRealtimeEvent<T = any>(eventType: string | string[], handler: (payload: RealtimeEvent<T>) => void) {
  const handlerRef = useRef(handler); handlerRef.current = handler;
  const key = (Array.isArray(eventType) ? eventType : [eventType]).join('|');
  useEffect(() => {
    const listener = (event: Event) => { const payload = (event as CustomEvent<RealtimeEvent<T>>).detail; if (payload) handlerRef.current(payload); };
    const types = key.split('|'); types.forEach(type => window.addEventListener(`eventgrid:realtime:${type}`, listener));
    return () => types.forEach(type => window.removeEventListener(`eventgrid:realtime:${type}`, listener));
  }, [key]);
}
// One coalesced read per mounted view. Events never carry authoritative counters.
const legacyDomains: Record<string, string[]> = {
  CHECK_IN_CONFIRMED: ['participants','attendance','inventory','dashboard'], PAYMENT_RECORDED: ['participants','attendance','sales','dashboard'],
  PARTICIPANT_REGISTERED: ['participants','attendance','inventory','sales','dashboard'], PARTICIPANTS_DELETED: ['participants','attendance','inventory','sales','dashboard'],
  TSHIRT_UPDATED: ['participants','attendance','inventory','dashboard'], TSHIRT_DELIVERED: ['participants','attendance','inventory','dashboard'],
};
export function useRealtimeRefresh(domain: string, refresh: () => void | Promise<unknown>) {
  const { currentEvent } = useEdition(); const callback = useRef(refresh); callback.current = refresh;
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let running = false; let pending = false;
    const run = async () => {
      if (!active) return; if (running) { pending = true; return; } running = true;
      try { await callback.current(); } catch {} finally { running = false; if (active && pending) { pending = false; timer = setTimeout(run, 200); } }
    };
    const listener = (event: Event) => {
      const payload = (event as CustomEvent<RealtimeEvent>).detail;
      if (!payload || payload.eventId !== currentEvent?.id) return;
      const domains = payload.data?.domains || legacyDomains[payload.type] || [];
      if (payload.type !== 'RESYNC' && !domains.includes(domain)) return;
      clearTimeout(timer); timer = setTimeout(run, 200);
    };
    window.addEventListener('eventgrid:realtime', listener);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('eventgrid:realtime', listener); };
  }, [domain, currentEvent?.id]);
}
