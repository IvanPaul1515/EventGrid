import {useSearchParams} from 'react-router-dom';
import {PaymentStatusBadge} from '../components/participants/PaymentStatusBadge';
import {useListNavigation,useListNavigationScope} from '../hooks/useListNavigation';
import {participantFilters,readListNavigation} from '../utils/listNavigation';
import { CommunicationHistory } from '../components/communications/CommunicationHistory';
import { useCommunicationBadges } from '../components/communications/useCommunicationBadges';
import { formatEmailStatus } from '../utils/emailFormatters';
import { CourtesyRequestsPanel } from '../components/participants/CourtesyRequestsPanel';
import { MobileSearchInput } from '../components/common/MobileSearchInput';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { failureKind, failureCopy } from '../utils/appError';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { participantsService, DetailedRegistration } from '../services/participants.service';
import { Registration, PaymentMethod, SalesResponsible, TicketType } from '../types';
import { api } from '../services/api';
import { ParticipantDetailDrawer } from '../components/participants/ParticipantDetailDrawer';
import { ParticipantFormModal } from '../components/participants/ParticipantFormModal';
import { DeleteConfirmModal } from '../components/participants/DeleteConfirmModal';
import { DeleteExcelModal } from '../components/participants/DeleteExcelModal';
import { OnsiteSaleModal } from '../components/sales/OnsiteSaleModal';
import { TableSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import {
  Mail,
  Users,
  Plus,
  Download,
  Filter,
  Search,
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Columns,
  RotateCcw,
  Sparkles,
  Tag,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Clock,
  Check,
  FileSpreadsheet,
} from 'lucide-react';

export const ParticipantsPage: React.FC = () => {
  const scope=useListNavigationScope('participants');
  return <ParticipantsContent key={scope||'pending'} navigationKey={scope}/>;
};
const ParticipantsContent: React.FC<{navigationKey:string|null}> = ({navigationKey}) => {
  const [searchParams,setSearchParams]=useSearchParams();
  const receiptEntry=searchParams.get('create')==='receipt';
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();

  const init=React.useMemo(()=>{try{return readListNavigation(sessionStorage,navigationKey,participantFilters).filters;}catch{return {...participantFilters};}},[navigationKey]);

  // Datos y paginación
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [communicationId,setCommunicationId]=useState<string|null>(null);
  const communicationBadges=useCommunicationBadges(registrations.map(reg=>reg.id));
  const mailAction=(reg:Registration)=>{
    if(!hasRole(['ADMIN','OPERATOR']))return null;
    const badge=communicationBadges[reg.id],status=badge?.lastStatus;
    const label=badge?(status?formatEmailStatus(status).label:'Sin comunicaciones'):'Consultar historial';
    const color=status&&['FAILED','REJECTED','BLOCKED'].includes(status)?'text-rose-500':status==='UNKNOWN_DELIVERY_STATUS'?'text-amber-500':status&&['SENT','DELIVERED','ACCEPTED_BY_SMTP','ACCEPTED_BY_PROVIDER'].includes(status)?'text-emerald-500':status&&['PENDING','PROCESSING','PREPARED'].includes(status)?'text-blue-500':'text-muted-foreground';
    return <button type="button" title={'Comunicaciones: '+label} aria-label={'Comunicaciones de '+reg.participant.fullName+': '+label} className={'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg hover:bg-muted '+color} onClick={e=>{e.stopPropagation();setCommunicationId(reg.id);}}><Mail className="w-4 h-4"/></button>;
  };
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState<number>(init.page || 1);
  const [limit, setLimit] = useState<number>(init.limit || 10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filtros y ordenamiento
  const [search, setSearch] = useState<string>(init.search || '');
  const [paymentMethodId, setPaymentMethodId] = useState<string>(init.paymentMethodId || '');
  const [salesResponsibleId, setSalesResponsibleId] = useState<string>(init.salesResponsibleId || '');
  const [status, setStatus] = useState<string>(init.status || '');
  const [isCourtesyFilter, setIsCourtesyFilter] = useState<'ALL' | 'COURTESY' | 'REGULAR'>(init.isCourtesyFilter || 'ALL');
  const [sortBy, setSortBy] = useState<string>(init.sortBy || 'createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(init.sortOrder || 'desc');
  const [stats, setStats] = useState<any>(null);

  // Catálogos para filtros
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [salesResponsibles, setSalesResponsibles] = useState<SalesResponsible[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  // Configuración de visibilidad de columnas — solo esenciales por defecto
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    registrationNumber: true,
    fullName: true,
    institution: true,
    documentId: false,
    email: false,
    phone: false,
    alternatePhone: false,
    ticketType: true,
    ticketPrice: false,
    paymentMethod: false,
    totalAmount: false,
    balanceDue: false,
    attendance: true,
    salesResponsible: false,
    saleTimestamp: false,
    status: true,       // Inscripción
    paymentStatus: true, // Estado de Pago
    actions: true,
  });

  // Modales y drawers
  const [selectedForDetail, setSelectedForDetail] = useState<DetailedRegistration | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isOnsiteSaleOpen, setIsOnsiteSaleOpen] = useState(false);
  const [selectedForEdit, setSelectedForEdit] = useState<Registration | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  useEffect(()=>{if(receiptEntry&&hasRole(['ADMIN','OPERATOR']))setIsFormOpen(true);},[receiptEntry,hasRole]);
  const [selectedForDelete, setSelectedForDelete] = useState<Registration | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isDeleteExcelOpen, setIsDeleteExcelOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cargar catálogos al cambiar de edición
  useEffect(() => {
    if (currentEvent) {
      api.get(`/events/${currentEvent.id}`).then((res) => {
        if (res.data.data) {
          setPaymentMethods(res.data.data.paymentMethods || []);
          setSalesResponsibles(res.data.data.salesResponsibles || []);
          setTicketTypes(res.data.data.ticketTypes || []);
        }
      }).catch(console.error);
    }
  }, [currentEvent]);

  // Cargar participantes
  const requestVersion = useRef(0);
  const fetchParticipants = useCallback(async (silent = false) => {
    if (!currentEvent) return;
    const version = ++requestVersion.current;
    try {
      if (!silent) setLoading(true);
      setFetchError(null);
      const isCourtesyParam =
        isCourtesyFilter === 'COURTESY' ? true : isCourtesyFilter === 'REGULAR' ? false : undefined;

      const res = await participantsService.list({
        page,
        limit,
        search: search.trim() || undefined,
        paymentMethodId: paymentMethodId || undefined,
        salesResponsibleId: salesResponsibleId || undefined,
        status: (status as any) || undefined,
        isCourtesy: isCourtesyParam,
        sortBy,
        sortOrder,
      });
      if (version !== requestVersion.current) return;
      setRegistrations(res.data);
      setSelectedForDetail(prev => { const fresh = res.data.find((r: any) => r.id === prev?.id); return prev && fresh ? { ...prev, ...fresh } : prev; });
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      if (version === requestVersion.current) setFetchError(failureCopy[failureKind(err)].message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [currentEvent, page, limit, search, paymentMethodId, salesResponsibleId, status, isCourtesyFilter, sortBy, sortOrder]);

  const navigationFilters=React.useMemo(()=>({page,limit,search,paymentMethodId,salesResponsibleId,status,isCourtesyFilter,sortBy,sortOrder}),[page,limit,search,paymentMethodId,salesResponsibleId,status,isCourtesyFilter,sortBy,sortOrder]);
  useListNavigation(navigationKey,navigationFilters,loading,isDetailOpen);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  useRealtimeRefresh('participants', async () => { await fetchParticipants(true);
    if (selectedForDetail?.id) { const id = selectedForDetail.id; const fresh = await participantsService.getById(id); setSelectedForDetail(previous => previous?.id === id ? fresh : previous); }
  });

  // Compatibilidad con eventos locales
  useEffect(() => {
    const handleDataRefresh = () => {
      // Refresco silencioso sin perder filtros ni paginación
      fetchParticipants();
    };
    window.addEventListener('eventgrid:data-refresh', handleDataRefresh);
    return () => {
      window.removeEventListener('eventgrid:data-refresh', handleDataRefresh);
    };
  }, [fetchParticipants]);

  // Notificación temporal
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Generar datos de prueba (15)
  // Actualizar estado de confirmación
  const handleStatusChange = async (regId: string, newStatus: string) => {
    try {
      const updated = await participantsService.update(regId, { status: newStatus });
      showNotification('success', `Estado actualizado a ${newStatus}`);
      if (selectedForDetail && selectedForDetail.id === regId) {
        setSelectedForDetail({ ...selectedForDetail, status: newStatus as any });
      }
      await fetchParticipants();
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || 'Error al actualizar el estado');
    }
  };

  // Abrir Ficha 360°
  const handleOpenDetail = async (reg: Registration) => {
    try {
      const detailed = await participantsService.getById(reg.id);
      setSelectedForDetail(detailed);
      setIsDetailOpen(true);
    } catch (err) {
      console.error('Error al obtener detalle:', err);
    }
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!selectedForDelete) return;
    setDeleteLoading(true);
    try {
      await participantsService.delete(selectedForDelete.id);
      showNotification('success', `Registro ${selectedForDelete.registrationNumber} eliminado exitosamente`);
      setIsDeleteOpen(false);
      setSelectedForDelete(null);
      await fetchParticipants();
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || 'Error al eliminar');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Exportar datos
  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      await participantsService.export(
        {
          search: search.trim() || undefined,
          paymentMethodId: paymentMethodId || undefined,
          salesResponsibleId: salesResponsibleId || undefined,
          status: (status as any) || undefined,
        },
        format
      );
      showNotification('success', `Exportación ${format.toUpperCase()} descargada correctamente`);
    } catch (err) {
      showNotification('error', 'Error al exportar los registros');
    }
  };

  // Alternar ordenación
  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setPaymentMethodId('');
    setSalesResponsibleId('');
    setStatus('');
    setIsCourtesyFilter('ALL');
  };

  const isFiltering = !!(search || paymentMethodId || salesResponsibleId || status || isCourtesyFilter !== 'ALL');

  // Navegación entre participantes en el drawer 360°
  const currentDetailIndex = registrations.findIndex((r) => r.id === selectedForDetail?.id);
  const hasPrevDetail = currentDetailIndex > 0;
  const hasNextDetail = currentDetailIndex >= 0 && currentDetailIndex < registrations.length - 1;

  const handleNavigateDetail = async (direction: 'prev' | 'next') => {
    if (currentDetailIndex === -1) return;
    const nextIdx = direction === 'prev' ? currentDetailIndex - 1 : currentDetailIndex + 1;
    if (nextIdx >= 0 && nextIdx < registrations.length) {
      const targetReg = registrations[nextIdx];
      try {
        const detailed = await participantsService.getById(targetReg.id);
        setSelectedForDetail(detailed);
      } catch (err) {
        console.error('Error navegando participante:', err);
      }
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'CONFIRMED':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">Confirmado</span>;
      case 'PENDING':
      case 'PENDING_VERIFICATION':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">Pendiente</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25">Cancelado</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] rounded-full bg-zinc-800 text-zinc-300">{st}</span>;
    }
  };

  const getPaymentStatusBadge = (reg:Registration) => <PaymentStatusBadge registration={reg}/>;

  return (
    <div className="space-y-6">
      <CourtesyRequestsPanel />
      {/* Encabezado y Acciones Principales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              {currentEvent?.name || 'Edición'}
            </span>
            <span className="text-xs text-muted-foreground">• {total} registros en total</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Directorio de Participantes
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Menú de Exportación */}
          <button
            onClick={() => handleExport('xlsx')}
            className="px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Exportar registros filtrados a Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Exportar registros filtrados a CSV"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>CSV</span>
          </button>

          {/* Opción de Borrar Excel importado (ADMIN) */}
          {hasRole(['ADMIN']) && (
            <button
              type="button"
              onClick={() => setIsDeleteExcelOpen(true)}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Gestionar y borrar datos de Excel importados"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-rose-400" />
              <span>Eliminar Importados / Vaciar</span>
            </button>
          )}

          {/* Nueva Venta y Nuevo Registro (ADMIN y OPERATOR) */}
          {hasRole(['ADMIN', 'OPERATOR']) && (
            <>
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
                  setSelectedForEdit(null);
                  setIsFormOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-primary" />
                <span>Nuevo Participante</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mini Resumen de Estadísticas del Evento */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-card border border-border">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">Total Registrados</span>
            <span className="text-xl font-black text-foreground">{stats.totalRegistrations}</span>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border">
            <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 block" title="Inscripción confirmada; no equivale a asistencia física">Confirmados (registro)</span>
            <span className="text-xl font-black text-emerald-400">{stats.confirmedCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 block" title="Inscripción pendiente; la asistencia se muestra por separado">Pendientes (registro)</span>
            <span className="text-xl font-black text-amber-400">{stats.pendingCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-300 block flex items-center gap-1">
              <Tag className="w-3 h-3" /> Cortesías (RD$ 0)
            </span>
            <span className="text-xl font-black text-amber-300">{stats.courtesyCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-primary block">Recaudación Neta</span>
            <span className="text-xl font-black text-foreground">
              RD$ {Number(stats.totalRevenue).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {notification && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Barra de Filtros, Búsqueda y Columnas */}
      <div className="p-4 rounded-2xl bg-card border border-border space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Búsqueda Rápida Universal */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <MobileSearchInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cédula, nombre, correo, teléfono o ticket..."
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Selector de Columnas Visibles */}
          <div className="relative">
            <button
              onClick={() => setColumnsDropdownOpen(!columnsDropdownOpen)}
              className="px-3 py-2 rounded-xl bg-background hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Mostrar u ocultar columnas"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Columnas</span>
            </button>

            {columnsDropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setColumnsDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-border shadow-2xl p-3 z-40 space-y-2">
                  <p className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-bold">
                    Columnas Visibles
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
                    {Object.entries({
                      registrationNumber: 'No. Registro',
                      fullName: 'Nombre Completo',
                      institution: 'Institución / Empresa',
                      documentId: 'Doc. Identidad',
                      email: 'Correo Electrónico',
                      phone: 'Teléfono',
                      alternatePhone: 'Tel. Alterno',
                      ticketType: 'Tipo de Entrada',
                      ticketPrice: 'Tarifa Boleto',
                      paymentMethod: 'Forma de Pago',
                      totalAmount: 'Monto Pagado',
                      balanceDue: 'Balance Pendiente',
                      status: 'Inscripción (Estado)',
                      paymentStatus: 'Estado de Pago',
                      attendance: 'Asistencia',
                      salesResponsible: 'Responsable',
                      saleTimestamp: 'Fecha y Hora',
                    }).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={(visibleColumns as any)[key]}
                          onChange={(e) =>
                            setVisibleColumns({ ...visibleColumns, [key]: e.target.checked })
                          }
                          className="rounded text-primary focus:ring-primary w-3.5 h-3.5 bg-background border-border"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filtros Específicos: Forma de Pago, Responsable, Estado */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase text-muted-foreground">Filtros:</span>
          </div>

          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas las formas de pago</option>
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {pm.name}
              </option>
            ))}
          </select>

          <select
            value={salesResponsibleId}
            onChange={(e) => setSalesResponsibleId(e.target.value)}
            className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los responsables</option>
            {salesResponsibles.map((sr) => (
              <option key={sr.id} value={sr.id}>
                {sr.name}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los estados</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="PENDING">Pendientes</option>
            <option value="ATTENDED">Asistieron</option>
            <option value="CANCELLED">Cancelados</option>
          </select>

          <select
            value={isCourtesyFilter}
            onChange={(e) => setIsCourtesyFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">Ventas y Cortesías</option>
            <option value="COURTESY">🎫 Solo Cortesías (RD$ 0)</option>
            <option value="REGULAR">💳 Solo Ventas Regulares</option>
          </select>

          {isFiltering && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Directorio de Participantes: Vista Adaptativa Móvil y Tabla de Escritorio */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
        {/* VISTA ADAPTATIVA EN TARJETAS PARA CELULARES Y PANTALLAS PEQUEÑAS (< md) */}
        <div className="md:hidden divide-y divide-border">
          {fetchError ? (
            <div className="p-6">
              <ErrorState
                title="Error al consultar participantes"
                message={fetchError}
                onRetry={fetchParticipants}
              />
            </div>
          ) : loading ? (
            <div className="p-3">
              <TableSkeleton rows={6} cols={2} />
            </div>
          ) : registrations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                isFiltered={isFiltering}
                onClearFilters={clearFilters}
                title={isFiltering ? 'No se encontraron participantes con esos filtros' : `No hay participantes registrados`}
                description={isFiltering ? 'Intenta modificar el término de búsqueda o limpiar los filtros.' : 'Comienza registrando asistentes o importa tus archivos Excel.'}
                actionLabel={hasRole(['ADMIN', 'OPERATOR']) && !isFiltering ? 'Registrar Primer Asistente' : undefined}
                onAction={() => {
                  setSelectedForEdit(null);
                  setIsFormOpen(true);
                }}
                icon={Users}
              />
            </div>
          ) : (
            registrations.map((reg) => {
              const p = reg.participant;
              const ticketPrice = reg.isCourtesy ? 0 : Number(reg.ticketPrice ?? reg.totalAmount ?? 0);
              const amountPaid = reg.isCourtesy ? 0 : Number(reg.amountPaid ?? reg.totalAmount ?? 0);
              const balanceDue = reg.isCourtesy ? 0 : Math.max(0, ticketPrice - amountPaid);
              const overpaid = Math.max(0, amountPaid - ticketPrice);

              return (
                <div
                  key={reg.id}
                  onClick={() => handleOpenDetail(reg)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleOpenDetail(reg);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="p-4 space-y-3 hover:bg-muted/40 active:scale-[0.99] transition-all cursor-pointer focus:outline-none focus:bg-muted/50"
                  title="Presiona cualquier lugar de la tarjeta para abrir la ficha"
                >
                  {/* Fila 1: Ticket + Estados de Inscripción y Asistencia */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-zinc-900 border border-zinc-700 text-white">
                      {reg.registrationNumber}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {getStatusBadge(reg.status)}
                      {reg.attended ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/25 inline-flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" /> Asistió
                          </span>
                          {reg.tshirtSize && (
                            <span className="text-[10px] font-mono text-primary font-bold">
                              Talla {reg.tshirtSize}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-semibold border border-zinc-700 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> No ha llegado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fila 2: Avatar y Datos de Identidad */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                      {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground truncate">
                          {p.fullName}
                        </span>
                        {(reg.isDemo || p.isDemo) && (
                          <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            DEMO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      {p.documentId && (
                        <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          Doc: <strong className="text-zinc-200">{p.documentId}</strong>
                        </p>
                      )}
                      {p.institution && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {p.institution}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Fila 3: Tarifa, Estado de Pago y Botones de Acción */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50 bg-background/50 -mx-4 -mb-4 p-3 rounded-b-xl">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">
                        {reg.ticketType?.name || (reg.isCourtesy ? 'Cortesía' : 'General')}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {getPaymentStatusBadge(reg)}
                        {overpaid > 0 && !reg.isCourtesy && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            +{overpaid.toFixed(0)} favor
                          </span>
                        )}
                        {balanceDue > 0 && !reg.isCourtesy && (
                          <span className="text-[11px] font-black text-amber-400">
                            Debe RD$ {balanceDue.toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {mailAction(reg)}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(reg);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ficha</span>
                      </button>
                      {hasRole(['ADMIN', 'OPERATOR']) && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedForEdit(reg);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedForDelete(reg);
                              setIsDeleteOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* TABLA DE ESCRITORIO (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase tracking-wider select-none">
                {visibleColumns.registrationNumber && (
                  <th
                    onClick={() => handleSort('registrationNumber')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span>No. Registro</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.fullName && (
                  <th
                    onClick={() => handleSort('fullName')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nombres y Apellidos</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.institution && <th className="p-3.5 font-bold">Institución / Empresa</th>}
                {visibleColumns.documentId && <th className="p-3.5 font-bold">Doc. Identidad</th>}
                {visibleColumns.email && (
                  <th
                    onClick={() => handleSort('email')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span>Correo Electrónico</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.phone && <th className="p-3.5 font-bold">Teléfono</th>}
                {visibleColumns.alternatePhone && <th className="p-3.5 font-bold">Tel. Alterno</th>}
                {visibleColumns.ticketType && <th className="p-3.5 font-bold">Tipo Entrada</th>}
                {visibleColumns.ticketPrice && (
                  <th
                    onClick={() => handleSort('ticketPrice')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Tarifa</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.paymentMethod && <th className="p-3.5 font-bold">Forma de Pago</th>}
                {visibleColumns.totalAmount && (
                  <th
                    onClick={() => handleSort('totalAmount')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Monto Pagado</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.balanceDue && <th className="p-3.5 font-bold text-right">Balance</th>}
                {visibleColumns.status && <th className="p-3.5 font-bold">Inscripción</th>}
                {visibleColumns.paymentStatus && <th className="p-3.5 font-bold">Estado de Pago</th>}
                {visibleColumns.attendance && <th className="p-3.5 font-bold text-center">Asistencia</th>}
                {visibleColumns.salesResponsible && <th className="p-3.5 font-bold">Responsable</th>}
                {visibleColumns.saleTimestamp && (
                  <th
                    onClick={() => handleSort('saleTimestamp')}
                    className="p-3.5 font-bold cursor-pointer hover:text-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span>Fecha / Hora</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {visibleColumns.actions && <th className="p-3.5 font-bold text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fetchError ? (
                <tr>
                  <td colSpan={16} className="p-8">
                    <ErrorState
                      title="Error al consultar participantes"
                      message={fetchError}
                      onRetry={fetchParticipants}
                    />
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={16} className="p-4">
                    <TableSkeleton rows={limit > 10 ? 10 : limit} cols={7} />
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={16} className="p-8">
                    <EmptyState
                      isFiltered={isFiltering}
                      onClearFilters={clearFilters}
                      title={isFiltering ? 'No se encontraron participantes con esos filtros' : `No hay participantes registrados en ${currentEvent?.name}`}
                      description={isFiltering ? 'Intenta modificar el término de búsqueda o limpiar los filtros seleccionados.' : 'Comienza registrando asistentes manualmente o importa los registros históricos desde Excel.'}
                      actionLabel={hasRole(['ADMIN', 'OPERATOR']) && !isFiltering ? 'Registrar Primer Asistente' : undefined}
                      onAction={() => {
                        setSelectedForEdit(null);
                        setIsFormOpen(true);
                      }}
                      icon={Users}
                    />
                  </td>
                </tr>
              ) : (
                registrations.map((reg) => {
                  const p = reg.participant;
                  return (
                    <tr
                      key={reg.id}
                      onClick={() => handleOpenDetail(reg)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleOpenDetail(reg);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      className="hover:bg-muted/60 transition-colors group cursor-pointer focus:outline-none focus:bg-muted/50 select-none"
                      title="Haz clic o presiona Enter para abrir la ficha de este participante"
                    >
                      {visibleColumns.registrationNumber && (
                        <td className="p-3.5 font-mono font-bold text-foreground whitespace-nowrap">
                          <span
                            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-white group-hover:border-primary transition-colors text-xs font-mono font-bold inline-block"
                            title="No. de registro oficial"
                          >
                            {reg.registrationNumber}
                          </span>
                        </td>
                      )}
                      {visibleColumns.fullName && (
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 group-hover:scale-105 transition-transform">
                              {p.firstName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                                  {p.fullName}
                                </span>
                                {(reg.isDemo || p.isDemo) && (
                                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    DEMO
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground block truncate max-w-[180px]">
                                {p.email}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.institution && (
                        <td className="p-3.5 whitespace-nowrap">
                          {p.institution ? (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-semibold text-[11px]">
                              {p.institution}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.documentId && (
                        <td className="p-3.5 font-mono text-muted-foreground whitespace-nowrap">
                          {p.documentId || '—'}
                        </td>
                      )}
                      {visibleColumns.email && (
                        <td className="p-3.5 text-foreground whitespace-nowrap">
                          {p.email}
                        </td>
                      )}
                      {visibleColumns.phone && (
                        <td className="p-3.5 font-mono text-muted-foreground whitespace-nowrap">
                          {p.phone || '—'}
                        </td>
                      )}
                      {visibleColumns.alternatePhone && (
                        <td className="p-3.5 font-mono text-muted-foreground whitespace-nowrap">
                          {p.alternatePhone || '—'}
                        </td>
                      )}
                      {visibleColumns.ticketType && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-bold text-foreground">
                            {reg.ticketType?.name || (reg.isCourtesy ? 'Cortesía' : 'General')}
                          </span>
                        </td>
                      )}
                      {visibleColumns.ticketPrice && (
                        <td className="p-3.5 font-mono text-right font-bold text-foreground whitespace-nowrap">
                          {reg.isCourtesy ? (
                            <span className="text-amber-400 text-xs">RD$ 0.00</span>
                          ) : (
                            <span>RD$ {Number(reg.ticketPrice ?? reg.totalAmount ?? 0).toFixed(2)}</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.paymentMethod && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-foreground">
                            {reg.isCourtesy ? 'Cortesía' : (reg.paymentMethod?.name || 'No registrada')}
                          </span>
                        </td>
                      )}
                      {visibleColumns.totalAmount && (
                        <td className="p-3.5 font-mono text-right font-bold text-foreground whitespace-nowrap">
                          {reg.isCourtesy ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-[10px] inline-flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" /> Cortesía RD$ 0
                            </span>
                          ) : (
                            <>
                              RD$ {Number(reg.amountPaid ?? reg.totalAmount ?? 0).toFixed(2)}
                              {reg.isVerified && (
                                <span className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" title="Pago verificado" />
                              )}
                            </>
                          )}
                        </td>
                      )}
                      {visibleColumns.balanceDue && (
                        <td className="p-3.5 font-mono text-right whitespace-nowrap font-bold">
                          {(() => {
                            const paid = Number(reg.amountPaid ?? reg.totalAmount ?? 0);
                            const price = reg.isCourtesy ? 0 : Number(reg.ticketPrice ?? reg.totalAmount ?? 0);
                            const overpaid = Math.max(0, paid - price);
                            if (reg.isCourtesy) {
                              return <span className="text-muted-foreground text-xs font-semibold">—</span>;
                            }
                            if (overpaid > 0) {
                              return (
                                <span
                                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 inline-flex items-center gap-0.5"
                                  title={`El participante pagó RD$ ${overpaid.toFixed(2)} más de la tarifa actual`}
                                >
                                  +RD$ {overpaid.toFixed(2)} a favor
                                </span>
                              );
                            }
                            if (Number(reg.balanceDue || 0) > 0) {
                              return (
                                <span className="text-amber-400 font-black">
                                  Resta RD$ {Number(reg.balanceDue).toFixed(2)}
                                </span>
                              );
                            }
                            return <span className="text-emerald-400">RD$ 0.00</span>;
                          })()}
                        </td>
                      )}
                      {/* Estado 1: Inscripción */}
                      {visibleColumns.status && (
                        <td className="p-3.5 whitespace-nowrap">
                          {getStatusBadge(reg.status)}
                        </td>
                      )}
                      {/* Estado 2: Pago */}
                      {visibleColumns.paymentStatus && (
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {getPaymentStatusBadge(reg)}
                            {(() => {
                              const paid = Number(reg.amountPaid ?? reg.totalAmount ?? 0);
                              const price = reg.isCourtesy ? 0 : Number(reg.ticketPrice ?? reg.totalAmount ?? 0);
                              const overpaid = Math.max(0, paid - price);
                              if (overpaid > 0 && !reg.isCourtesy) {
                                return (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                    title={`Saldo a favor: RD$ ${overpaid.toFixed(2)}`}
                                  >
                                    +{overpaid.toFixed(0)} favor
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                      )}
                      {/* Estado 3: Asistencia */}
                      {visibleColumns.attendance && (
                        <td className="p-3.5 whitespace-nowrap text-center">
                          {reg.attended ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/25 inline-flex items-center gap-1">
                                <Check className="w-3 h-3 stroke-[3]" /> Asistió
                              </span>
                              {reg.tshirtSize && (
                                <span className="block text-[10px] font-mono text-primary font-bold mt-0.5">
                                  Talla {reg.tshirtSize}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-semibold border border-zinc-700 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> No ha llegado
                            </span>
                          )}
                        </td>
                      )}
                      {visibleColumns.salesResponsible && (
                        <td className="p-3.5 text-muted-foreground whitespace-nowrap truncate max-w-[140px]">
                          {reg.salesResponsible?.name || 'Comité'}
                        </td>
                      )}
                      {visibleColumns.saleTimestamp && (
                        <td className="p-3.5 text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(reg.saleTimestamp).toLocaleDateString('es-DO', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {mailAction(reg)}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(reg);
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title="Ver ficha 360°"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {hasRole(['ADMIN', 'OPERATOR']) && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedForEdit(reg);
                                    setIsFormOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                  title="Editar participante"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedForDelete(reg);
                                    setIsDeleteOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Eliminar inscripción"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación del Servidor */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground bg-muted/20">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>por página</span>
            <span className="hidden sm:inline-block pl-2 border-l border-border">
              Total: <strong className="text-foreground">{total}</strong> participantes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>Página {page} de {totalPages || 1}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border disabled:opacity-40 transition-colors cursor-pointer"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border disabled:opacity-40 transition-colors cursor-pointer"
                title="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {communicationId&&<CommunicationHistory registrationId={communicationId} onClose={()=>setCommunicationId(null)}/>}
      {/* Ficha Lateral 360° */}
      <ParticipantDetailDrawer
        registration={selectedForDetail}
        isOpen={isDetailOpen}
        paymentMethods={paymentMethods}
        onClose={() => setIsDetailOpen(false)}
        onCheckInSuccess={(msg) => {
          setIsDetailOpen(false);
          showNotification('success', msg || 'Asistencia registrada correctamente');
        }}
        onEdit={(reg) => {
          setSelectedForEdit(reg);
          setIsFormOpen(true);
        }}
        onUpdated={(updatedReg) => {
          if (updatedReg) {
            setSelectedForDetail(updatedReg);
            setRegistrations((prev) =>
              prev.map((r) => (r.id === updatedReg.id ? { ...r, ...updatedReg } : r))
            );
          }
          fetchParticipants();
          window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
        }}
        onNavigate={handleNavigateDetail}
        hasPrev={hasPrevDetail}
        hasNext={hasNextDetail}
      />

      {/* Modal de Nueva Venta Presencial */}
      <OnsiteSaleModal
        isOpen={isOnsiteSaleOpen}
        onClose={() => setIsOnsiteSaleOpen(false)}
        ticketTypes={ticketTypes}
        paymentMethods={paymentMethods}
        onSaleSuccess={async (saleData, openDrawer) => {
          await fetchParticipants();
          showNotification(
            'success',
            `Venta registrada exitosamente para ${saleData.registration.participant.fullName} (Ticket #${saleData.registration.registrationNumber})`
          );
          if (openDrawer) {
            handleOpenDetail(saleData.registration);
          }
        }}
      />

      {/* Modal de Creación / Edición */}
      <ParticipantFormModal
        initialReceipt={receiptEntry}
        isOpen={isFormOpen}
        registrationToEdit={selectedForEdit}
        onClose={() => {setIsFormOpen(false);if(receiptEntry)setSearchParams({}, {replace:true});}}
        onSuccess={(saved) => {
          fetchParticipants();
          showNotification(
            'success',
            selectedForEdit ? 'Participante actualizado exitosamente' : `Participante registrado. Número interno: ${saved.registrationNumber}`
          );
        }}
      />

      {/* Modal de Confirmación de Eliminación */}
      <DeleteConfirmModal
        registration={selectedForDelete}
        isOpen={isDeleteOpen}
        loading={deleteLoading}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />

      {/* Modal para Borrar Excel Importado (Admin) */}
      <DeleteExcelModal
        isOpen={isDeleteExcelOpen}
        onClose={() => setIsDeleteExcelOpen(false)}
        onDeleted={() => {
          fetchParticipants();
          showNotification('success', 'Lote de Excel eliminado exitosamente');
        }}
      />
    </div>
  );
};
