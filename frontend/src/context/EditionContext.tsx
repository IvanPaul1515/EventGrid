import React, { createContext, useContext, useState, useEffect } from 'react';
import { EventEdition } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface EditionContextType {
  events: EventEdition[];
  currentEvent: EventEdition | null;
  isLoading: boolean;
  switchEdition: (eventId: string) => void;
  refreshEditions: () => Promise<void>;
}

const EditionContext = createContext<EditionContextType | undefined>(undefined);

export const EditionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [events, setEvents] = useState<EventEdition[]>([]);
  const [currentEvent, setCurrentEvent] = useState<EventEdition | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchEditions = async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.get('/events');
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
      console.error('❌ Error al cargar ediciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEditions();
  }, [isAuthenticated]);

  const switchEdition = (eventId: string) => {
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
