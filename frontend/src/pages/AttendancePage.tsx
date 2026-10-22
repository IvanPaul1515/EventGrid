import { MobileSearchInput } from '../components/common/MobileSearchInput';
import { useLocation, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useRealtimeEvent } from '../context/RealtimeContext';
import {
  attendanceService,
  AttendanceCounters,
} from '../services/attendance.service';
import {
  participantsService,
  DetailedRegistration,
} from '../services/participants.service';
import { Registration, TicketType, PaymentMethod, DailySalesSummary } from '../types';
import { ParticipantDetailDrawer } from '../components/participants/ParticipantDetailDrawer';
import { OnsiteSaleModal } from '../components/sales/OnsiteSaleModal';
import { ParticipantFormModal } from '../components/participants/ParticipantFormModal';
import { QrScanModal } from '../components/qr/QrScanModal';
import { api } from '../services/api';
import {
  Search,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Users,
  Calendar,
  Tag,
  Phone,
  Mail,
  Building,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  UserPlus,
  Eye,
  CreditCard,
  Check,
  QrCode,
  Shirt,
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { user, hasRole } = useAuth();

  // Estados de datos
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [counters, setCounters] = useState<AttendanceCounters>({
    totalRegistrations: 0,
    attendedCount: 0,
    pendingCount: 0,
  });

  // Resumen de ventas del día en recepción
  const [dailySales, setDailySales] = useState<DailySalesSummary | null>(null);

  // Estado de conexión del servidor (Online ping)
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Catálogos de la edición activa
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Recuperar estado persistente en sesión
  const getInitialAttFilters = () => {
    try {
      const saved = sessionStorage.getItem('eventgrid_attendance_filters');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const initAtt = getInitialAttFilters();

  // Filtros y búsqueda
  const [search, setSearch] = useState<string>(initAtt.search || '');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ATTENDED' | 'PENDING'>(initAtt.statusFilter || 'ALL');
  const [page, setPage] = useState<number>(initAtt.page || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modales
  const [selectedRegistration, setSelectedRegistration] = useState<DetailedRegistration | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOnsiteSaleOpen, setIsOnsiteSaleOpen] = useState(false);
  const [isNewParticipantOpen, setIsNewParticipantOpen] = useState(false);
  const [registrationToEdit, setRegistrationToEdit] = useState<Registration | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [isQrScanOpen, setIsQrScanOpen] = useState(false);
  useEffect(() => {
    if (location.state?.openQr && hasRole(['ADMIN', 'OPERATOR'])) {
      setIsQrScanOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, user?.role]);

  // Feedback temporal
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
    ticket?: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Enfocar buscador al cargar
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Monitoreo del estado de conexión con el servidor
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await api.get('/health');
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 20000);
    return () => clearInterval(interval);
  }, []);

  // Cargar catálogos y resumen de ventas diarias
  useEffect(() => {
    if (currentEvent) {
      api.get(`/events/${currentEvent.id}`).then((res) => {
        if (res.data.data) {
          setTicketTypes(res.data.data.ticketTypes || []);
          setPaymentMethods(res.data.data.paymentMethods || []);
        }
      }).catch(console.error);

      attendanceService.getDailySales().then(setDailySales).catch(console.error);
    }
  }, [currentEvent]);

  // Cargar datos y contadores
  const fetchAttendance = useCallback(async () => {
    if (!currentEvent) return;
    try {
      setLoading(true);
      const res = await attendanceService.searchAndList({
        search: search.trim() || undefined,
        status: statusFilter,
        page,
        limit: 20,
      });

      setRegistrations(res.data);
      setCounters(res.counters);
      setTotalFound(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.error('Error al cargar lista de asistencia:', err);
    } finally {
      setLoading(false);
    }
  }, [currentEvent, search, statusFilter, page]);

  // Persistir estado de filtros de asistencia en sessionStorage
  useEffect(() => {
    sessionStorage.setItem(
      'eventgrid_attendance_filters',
      JSON.stringify({ search, statusFilter, page })
    );
  }, [search, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [currentEvent?.id]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Sincronización en tiempo real sin recargas de página completa ni pérdida de contexto
  useRealtimeEvent('CHECK_IN_CONFIRMED', (event) => {
    const data = event.data;
    if (!data?.registrationId) return;

    // Actualizar registro en lista en memoria (in-place sin recargar tabla)
    setRegistrations((prev) =>
      prev.map((reg) => {
        if (reg.id === data.registrationId) {
          return {
            ...reg,
            attended: true,
            attendedAt: data.attendedAt || new Date().toISOString(),
            attendedByUser: data.attendedByName ? { id: data.attendedByUserId || '', fullName: data.attendedByName, email: data.attendedByEmail || '' } : reg.attendedByUser,
            tshirtSize: data.tshirtSize || reg.tshirtSize,
            tshirtDelivered: data.tshirtDelivered !== undefined ? data.tshirtDelivered : reg.tshirtDelivered,
          };
        }
        return reg;
      })
    );

    // Actualizar contadores inmediatamente
    if (data.counters) {
      setCounters(data.counters);
    } else {
      setCounters((prev) => ({
        ...prev,
        attendedCount: prev.attendedCount + 1,
        pendingCount: Math.max(0, prev.pendingCount - 1),
      }));
    }

    // Actualizar ficha de participante si está abierta (sin cerrarla)
    setSelectedRegistration((prev) => {
      if (prev && prev.id === data.registrationId) {
        return {
          ...prev,
          attended: true,
          attendedAt: data.attendedAt || new Date().toISOString(),
          attendedByUser: data.attendedByName ? { id: data.attendedByUserId || '', fullName: data.attendedByName, email: data.attendedByEmail || '' } : prev.attendedByUser,
          tshirtSize: data.tshirtSize || prev.tshirtSize,
          tshirtDelivered: data.tshirtDelivered !== undefined ? data.tshirtDelivered : prev.tshirtDelivered,
        };
      }
      return prev;
    });
  });

  useRealtimeEvent('ATTENDANCE_REVERTED', (event) => {
    const data = event.data;
    if (!data?.registrationId) return;

    setRegistrations((prev) =>
      prev.map((reg) => {
        if (reg.id === data.registrationId) {
          return {
            ...reg,
            attended: false,
            attendedAt: undefined,
            attendedByUser: undefined,
          };
        }
        return reg;
      })
    );

    if (data.counters) {
      setCounters(data.counters);
    } else {
      setCounters((prev) => ({
        ...prev,
        attendedCount: Math.max(0, prev.attendedCount - 1),
        pendingCount: prev.pendingCount + 1,
      }));
    }

    setSelectedRegistration((prev) => {
      if (prev && prev.id === data.registrationId) {
        return {
          ...prev,
          attended: false,
          attendedAt: undefined,
          attendedByUser: undefined,
        };
      }
      return prev;
    });
  });

  useRealtimeEvent('PARTICIPANTS_DELETED', () => {
    setSelectedRegistration(null);
    fetchAttendance();
  });

  useRealtimeEvent('PARTICIPANT_REGISTERED', () => {
    attendanceService.getCounters().then(setCounters).catch(() => {});
  });

  // Evento local entre componentes (compatibilidad)
  useEffect(() => {
    const handleDataRefresh = () => {
      attendanceService.getCounters().then(setCounters).catch(() => {});
    };
    window.addEventListener('eventgrid:data-refresh', handleDataRefresh);
    return () => {
      window.removeEventListener('eventgrid:data-refresh', handleDataRefresh);
    };
  }, []);

  // Mostrar mensaje de feedback temporal
  const showFeedback = (
    type: 'success' | 'warning' | 'error',
    title: string,
    message: string,
    ticket?: string
  ) => {
    setFeedback({ type, title, message, ticket });
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  // Abrir la Ficha del Participante (NUNCA marca asistencia directamente)
  const handleOpenDrawer = async (reg: Registration) => {
    try {
      const detailed = await participantsService.getById(reg.id);
      setSelectedRegistration(detailed);
      setIsDrawerOpen(true);
    } catch (err) {
      console.error('Error al abrir la ficha del participante:', err);
    }
  };

  // Manejo de teclado en el buscador:
  // Enter abre la ficha detallada del participante destacado. NUNCA registra asistencia automáticamente.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearch('');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (registrations.length > 0) {
        handleOpenDrawer(registrations[0]);
      }
    }
  };

  // Navegación entre participantes en el drawer
  const currentDrawerIndex = registrations.findIndex((r) => r.id === selectedRegistration?.id);
  const hasPrevDrawer = currentDrawerIndex > 0;
  const hasNextDrawer = currentDrawerIndex >= 0 && currentDrawerIndex < registrations.length - 1;

  const handleNavigateDrawer = async (direction: 'prev' | 'next') => {
    if (currentDrawerIndex === -1) return;
    const nextIdx = direction === 'prev' ? currentDrawerIndex - 1 : currentDrawerIndex + 1;
    if (nextIdx >= 0 && nextIdx < registrations.length) {
      const targetReg = registrations[nextIdx];
      try {
        const detailed = await participantsService.getById(targetReg.id);
        setSelectedRegistration(detailed);
      } catch (err) {
        console.error('Error navegando participante:', err);
      }
    }
  };

  // Exportar reporte de asistencia
  const handleExport = async () => {
    try {
      await attendanceService.exportAttendance({
        status: statusFilter,
        search: search.trim() || undefined,
      });
      showFeedback('success', 'Descarga Iniciada', 'El archivo Excel de asistencia se generó correctamente.');
    } catch (err) {
      showFeedback('error', 'Error', 'No se pudo generar la exportación de asistencia.');
    }
  };

  const attendancePercentage =
    counters.totalRegistrations > 0
      ? Math.round((counters.attendedCount / counters.totalRegistrations) * 100)
      : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Encabezado Principal de Recepción */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              {currentEvent?.name || 'Evento Activo'}
            </span>
            <span className="text-xs text-muted-foreground">• Mesa de Recepción y Control de Asistencia</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-foreground flex items-center gap-2">
              <span>Control de Asistencia</span>
            </h1>
            {/* Indicador de conexión en tiempo real */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
              }`}
              title={isOnline ? 'Conexión activa con el servidor' : 'Sin conexión con el servidor'}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Localice participantes por nombre, cédula, correo o ticket. Haga clic para consultar su ficha oficial y registrar su llegada.
          </p>
        </div>

        {/* Botones de Acción de Recepción */}
        <div className="flex flex-wrap items-center gap-2.5">
          {hasRole(['ADMIN', 'OPERATOR']) && (
            <>
              <button
                type="button"
                onClick={() => setIsQrScanOpen(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                title="Escanear entrada QR con cámara o lector USB"
              >
                <QrCode className="w-4 h-4" />
                <span>Escanear QR</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOnsiteSaleOpen(true)}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Nueva Venta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegistrationToEdit(null);
                  setIsNewParticipantOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <UserPlus className="w-4 h-4 text-primary" />
                <span>Nuevo Participante</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="Descargar lista de asistencia en Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar Asistencia (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Resumen Diario de Recepción: Ventas y Cobros de Hoy */}
      {dailySales && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-card via-card to-primary/5 border border-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                Caja y Recaudación de Hoy ({dailySales.date})
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-mono font-bold text-foreground">
                  RD$ {dailySales.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-muted-foreground">
                  • {dailySales.totalSalesCount} venta(s) ({dailySales.onsiteSalesCount} presenciales)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(dailySales.byMethod).map(([method, data]) => (
              <span
                key={method}
                className="px-2.5 py-1 rounded-lg bg-background border border-border text-xs font-semibold text-foreground flex items-center gap-1.5"
              >
                <span className="text-muted-foreground">{method}:</span>
                <strong className="text-primary">RD$ {data.total.toLocaleString('es-DO')}</strong>
                <span className="text-[10px] text-muted-foreground font-mono">({data.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tarjetas KPI de Asistencia en Tiempo Real */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Registrados */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Total Registrados
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-foreground">
                {counters.totalRegistrations}
              </span>
              <span className="text-xs text-muted-foreground">personas</span>
            </div>
            <span className="text-[11px] text-zinc-500 mt-1 block">Inscripciones registradas en la edición</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Asistieron (Llegaron al Recinto) */}
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-sm flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
                Asistieron al Evento
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                {attendancePercentage}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-emerald-400">
                {counters.attendedCount}
              </span>
              <span className="text-xs text-emerald-300/80">presentes</span>
            </div>
            <span className="text-[11px] text-emerald-400/80 mt-1 block">Asistencias confirmadas en sala</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Pendientes de Llegada */}
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
              Pendientes de Llegada
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-amber-400">
                {counters.pendingCount}
              </span>
              <span className="text-xs text-amber-300/80">no han llegado</span>
            </div>
            <span className="text-[11px] text-amber-400/80 mt-1 block">Esperados en mesa de recepción</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Banner de Feedback / Confirmación Visual */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-lg animate-in fade-in zoom-in-95 duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : feedback.type === 'warning'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            ) : feedback.type === 'warning' ? (
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-foreground">{feedback.title}</h4>
                {feedback.ticket && (
                  <span className="px-2 py-0.5 rounded font-mono text-xs font-black bg-zinc-900 border border-zinc-700 text-white">
                    {feedback.ticket}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5 leading-relaxed">{feedback.message}</p>
            </div>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 p-1 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Buscador Destacado de Recepción */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-md space-y-3">
        <div className="relative">
          <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
          <MobileSearchInput
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar por nombre, apellido, cédula, correo, teléfono, institución o ticket (ej. BC26-0001)..."
            className="w-full pl-12 sm:pl-14 pr-28 py-4 bg-background border-2 border-border focus:border-primary rounded-2xl text-sm sm:text-base text-foreground placeholder-muted-foreground focus:outline-none transition-all shadow-inner font-medium"
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {search ? (
              <button
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="px-2 py-1 rounded-lg text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer font-bold"
              >
                Limpiar (Esc)
              </button>
            ) : (
              <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg text-[11px] font-mono bg-muted text-muted-foreground">
                Enter para abrir ficha
              </span>
            )}
          </div>
        </div>

        {/* Pestañas de Filtro Rápido */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              Todos ({counters.totalRegistrations})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-black font-bold border-amber-500 shadow-sm'
                  : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              No han llegado ({counters.pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('ATTENDED')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                statusFilter === 'ATTENDED'
                  ? 'bg-emerald-500 text-black font-bold border-emerald-500 shadow-sm'
                  : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              Asistieron ({counters.attendedCount})
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-mono">
            {totalFound} participante(s) encontrado(s)
          </span>
        </div>
      </div>

      {/* Listado de Resultados (Flujo: Clic en la fila abre la Ficha) */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-muted-foreground">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <span className="text-xs font-semibold">Consultando participantes en {currentEvent?.name}...</span>
          </div>
        ) : registrations.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Users className="w-12 h-12 text-muted-foreground mx-auto opacity-30" />
            <h3 className="text-sm font-bold text-foreground">
              {search ? 'No se encontraron participantes que coincidan con la búsqueda' : 'No hay participantes con este filtro'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? `Intente buscar por nombre, cédula, correo o institución.`
                : `Los participantes inscritos se mostrarán aquí.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {registrations.map((reg) => {
              const p = reg.participant;
              const ticketPrice = reg.isCourtesy ? 0 : Number(reg.ticketPrice ?? reg.totalAmount ?? 0);
              const amountPaid = reg.isCourtesy ? 0 : Number(reg.amountPaid ?? reg.totalAmount ?? 0);
              const balanceDue = reg.isCourtesy ? 0 : Math.max(0, ticketPrice - amountPaid);

              return (
                <div
                  key={reg.id}
                  onClick={() => handleOpenDrawer(reg)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenDrawer(reg);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all cursor-pointer focus:outline-none focus:bg-muted/50 select-none ${
                    reg.attended
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                      : 'hover:bg-muted/50'
                  }`}
                  title="Haz clic o presiona Enter para abrir la ficha de este participante"
                >
                  {/* Avatar y Datos del Participante */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
                        reg.attended
                          ? 'bg-emerald-500 text-black font-black'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      }`}
                    >
                      {reg.attended ? (
                        <Check className="w-6 h-6 stroke-[3]" />
                      ) : (
                        `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-bold text-base text-foreground hover:text-primary transition-colors">
                          {p.fullName}
                        </span>

                        {p.institution && (
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-muted text-primary border border-border">
                            {p.institution}
                          </span>
                        )}

                        {(reg.isDemo || p.isDemo) && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            DEMO
                          </span>
                        )}

                        {/* 1. Badge de Estado de Inscripción */}
                        {reg.status === 'CONFIRMED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            Inscripción Confirmada
                          </span>
                        )}
                        {reg.status === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Inscripción Pendiente
                          </span>
                        )}
                        {reg.status === 'CANCELLED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Cancelado
                          </span>
                        )}

                        {/* 2. Badge de Estado de Pago */}
                        {reg.isCourtesy || reg.paymentStatus === 'COURTESY' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Cortesía RD$ 0
                          </span>
                        ) : reg.paymentStatus === 'PAID' || balanceDue === 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Pago Completo
                          </span>
                        ) : reg.paymentStatus === 'PARTIAL' || amountPaid > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Abono Parcial (Debe RD$ {balanceDue.toFixed(2)})
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Pago Pendiente (Debe RD$ {balanceDue.toFixed(2)})
                          </span>
                        )}

                        {/* 3. Badge de Talla de Camiseta (si ya fue registrada) */}
                        {reg.tshirtSize && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30 inline-flex items-center gap-1">
                            <Shirt className="w-3 h-3" /> Talla {reg.tshirtSize}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-xs text-muted-foreground font-mono">
                        <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-white font-bold text-xs">
                          {reg.registrationNumber}
                        </span>
                        {p.documentId && <span>Doc: <strong className="text-foreground">{p.documentId}</strong></span>}
                        <span className="truncate max-w-[200px]">{p.email}</span>
                        {p.phone && <span>Tel: {p.phone}</span>}
                        <span>• {reg.ticketType?.name || (reg.isCourtesy ? 'Cortesía' : 'General')}</span>
                      </div>

                      {/* Información de llegada si ya ingresó */}
                      {reg.attended && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-emerald-400">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            Ingresó a las:{' '}
                            {reg.attendedAt
                              ? new Date(reg.attendedAt).toLocaleTimeString('es-DO', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })
                              : 'Confirmado'}
                          </span>
                          {reg.attendedByUser && (
                            <span className="text-zinc-400">
                              • Operador: <strong className="text-zinc-200">{reg.attendedByUser.fullName}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado y Botón de Abrir Ficha (REGLA: NUNCA check-in directo) */}
                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    {reg.attended ? (
                      <div className="px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>ASISTIÓ</span>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs font-semibold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>No ha llegado</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDrawer(reg);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground hover:text-primary text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Ficha</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>Página {page} de {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ficha 360° del Participante */}
      <ParticipantDetailDrawer
        registration={selectedRegistration}
        isOpen={isDrawerOpen}
        paymentMethods={paymentMethods}
        onClose={() => setIsDrawerOpen(false)}
        onEdit={(reg) => {
          setRegistrationToEdit(reg);
          setIsNewParticipantOpen(true);
        }}
        onUpdated={(updatedReg) => {
          setSelectedRegistration(updatedReg);
          setRegistrations((prev) =>
            prev.map((r) => (r.id === updatedReg.id ? updatedReg : r))
          );
          attendanceService.getCounters().then(setCounters).catch(console.error);
          window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
        }}
        onNavigate={handleNavigateDrawer}
        hasPrev={hasPrevDrawer}
        hasNext={hasNextDrawer}
      />

      {/* Modal de Nueva Venta Presencial */}
      <OnsiteSaleModal
        isOpen={isOnsiteSaleOpen}
        onClose={() => setIsOnsiteSaleOpen(false)}
        ticketTypes={ticketTypes}
        paymentMethods={paymentMethods}
        onSaleSuccess={async (saleData, openDrawer) => {
          await fetchAttendance();
          if (openDrawer) {
            handleOpenDrawer(saleData.registration);
          }
        }}
      />

      {/* Modal de Creación / Edición de Participante */}
      <ParticipantFormModal
        isOpen={isNewParticipantOpen}
        registrationToEdit={registrationToEdit}
        onClose={() => {
          setIsNewParticipantOpen(false);
          setRegistrationToEdit(null);
        }}
        onSuccess={async () => {
          await fetchAttendance();
          setIsNewParticipantOpen(false);
          setRegistrationToEdit(null);
        }}
      />

      {/* Modal de Escaneo y Validación de Código QR */}
      <QrScanModal
        isOpen={isQrScanOpen}
        onClose={() => setIsQrScanOpen(false)}
        onAttendanceMarked={async () => {
          setIsQrScanOpen(false);
          showFeedback('success', 'Asistencia confirmada', 'La llegada se registró correctamente. Puede continuar en Control de asistencia.');
          await fetchAttendance();
        }}
        onOpenParticipantDetail={async (reg) => {
          try {
            const detailed = await participantsService.getById(reg.id);
            setSelectedRegistration(detailed);
            setIsDrawerOpen(true);
          } catch (err) {
            console.error('Error al abrir detalle desde escáner:', err);
          }
        }}
      />
    </div>
  );
};
