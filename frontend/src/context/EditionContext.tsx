import React, { createContext, useContext, useState, useEffect } from 'react';
import { FailureKind, failureKind } from '../utils/appError';
import { EventEdition } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface EditionContextType {
  events: EventEdition[];
  currentEvent: EventEdition | null;
  isLoading: boolean;
  error: FailureKind | null;
  switchEdition: (eventId: string) => void;
  refreshEditions: (silent?: boolean) => Promise<void>;
}

const EditionContext = createContext<EditionContextType | undefined>(undefined);

export const EditionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [events, setEvents] = useState<EventEdition[]>([]);
  const [currentEvent, setCurrentEvent] = useState<EventEdition | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [error, setError] = useState<FailureKind | null>(null);
  const fetchVersion = React.useRef(0);
  const fetchEditions = async (silent = false) => {
    const version = ++fetchVersion.current;
    setError(null);
    if (!isAuthenticated) {
      setEvents([]);
      setCurrentEvent(null);
      setIsLoading(false);
      return;
    }

    try {
      if (!silent) setIsLoading(true);
      const res = await api.get('/events');
      if (version !== fetchVersion.current) return;
      const rawEvents: EventEdition[] = res.data.data;
      const loadedEvents = (rawEvents || []).map((e) => {
        if (e.settings && typeof (e.settings as any).tshirtSizes === 'string') {
          try {
            return {
              ...e,
              settings: {
                ...e.settings,
                tshirtSizes: JSON.parse((e.settings as any).tshirtSizes),
              },
            };
          } catch {
            return {
              ...e,
              settings: {
                ...e.settings,
                tshirtSizes: [],
              },
            };
          }
        }
        return e;
      });
      setEvents(loadedEvents);

      if (!loadedEvents.length) setCurrentEvent(null);
      if (loadedEvents.length > 0) {
        const storedId = localStorage.getItem('barcamp_current_event_id');
        let selected = loadedEvents.find((e) => e.id === storedId);

        // Si no está guardado o ya no existe, buscar el por defecto o el activo más reciente
        if (!selected) {
          selected = loadedEvents.find((e) => e.isDefault) ||
            loadedEvents.find((e) => e.status === 'ACTIVE') ||
            loadedEvents[0];
        }

        if (selected) {
          setCurrentEvent(selected);
          localStorage.setItem('barcamp_current_event_id', selected.id);
        }
      }
    } catch (error) {
      if (!silent && version === fetchVersion.current) setError(failureKind(error));
    } finally {
      if (version === fetchVersion.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEditions();
  }, [isAuthenticated, user?.id, user?.role, user?.assignedEventId]);

  const switchEdition = (eventId: string) => {
    if (user?.role !== 'ADMIN') return;
    const selected = events.find((e) => e.id === eventId);
    if (selected) {
      setCurrentEvent(selected);
      localStorage.setItem('barcamp_current_event_id', selected.id);
      // Notificar a observadores o recargar contexto limpio
      window.dispatchEvent(new CustomEvent('barcamp_edition_changed', { detail: selected }));
    }
  };

  return (
    <EditionContext.Provider
      value={{
        events,
        currentEvent,
        isLoading,
        error,
        switchEdition,
        refreshEditions: fetchEditions,
      }}
    >
      {children}
    </EditionContext.Provider>
  );
};

export const useEdition = () => {
  const context = useContext(EditionContext);
  if (!context) {
    throw new Error('useEdition debe ser utilizado dentro de un EditionProvider');
  }
  return context;
};
