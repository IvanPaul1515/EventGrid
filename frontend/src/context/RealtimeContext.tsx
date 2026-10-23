import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useEdition } from './EditionContext';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

export interface RealtimeEvent<T = any> {
  type: string;
  eventId: string;
  timestamp: string;
  data: T;
}

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface RealtimeContextType {
  status: RealtimeStatus;
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextType>({
  status: 'disconnected',
  isConnected: false,
  lastEvent: null,
  reconnect: () => {},
});

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentEvent } = useEdition();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  const retryCount = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const cleanupConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !currentEvent) {
      cleanupConnection();
      setStatus('disconnected');
      return;
    }

    cleanupConnection();
    setStatus('connecting');
    activeEventIdRef.current = currentEvent.id;

    const token = localStorage.getItem('barcamp_token') || '';
    const apiBase = (api.defaults.baseURL || '/api/v1').replace(/\/$/, '');
    const sseUrl = `${apiBase}/events/${currentEvent.id}/stream?token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isMountedRef.current) return;
        retryCount.current = 0;
        setStatus('connected');
      };

      es.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const payload: RealtimeEvent = JSON.parse(event.data);
          setLastEvent(payload);

          // Disparar evento DOM global para componentes oyentes
          window.dispatchEvent(new CustomEvent('eventgrid:realtime', { detail: payload }));
          window.dispatchEvent(new CustomEvent(`eventgrid:realtime:${payload.type}`, { detail: payload }));
        } catch {
          // Ignorar mensajes con formato no JSON (e.g. pings)
        }
      };

      es.onerror = () => {
        if (!isMountedRef.current) return;
        if (++retryCount.current > 5) { cleanupConnection(); setStatus('disconnected'); return; }
        setStatus('reconnecting');
        cleanupConnection();

        // Reintento con retroceso exponencial suave
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && isAuthenticated && currentEvent) {
            connect();
          }
        }, Math.min(30000, 1000 * 2 ** retryCount.current));
      };
    } catch {
      setStatus('disconnected');
    }
  }, [isAuthenticated, currentEvent, cleanupConnection]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    // Manejar reconexión cuando la pestaña vuelve a primer plano (especialmente en iPhone / PWA)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && status !== 'connected') {
        connect();
        window.dispatchEvent(new CustomEvent('eventgrid:realtime:RECONNECTED'));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      cleanupConnection();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect]);

  return (
    <RealtimeContext.Provider
      value={{
        status,
        isConnected: status === 'connected',
        lastEvent,
        reconnect: connect,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => useContext(RealtimeContext);

/**
 * Hook para suscribirse a un tipo de evento específico en tiempo real
 */
export function useRealtimeEvent<T = any>(
  eventType: string | string[],
  handler: (payload: RealtimeEvent<T>) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<RealtimeEvent<T>>;
      if (customEvent.detail) {
        handlerRef.current(customEvent.detail);
      }
    };

    for (const type of types) {
      window.addEventListener(`eventgrid:realtime:${type}`, listener);
    }

    return () => {
      for (const type of types) {
        window.removeEventListener(`eventgrid:realtime:${type}`, listener);
      }
    };
  }, [eventType]);
}
