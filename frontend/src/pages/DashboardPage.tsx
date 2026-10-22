import React, { useState, useEffect, useCallback } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { participantsService } from '../services/participants.service';
import { eventsService } from '../services/events.service';
import { Registration, FinancialSummary } from '../types';
import {
  Users,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  CreditCard,
  UserCheck,
  Shirt,
  Building,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Tag,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface EventStats {
  participants: {
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    attended: number;
    notAttended: number;
    attendanceRate: number;
  };
  finances?: {
    confirmedRevenue: number;
    pendingRevenue: number;
    totalExpected: number;
    currencySymbol: string;
  };
  tickets?: Array<{ name: string; count: number; revenue: number }>;
  paymentBreakdown?: {
    PAID: number;
    PENDING: number;
    PARTIAL: number;
    COURTESY: number;
  };
  inventory?: {
    totalCapacity: number;
    available: number;
    reservedStaff: number;
    deliveredStaff: number;
    deliveredParticipants: number;
  };
  communications?: {
    totalBatches: number;
    completedBatches: number;
    failedBatches: number;
    pendingBatches: number;
  };
  tshirts: {
    total: number;
    totalDelivered?: number;
    totalPendingDelivery?: number;
    mostPopular: string | null;
    withoutSize: number;
    breakdown: Array<{ size: string; count: number; delivered?: number; pending?: number }>;
  };
  institutions: {
    total: number;
    withoutInstitution: number;
    breakdown: Array<{ name: string; count: number }>;
  };
  timeSeries: {
    registrationsByDay: Array<{ date: string; count: number }>;
    attendanceByHour: Array<{ hour: number; count: number }>;
  };
}

export const DashboardPage: React.FC = () => {
  const { currentEvent, events } = useEdition();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Tab activo de estadísticas
  const [activeTab, setActiveTab] = useState<'overview' | 'participants' | 'tshirts' | 'finance' | 'institutions' | 'timeline'>('overview');

  // Estados de datos
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadAllData = useCallback(async (isSilent = false) => {
    if (!currentEvent) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [regsRes, statsRes, finRes] = await Promise.all([
        participantsService.list({ limit: 10 }).catch(() => ({ data: [], pagination: { total: 0 } })),
        eventsService.getStats(currentEvent.id).catch(() => null),
        eventsService.getFinancialSummary(currentEvent.id).catch(() => null),
      ]);

      setRegistrations(regsRes.data || []);
      if (statsRes) setStats(statsRes);
      if (finRes) setFinancialSummary(finRes);
    } catch (err) {
      console.error('Error cargando estadísticas del dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentEvent]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Escuchar evento de sincronización en tiempo real
  useEffect(() => {
    const handleDataRefresh = () => {
      loadAllData(true);
    };
    window.addEventListener('eventgrid:data-refresh', handleDataRefresh);
    return () => window.removeEventListener('eventgrid:data-refresh', handleDataRefresh);
  }, [loadAllData]);

  const currency = currentEvent?.settings?.currencySymbol || 'RD$';

  const totalCount = stats?.participants.total ?? registrations.length;
  const attendedCount = stats?.participants.attended ?? 0;
  const confirmedCount = stats?.participants.confirmed ?? 0;
  const pendingCount = stats?.participants.pending ?? 0;
  const totalRevenue = financialSummary?.totalRevenue ?? 0;
  const totalTshirts = stats?.tshirts.total ?? 0;

  // Custom Tooltip component para Recharts con estilo BarCamp dark
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl bg-zinc-900/95 border border-border p-3 shadow-2xl backdrop-blur-sm text-xs">
          <p className="font-bold text-foreground mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <span>{entry.name}:</span>
              <strong className="text-foreground font-mono">
                {typeof entry.value === 'number' && entry.name?.toLowerCase().includes('monto')
                  ? `${currency} ${entry.value.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
                  : entry.value}
              </strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Banner de Bienvenida y Edición Activa */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-barcamp-dark via-zinc-900 to-barcamp-wine/40 border border-border p-6 md:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-semibold text-primary mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>EventGrid • Edición Activa: {currentEvent?.name || 'Cargando...'}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              Hola, {user?.fullName.split(' ')[0]} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Panel de control y analítica en tiempo real para <strong>{currentEvent?.name || 'su evento'}</strong>. Administre inscripciones, controle el aforo físico y supervise las métricas del evento.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                {currentEvent?.venue || 'Sede del Evento'}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Año {currentEvent?.year || 2026}
              </span>
              <button
                onClick={() => loadAllData(true)}
                disabled={refreshing}
                className="flex items-center gap-1 text-primary hover:underline font-semibold cursor-pointer"
                title="Actualizar datos en tiempo real"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Sincronizando...' : 'Actualizar métricas'}</span>
              </button>
            </div>
          </div>

          {/* Botones de Acción Rápida */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/attendance')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Control de Asistencia</span>
            </button>
            <button
              onClick={() => navigate('/participants')}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Participantes ({totalCount})</span>
            </button>
            <button
              onClick={() => navigate('/import')}
              className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Importar Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tarjetas KPI Principales con datos reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Registrados */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Registrados
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground tracking-tight">
              {loading ? '...' : totalCount}
            </span>
            <span className="text-xs text-muted-foreground">asistentes</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Confirmados: <strong className="text-emerald-400">{confirmedCount}</strong></span>
            <span>Pendientes: <strong className="text-amber-400">{pendingCount}</strong></span>
          </p>
        </div>

        {/* KPI 2: Recaudación Neta Taquilla */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Recaudación Neta
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-xs font-bold text-muted-foreground">{currency}</span>
            <span className="text-3xl font-black text-foreground tracking-tight">
              {loading ? '...' : totalRevenue.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Por cobrar:</span>
            <strong className="text-amber-400 font-mono">
              {currency} {Number(financialSummary?.totalPending || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </strong>
          </p>
        </div>

        {/* KPI 3: Control de Asistencia Física */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Asistencia Física (Check-in)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 tracking-tight">
              {loading ? '...' : attendedCount}
            </span>
            <span className="text-xs text-muted-foreground">
              de {totalCount} ({stats?.participants.attendanceRate || 0}%)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>En espera de llegada:</span>
            <span className="text-amber-400 font-semibold">{stats?.participants.notAttended || 0}</span>
          </p>
        </div>

        {/* KPI 4: Camisetas Entregadas */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              T-Shirts Entregadas
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Shirt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground tracking-tight">
              {loading ? '...' : totalTshirts}
            </span>
            <span className="text-xs text-muted-foreground">con talla registrada</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Talla más solicitada:</span>
            <span className="font-mono text-xs text-primary font-bold">{stats?.tshirts.mostPopular || 'N/A'}</span>
          </p>
        </div>
      </div>

      {/* Fila 2 de KPIs Operativos: Inventario Físico, Staff y Comunicaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 5: Stock Disponible vs Capacidad */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Inventario T-Shirts
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {stats?.inventory?.available ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                disp. de {stats?.inventory?.totalCapacity ?? 0}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Participantes: {stats?.inventory?.deliveredParticipants ?? 0} entregadas
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Shirt className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 6: Camisetas Staff */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Camisetas del Staff
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-indigo-400 font-mono">
                {stats?.inventory?.deliveredStaff ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                entregadas de {stats?.inventory?.reservedStaff ?? 0} res.
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Pendientes entrega: {Math.max(0, (stats?.inventory?.reservedStaff ?? 0) - (stats?.inventory?.deliveredStaff ?? 0))}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 7: Campañas de Comunicación */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Campañas de Correo
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground font-mono">
                {stats?.communications?.totalBatches ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">lotes registrados</span>
            </div>
            <span className="text-[10px] text-emerald-400 mt-1 block">
              {stats?.communications?.completedBatches ?? 0} completados • {stats?.communications?.failedBatches ?? 0} con incidencias
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Pestañas de Navegación Analítica */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-card border border-border w-full">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Resumen Ejecutivo</span>
        </button>
        <button
          onClick={() => setActiveTab('participants')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'participants'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Asistencia & Aforo</span>
        </button>
        <button
          onClick={() => setActiveTab('tshirts')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'tshirts'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Shirt className="w-3.5 h-3.5" />
          <span>Tallas de Camiseta</span>
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'finance'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Finanzas & Ventas</span>
        </button>
        <button
          onClick={() => setActiveTab('institutions')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'institutions'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Instituciones ({stats?.institutions.total || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'timeline'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Evolución Temporal</span>
        </button>
      </div>

      {/* CONTENIDO TAB 1: RESUMEN EJECUTIVO */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Gráfico Rápido de Asistencia y Aforo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Estado de Asistencia Física
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Proporción de participantes que han completado el check-in en el recinto.
                  </p>
                </div>
                <span className="font-mono text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {stats?.participants.attendanceRate || 0}% de afluencia
                </span>
              </div>

              {totalCount === 0 ? (
                <div className="h-60 flex flex-col items-center justify-center text-center p-6 bg-background rounded-xl border border-border">
                  <UserCheck className="w-10 h-10 text-muted-foreground opacity-30 mb-2" />
                  <p className="text-xs font-semibold text-foreground">Sin asistentes registrados aún</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Las estadísticas de aforo se actualizarán tan pronto se registren o importen participantes.
                  </p>
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Asistieron', cantidad: attendedCount, fill: '#10b981' },
                        { name: 'Pendientes', cantidad: stats?.participants.notAttended || 0, fill: '#f59e0b' },
                        { name: 'Cancelados', cantidad: stats?.participants.cancelled || 0, fill: '#ef4444' },
                      ]}
                      margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} />
                      <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                        <Cell fill="#10b981" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#ef4444" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Desglose Rápido de T-Shirts */}
            <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Distribución de Camisetas
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tallas entregadas a los asistentes que confirmaron check-in.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('tshirts')}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  Ver detalle &rarr;
                </button>
              </div>

              {!stats?.tshirts.breakdown || stats.tshirts.breakdown.length === 0 ? (
                <div className="h-60 flex flex-col items-center justify-center text-center p-6 bg-background rounded-xl border border-border">
                  <Shirt className="w-10 h-10 text-muted-foreground opacity-30 mb-2" />
                  <p className="text-xs font-semibold text-foreground">Sin registro de tallas aún</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Al confirmar asistencia desde el escáner QR o la ficha del participante, se registrará la talla correspondiente.
                  </p>
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.tshirts.breakdown}
                      margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="size" stroke="#a1a1aa" fontSize={11} />
                      <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Cantidad" fill="#e11d48" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Lista Rápida de Últimos Participantes */}
          <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Últimos Registros en {currentEvent?.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Participantes ingresados recientemente a la plataforma.
                </p>
              </div>
              <button
                onClick={() => navigate('/participants')}
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                Ver todos los participantes &rarr;
              </button>
            </div>

            {registrations.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-background border border-border">
                <p className="text-xs text-muted-foreground">Aún no hay participantes en esta edición.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {registrations.slice(0, 5).map((reg) => (
                  <div key={reg.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                        {reg.registrationNumber}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">{reg.participant.fullName}</h4>
                        <p className="text-[11px] text-muted-foreground">{reg.participant.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-foreground block font-mono">
                        RD$ {Number(reg.totalAmount).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {reg.paymentMethod?.name || 'Efectivo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comparativa de Ediciones Históricas */}
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Ediciones Históricas y Futuras
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Aislamiento estricto de participantes y métricas por cada edición.
                </p>
              </div>
              <button
                onClick={() => navigate('/editions')}
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                Administrar todas &rarr;
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`p-4 rounded-xl border transition-all ${
                    currentEvent?.id === ev.id
                      ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/30'
                      : 'bg-background border-border hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-foreground">{ev.name}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {ev.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{ev.venue}</p>
                  <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>Año: <strong className="text-foreground">{ev.year}</strong></span>
                    <span className="font-mono text-[11px] text-primary font-bold">
                      {ev.settings?.registrationPrefix || 'BC-'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: ASISTENCIA & AFORO */}
      {activeTab === 'participants' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Tasa de Afluencia</span>
              <div className="text-3xl font-black text-emerald-400 font-mono">
                {stats?.participants.attendanceRate || 0}%
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                {attendedCount} asistieron de {totalCount} registrados
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Por Ingresar</span>
              <div className="text-3xl font-black text-amber-400 font-mono">
                {stats?.participants.notAttended || 0}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Participantes pendientes de control de entrada
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Inscripciones Canceladas</span>
              <div className="text-3xl font-black text-rose-400 font-mono">
                {stats?.participants.cancelled || 0}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Excluidas de la capacidad física del evento
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Distribución de Asistencia Física
            </h3>
            {totalCount === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                No hay participantes para graficar en esta edición.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Confirmados (Total)', cantidad: confirmedCount, fill: '#3b82f6' },
                      { name: 'Asistieron (Check-in)', cantidad: attendedCount, fill: '#10b981' },
                      { name: 'No han llegado', cantidad: stats?.participants.notAttended || 0, fill: '#f59e0b' },
                      { name: 'Inscripción Pendiente', cantidad: pendingCount, fill: '#8b5cf6' },
                      { name: 'Cancelados', cantidad: stats?.participants.cancelled || 0, fill: '#ef4444' },
                    ]}
                    margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} />
                    <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cantidad" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 3: TALLAS DE CAMISETA */}
      {activeTab === 'tshirts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Total con Talla</span>
              <div className="text-3xl font-black text-foreground font-mono">
                {totalTshirts}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Asignadas durante el check-in físico
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Talla Más Popular</span>
              <div className="text-3xl font-black text-primary font-mono">
                {stats?.tshirts.mostPopular || '—'}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Mayor demanda registrada
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Sin Talla Registrada</span>
              <div className="text-3xl font-black text-zinc-400 font-mono">
                {stats?.tshirts.withoutSize || 0}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Pendientes o registrados sin especificar talla
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Distribución de Tallas Entregadas
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conteo exacto por talla para conciliación de inventario con el comité organizador.
                </p>
              </div>
            </div>

            {!stats?.tshirts.breakdown || stats.tshirts.breakdown.length === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                <Shirt className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-2" />
                <p className="font-bold text-foreground">Aún no hay tallas de camisetas registradas</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Las tallas se capturan al momento de confirmar asistencia (Check-in) en la recepción física o mediante escaneo de código QR.
                </p>
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.tshirts.breakdown}
                    margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="size" stroke="#a1a1aa" fontSize={12} fontStyle="bold" />
                    <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Camisetas Entregadas" fill="#e11d48" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 4: FINANZAS & RECAUDACIÓN */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Recaudado Neto</span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                {currency} {Number(totalRevenue).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                {financialSummary?.verifiedPaymentsCount || 0} pagos verificados
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Por Cobrar / Pendiente</span>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {currency} {Number(financialSummary?.totalPending || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Proyectado: {currency} {Number(financialSummary?.totalExpected || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Cortesías Autorizadas</span>
              <div className="text-2xl sm:text-3xl font-black text-purple-300 font-mono">
                {financialSummary?.courtesyCount || 0} boletos
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Exentas de cobro (RD$ 0.00)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recaudación por Método de Pago */}
            <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recaudación por Método de Pago
              </h3>
              {!financialSummary?.byMethod || financialSummary.byMethod.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                  No hay transacciones registradas todavía.
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={financialSummary.byMethod}
                      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} />
                      <YAxis stroke="#a1a1aa" fontSize={11} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="totalAmount" name="Monto Recaudado" fill="#10b981" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Recaudación por Tipo de Entrada */}
            <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Distribución por Tipo de Entrada
              </h3>
              {!financialSummary?.byTicketType || financialSummary.byTicketType.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                  No hay ventas registradas por tipo de tarifa.
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={financialSummary.byTicketType}
                      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} />
                      <YAxis stroke="#a1a1aa" fontSize={11} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Boletos" fill="#e11d48" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 5: INSTITUCIONES */}
      {activeTab === 'institutions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Instituciones / Empresas</span>
              <div className="text-3xl font-black text-foreground font-mono">
                {stats?.institutions.total || 0}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Organizaciones representadas en esta edición
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-border space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Participantes Independientes</span>
              <div className="text-3xl font-black text-zinc-400 font-mono">
                {stats?.institutions.withoutInstitution || 0}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                Sin institución especificada
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Top Instituciones con Mayor Participación
            </h3>
            {!stats?.institutions.breakdown || stats.institutions.breakdown.length === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                <Building className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-2" />
                <p className="font-bold text-foreground">Aún no hay instituciones registradas</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Los participantes importados desde Excel o agregados manualmente con el campo Institución aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.institutions.breakdown.slice(0, 10)}
                    margin={{ top: 10, right: 30, bottom: 10, left: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={11} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Participantes" fill="#3b82f6" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 6: EVOLUCIÓN TEMPORAL */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {/* Inscripciones por Día */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Evolución de Inscripciones por Día
            </h3>
            {!stats?.timeSeries.registrationsByDay || stats.timeSeries.registrationsByDay.length === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                <Clock className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-2" />
                <p className="font-bold text-foreground">Sin serie temporal aún</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  A medida que se registren participantes se generará la curva cronológica de inscripciones.
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={stats.timeSeries.registrationsByDay}
                    margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} />
                    <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Inscripciones"
                      stroke="#e11d48"
                      strokeWidth={3}
                      dot={{ fill: '#e11d48', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Asistencia por Hora */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Curva de Llegadas al Recinto por Hora (Check-in)
            </h3>
            {attendedCount === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground bg-background rounded-xl border border-border">
                <UserCheck className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-2" />
                <p className="font-bold text-foreground">No hay asistencias registradas aún</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Durante el evento físico, este gráfico mostrará las horas pico de llegada y recepción.
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats?.timeSeries.attendanceByHour.filter((h) => h.count > 0 || (h.hour >= 7 && h.hour <= 19)).map((h) => ({
                      ...h,
                      hora: `${String(h.hour).padStart(2, '0')}:00`,
                    }))}
                    margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="hora" stroke="#a1a1aa" fontSize={10} />
                    <YAxis stroke="#a1a1aa" fontSize={11} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Llegadas" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
