import React, { useState } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  CalendarDays,
  Plus,
  Copy,
  Calendar,
  MapPin,
  CheckCircle,
  Clock,
  Archive,
  Layers,
} from 'lucide-react';

export const EditionsPage: React.FC = () => {
  const { events, currentEvent, switchEdition, refreshEditions } = useEdition();
  const { hasRole } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [sourceEventId, setSourceEventId] = useState<string>('');

  // Formulario nueva edición
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [year, setYear] = useState(2027);
  const [startDate, setStartDate] = useState('2027-11-06T08:00');
  const [endDate, setEndDate] = useState('2027-11-06T18:00');
  const [venue, setVenue] = useState('Centro de Convenciones Principal');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCreateEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await api.post('/events', {
        name,
        slug,
        year: Number(year),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        venue,
      });
      setMessage('✅ Edición creada exitosamente');
      await refreshEditions();
      setModalOpen(false);
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.message || 'Error al crear edición'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloneEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceEventId) return;
    setLoading(true);
    setMessage(null);
    try {
      await api.post(`/events/${sourceEventId}/clone`, {
        name,
        slug,
        year: Number(year),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        venue,
        copySettings: true,
        copyPaymentMethods: true,
        copySalesResponsibles: true,
        copyCustomFields: true,
      });
      setMessage('✅ Edición clonada con éxito sin duplicar participantes');
      await refreshEditions();
      setCloneModalOpen(false);
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.message || 'Error al clonar edición'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Administración Multiedición
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Gestión independiente de eventos y ediciones en EventGrid con aislamiento estricto de registros.
          </p>
        </div>

        {hasRole(['ADMIN']) && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setName('BarCamp RD 2027');
                setSlug('barcamp-rd-2027');
                setYear(2027);
                setSourceEventId(currentEvent?.id || '');
                setCloneModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 text-primary" />
              <span>Duplicar Configuración</span>
            </button>
            <button
              onClick={() => {
                setName('BarCamp RD 2027');
                setSlug('barcamp-rd-2027');
                setYear(2027);
                setModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Edición</span>
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
          {message}
        </div>
      )}

      {/* Grid de Ediciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {events.map((ev) => {
          const isCurrent = currentEvent?.id === ev.id;
          return (
            <div
              key={ev.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                isCurrent
                  ? 'bg-card border-primary ring-2 ring-primary/40 shadow-xl'
                  : 'bg-card/70 border-border hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-muted-foreground uppercase px-2 py-0.5 rounded bg-muted">
                    Año {ev.year}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isCurrent && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary text-white">
                        EN CONTEXTO
                      </span>
                    )}
                    <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {ev.status.toLowerCase()}
                    </span>
                  </div>
                </div>

                <h3 className="text-lg font-extrabold text-foreground tracking-tight">
                  {ev.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {ev.description || 'Sin descripción disponible'}
                </p>

                <div className="mt-4 space-y-2 text-xs text-muted-foreground border-t border-border/80 pt-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{ev.venue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>
                      {new Date(ev.startDate).toLocaleDateString('es-DO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-muted-foreground block text-[10px] uppercase font-mono">Participantes</span>
                  <strong className="text-foreground text-sm font-bold">
                    {ev._count?.registrations || 0}
                  </strong>
                </div>

                {!isCurrent ? (
                  <button
                    onClick={() => switchEdition(ev.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-background hover:bg-muted border border-border text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    Activar en Dashboard
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Edición Activa
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal para Crear Nueva Edición */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-1">Crear Nueva Edición</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Registra una nueva edición anual independiente para BarCamp RD.
            </p>
            <form onSubmit={handleCreateEdition} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Año</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Lugar</label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover"
                >
                  {loading ? 'Creando...' : 'Crear Edición'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Duplicar Configuración */}
      {cloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-1">Duplicar Configuración de Edición</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Copia la paleta de colores, responsables y métodos de pago de una edición anterior para preparar la siguiente, <strong>sin transferir asistentes</strong>.
            </p>
            <form onSubmit={handleCloneEdition} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Edición Origen</label>
                <select
                  value={sourceEventId}
                  onChange={(e) => setSourceEventId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} ({ev.year})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre de la Nueva Edición</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Año</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloneModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover"
                >
                  {loading ? 'Duplicando...' : 'Confirmar y Duplicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
