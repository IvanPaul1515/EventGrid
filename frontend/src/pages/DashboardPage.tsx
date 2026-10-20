import React, { useState, useEffect } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { participantsService } from '../services/participants.service';
import { Registration } from '../types';
import {
  Users,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  UserCheck,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { currentEvent, events } = useEdition();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (currentEvent) {
      setLoading(true);
      participantsService.list({ limit: 100 })
        .then((res) => {
          setRegistrations(res.data);
          setTotalCount(res.pagination.total);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [currentEvent?.id]);

  const currency = currentEvent?.settings?.currencySymbol || 'RD$';

  // Métricas calculadas en tiempo real para la edición activa
  const totalAmount = registrations
    .filter((r) => !r.isCourtesy)
    .reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
  const confirmedCount = registrations.filter((r) => r.status === 'CONFIRMED').length;
  const pendingCount = registrations.filter((r) => r.status === 'PENDING').length;
  const courtesyCount = registrations.filter((r) => r.isCourtesy).length;
  const verifiedCount = registrations.filter((r) => r.isVerified).length;
  const manualCount = registrations.filter((r) => r.source === 'MANUAL').length;
  const importedCount = registrations.filter((r) => r.source === 'EXCEL_IMPORT').length;

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
              Bienvenido al sistema administrativo <strong>EventGrid</strong> para <strong>BarCamp RD</strong>. Supervisa las inscripciones, concilia pagos en RD$, gestiona cortesías y asistentes de {currentEvent?.name} con aislamiento por edición.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                {currentEvent?.venue || 'PUCMM Santiago'}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Año {currentEvent?.year || 2026}
              </span>
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
        {/* KPI 1: Total Registrados & Estado */}
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
              {loading ? '...' : totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Verificados:</span>
            <span className="text-emerald-400 font-semibold">{verifiedCount} de {totalCount}</span>
          </p>
        </div>

        {/* KPI 3: Cortesías Autorizadas */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cortesías Autorizadas
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-300 tracking-tight">
              {loading ? '...' : courtesyCount}
            </span>
            <span className="text-xs text-muted-foreground">boletos (RD$ 0.00)</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Contabilidad:</span>
            <span className="text-zinc-400 font-mono text-[10px]">Excluidas de ingresos</span>
          </p>
        </div>

        {/* KPI 4: Origen de Registros */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Origen de Registros
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground tracking-tight">
              {loading ? '...' : manualCount}
            </span>
            <span className="text-xs text-muted-foreground">manuales ({importedCount} Excel)</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span>Prefijo de ticket:</span>
            <span className="font-mono text-xs text-foreground">{currentEvent?.settings?.registrationPrefix || 'BC26-'}</span>
          </p>
        </div>
      </div>

      {/* Lista Rápida de Últimos Participantes Registrados */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Últimos Participantes en {currentEvent?.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Registros confirmados en la base de datos para esta edición.
            </p>
          </div>
          <button
            onClick={() => navigate('/participants')}
            className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            Ver tabla completa &rarr;
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
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-800 text-white">
                    {reg.registrationNumber}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">{reg.participant.fullName}</h4>
                    <p className="text-[11px] text-muted-foreground">{reg.participant.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-foreground block">
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

      {/* Comparativa de Ediciones BarCamp */}
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Ediciones Históricas y Futuras
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aislamiento estricto de participantes y métricas por año en la PUCMM.
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
  );
};
