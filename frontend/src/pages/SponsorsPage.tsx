import {ImportedContributionsPanel} from '../components/ImportedContributionsPanel';
import {Link} from 'react-router-dom';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { MobileSearchInput } from '../components/common/MobileSearchInput';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SponsorCategorySettings } from '../components/sponsors/SponsorCategorySettings';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { sponsorsService, CreatePaymentData, CreateSponsorData, UpdateSponsorData } from '../services/sponsors.service';
import { Sponsor, SponsorSummary, SponsorType, ContributionType, SponsorStatus } from '../types';
import { SponsorFormModal } from '../components/sponsors/SponsorFormModal';
import { RecordSponsorPaymentModal } from '../components/sponsors/RecordSponsorPaymentModal';
import { SponsorDetailDrawer } from '../components/sponsors/SponsorDetailDrawer';
import { TableSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import {
  Handshake,
  DollarSign,
  Gift,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Archive,
  ArchiveRestore,
  Eye,
  Edit,
  Building2,
  Phone,
  Mail,
  Loader2,
  RotateCcw,
  Tag,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

export const SponsorsPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [summary, setSummary] = useState<SponsorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryNames, setCategoryNames] = useState<string[]>(['Geek Gold', 'Geek Silver', 'Geek']);
  useEffect(() => {
    let active = true;
    sponsorsService.getCategories().then(data => { if (active) setCategoryNames(data.map(c => c.name)); }).catch(() => {});
    return () => { active = false; };
  }, [currentEvent?.id]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | SponsorType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SponsorStatus>('ALL');
  const [contributionFilter, setContributionFilter] = useState<'ALL' | ContributionType>('ALL');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Modals & Drawer State
  const [selectedSponsor, setSelectedSponsor] = useState<Sponsor | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [sponsorToEdit, setSponsorToEdit] = useState<Sponsor | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [sponsorForPayment, setSponsorForPayment] = useState<Sponsor | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatRD = (val: number) =>
    new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(val);

  const readVersion = useRef(0);
  const loadData = useCallback(async (silent = false) => {
    if (!currentEvent) return;
    const version = ++readVersion.current;
    try {
      if (!silent) setLoading(true);
      const res = await sponsorsService.getSponsors({
        search: search.trim() || undefined,
        type: typeFilter,
        category: categoryFilter || undefined,
        status: statusFilter,
        contributionType: contributionFilter,
        includeArchived,
        page,
        limit: 25,
      });

      if (version !== readVersion.current) return;
      setSponsors(res.items);
      setSummary(res.summary);
      setTotalPages(res.pagination.totalPages);
      setTotalItems(res.pagination.total);

      // Sincronizar patrocinador activo en el drawer si está abierto
      if (selectedSponsor) {
        {
          sponsorsService.getSponsorById(selectedSponsor.id).then((fresh) => {
            setSelectedSponsor(previous => previous?.id === fresh.id && version === readVersion.current ? fresh : previous);
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error('Error cargando patrocinadores:', err);
      showNotification('error', err.response?.data?.message || 'Error al cargar patrocinadores');
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, [currentEvent, search, categoryFilter, typeFilter, statusFilter, contributionFilter, includeArchived, page, selectedSponsor?.id]);

  useRealtimeRefresh('sponsors', () => loadData(true));

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler for creating / updating sponsor
  const handleSaveSponsor = async (data: CreateSponsorData | UpdateSponsorData) => {
    try {
      if (sponsorToEdit) {
        await sponsorsService.updateSponsor(sponsorToEdit.id, data);
        showNotification('success', 'Patrocinador actualizado con éxito');
      } else {
        await sponsorsService.createSponsor({
          ...data as CreateSponsorData,
          eventId: currentEvent?.id,
        });
        showNotification('success', 'Patrocinador registrado con éxito');
      }
      setIsFormModalOpen(false);
      setSponsorToEdit(null);
      await loadData();
    } catch (err: any) {
      throw err;
    }
  };

  // Handler for registering payment
  const handleRegisterPayment = async (sponsorId: string, data: CreatePaymentData) => {
    try {
      await sponsorsService.registerPayment(sponsorId, data);
      showNotification('success', 'Abono registrado correctamente');
      setIsPaymentModalOpen(false);
      setSponsorForPayment(null);
      await loadData();
    } catch (err: any) {
      throw err;
    }
  };

  // Handler for annulling payment
  const handleAnnullPayment = async (paymentId: string, reason: string) => {
    try {
      await sponsorsService.annullPayment(paymentId, reason);
      showNotification('success', 'Pago anulado y balances recalculados correctamente');
      await loadData();
    } catch (err: any) {
      throw err;
    }
  };

  // Handler for archiving
  const handleArchive = async (sponsorId: string, isArchived: boolean) => {
    try {
      await sponsorsService.archiveSponsor(sponsorId, isArchived);
      showNotification('success', isArchived ? 'Patrocinador archivado' : 'Patrocinador reactivado');
      if (selectedSponsor && selectedSponsor.id === sponsorId) {
        setSelectedSponsor({ ...selectedSponsor, isArchived });
      }
      await loadData();
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || 'Error al cambiar estado de archivo');
    }
  };

  const openDrawer = async (sponsor: Sponsor) => {
    try {
      const detailed = await sponsorsService.getSponsorById(sponsor.id);
      setSelectedSponsor(detailed);
      setIsDrawerOpen(true);
    } catch (err: any) {
      setSelectedSponsor(sponsor);
      setIsDrawerOpen(true);
    }
  };

  const getStatusBadge = (status: SponsorStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Pagado
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Abono Parcial
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
            Cancelado
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Pendiente
          </span>
        );
    }
  };

  const renderTierBadge = (category?: string | null) => {
    if (!category) return null;
    const catLower = category.toLowerCase();
    if (catLower.includes('gold') || catLower.includes('oro')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#d8b25a]/15 text-[#8a6414] dark:text-[#d8b25a] border border-[#d8b25a]/30">
          {category}
        </span>
      );
    }
    if (catLower.includes('silver') || catLower.includes('plata')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#c4c8ce]/15 text-[#5d6168] dark:text-[#c4c8ce] border border-[#c4c8ce]/30">
          {category}
        </span>
      );
    }
    if (catLower.includes('geek') || catLower.includes('platino') || catLower.includes('diamante')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
          {category}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
        {category}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 border shadow-lg ${
            notification.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-primary/15 border-primary/30 text-primary'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <ImportedContributionsPanel key={currentEvent?.id}/>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Handshake className="w-7 h-7 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-tight">
              Patrocinadores y Colaboradores
            </h1>{hasRole(['ADMIN'])&&<Link className="btn-secondary inline-flex mt-2" to="/import?destination=SPONSORS">Importar Excel</Link>}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Gestión de aportes económicos y aliados estratégicos para{' '}
            <strong className="text-foreground font-display font-bold">{currentEvent?.name || 'BarCamp RD 2026'}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setSponsorToEdit(null);
                setIsFormModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-primary to-[#BA1513] text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Patrocinador</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Comprometido */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
              Comprometido
            </span>
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-black text-foreground truncate">
            {formatRD(summary?.totalCommitted || 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Aportes pactados</div>
        </div>

        {/* Total Recibido */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
              Recibido
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-black text-emerald-400 truncate">
            {formatRD(summary?.totalReceived || 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Fondos en cuenta</div>
        </div>

        {/* Balance Pendiente */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
              Pendiente
            </span>
            <AlertCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-black text-primary truncate">
            {formatRD(summary?.totalPending || 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Por recaudar</div>
        </div>

        {/* Patrocinadores */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
              Patrocinadores
            </span>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-display font-black text-foreground">
            {summary?.totalSponsors || 0}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Empresas oficiales</div>
        </div>

        {/* Colaboradores */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
              Colaboradores
            </span>
            <Handshake className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-display font-black text-foreground">
            {summary?.totalCollaborators || 0}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Aliados estratégicos</div>
        </div>

        {/* En Especie */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-[#d8b25a] uppercase tracking-wider">
              En Especie
            </span>
            <Gift className="w-4 h-4 text-[#d8b25a]" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-display font-black text-foreground">
            {summary?.inKindCount || 0}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Bienes y servicios</div>
        </div>
      </div>

      <ImportedContributionsPanel key={currentEvent?.id}/>
      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
            <MobileSearchInput
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por empresa, nivel, contacto o correo..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tipo */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="ALL">Todos los Tipos</option>
              <option value="SPONSOR">Solo Patrocinadores</option>
              <option value="COLLABORATOR">Solo Colaboradores</option>
            </select>

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="PENDING">Pendientes</option>
              <option value="PARTIALLY_PAID">Abonos Parciales</option>
              <option value="PAID">Pagados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>

            {/* Tipo de Aporte */}
            <select
              value={contributionFilter}
              onChange={(e) => {
                setContributionFilter(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="ALL">Todo Tipo de Aporte</option>
              <option value="MONETARY">Monetario</option>
              <option value="IN_KIND">En Especie</option>
              <option value="MIXED">Mixto</option>
            </select>

            <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-xs rounded-xl bg-background border border-border text-foreground">
              <option value="">Todas las categorías</option>
              {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            {/* Archivados */}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1.5 rounded-xl border border-border cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => {
                  setIncludeArchived(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="font-mono text-[11px]">Archivados</span>
            </label>

            <button
              type="button"
              onClick={() => { void loadData(); }}
              title="Refrescar datos"
              className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <SponsorCategorySettings key={currentEvent?.id} isAdmin={isAdmin} breakdown={summary?.byCategory} onSaved={loadData} />
      {/* Main Table / List */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-xs font-semibold">Cargando aliados y aportes...</p>
          </div>
        ) : sponsors.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <Handshake className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-base font-bold font-display text-foreground">No se encontraron patrocinadores</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || typeFilter !== 'ALL' || statusFilter !== 'ALL'
                ? 'Prueba modificando los filtros o el término de búsqueda.'
                : 'Aún no se han registrado patrocinadores o colaboradores para esta edición.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSponsorToEdit(null);
                  setIsFormModalOpen(true);
                }}
                className="mt-4 px-4 py-2 rounded-full text-xs font-bold bg-primary text-white inline-flex items-center gap-1.5 cursor-pointer shadow-lg shadow-primary/25"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Primer Patrocinador</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider font-mono font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-3">Empresa / Aliado</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Aporte</th>
                  <th className="px-4 py-3 text-right">Comprometido</th>
                  <th className="px-4 py-3 text-right">Recibido</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sponsors.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                      s.isArchived ? 'opacity-60 bg-muted/10' : ''
                    }`}
                    onClick={() => openDrawer(s)}
                  >
                    {/* Empresa / Aliado */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-[#BA1513] flex items-center justify-center text-white font-display font-black text-xs shadow shrink-0 overflow-hidden">
                          {s.logoUrl ? (
                            <img
                              src={s.logoUrl}
                              alt={s.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span>{s.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-display font-bold text-foreground text-sm flex items-center gap-1.5">
                            <span>{s.name}</span>
                            {s.isArchived && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Archivada
                              </span>
                            )}
                          </div>
                          {s.category && (
                            <div className="mt-0.5">
                              {renderTierBadge(s.category)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          s.type === 'SPONSOR'
                            ? 'bg-primary/15 text-primary border border-primary/25'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                        }`}
                      >
                        {s.type === 'SPONSOR' ? 'Patrocinador' : 'Colaborador'}
                      </span>
                    </td>

                    {/* Contacto */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-0.5">
                        {s.contactName ? (
                          <div className="font-medium text-foreground">{s.contactName}</div>
                        ) : (
                          <div className="text-muted-foreground italic">Sin contacto</div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          {s.contactPhone && (
                            <a
                              href={`tel:${s.contactPhone}`}
                              className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>{s.contactPhone}</span>
                            </a>
                          )}
                          {s.contactEmail && (
                            <a
                              href={`mailto:${s.contactEmail}`}
                              className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
                            >
                              <Mail className="w-2.5 h-2.5" />
                              <span>{s.contactEmail}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Aporte */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {s.contributionType === 'MONETARY' && (
                          <span className="text-muted-foreground font-medium">Monetario</span>
                        )}
                        {s.contributionType === 'IN_KIND' && (
                          <span className="text-[#d8b25a] font-semibold flex items-center gap-1">
                            <Gift className="w-3 h-3" /> En Especie
                          </span>
                        )}
                        {s.contributionType === 'MIXED' && (
                          <span className="text-blue-400 font-semibold flex items-center gap-1">
                            <Gift className="w-3 h-3" /> Mixto
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Comprometido */}
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {formatRD(s.committedAmount)}
                    </td>

                    {/* Recibido */}
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-400">
                      {formatRD(s.receivedAmount)}
                    </td>

                    {/* Pendiente */}
                    <td className="px-4 py-3 text-right font-mono font-black text-primary">
                      {formatRD(s.pendingBalance)}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">{getStatusBadge(s.status)}</div>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDrawer(s)}
                          className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          title="Ver Ficha Completa"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <>
                            {s.status !== 'PAID' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSponsorForPayment(s);
                                  setIsPaymentModalOpen(true);
                                }}
                                className="p-1.5 rounded-xl text-emerald-400 hover:text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                                title="Registrar Pago"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setSponsorToEdit(s);
                                setIsFormModalOpen(true);
                              }}
                              className="p-1.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-muted transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleArchive(s.id, !s.isArchived)}
                              className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title={s.isArchived ? 'Desarchivar' : 'Archivar'}
                            >
                              {s.isArchived ? (
                                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div className="font-mono text-[11px]">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalItems} registros)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-xl border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-xl border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <SponsorDetailDrawer
        sponsor={selectedSponsor}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSponsor(null);
        }}
        onEdit={async (data) => {
          if (!selectedSponsor) return;
          await sponsorsService.updateSponsor(selectedSponsor.id, data);
          showNotification('success', 'Patrocinador actualizado');
          await loadData();
        }}
        onArchive={async (isArchived) => {
          if (!selectedSponsor) return;
          await handleArchive(selectedSponsor.id, isArchived);
        }}
        onRegisterPayment={async (sponsorId, data) => {
          await handleRegisterPayment(sponsorId, data);
        }}
        onAnnullPayment={async (paymentId, reason) => {
          await handleAnnullPayment(paymentId, reason);
        }}
      />

      {/* Form Modal */}
      <SponsorFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSponsorToEdit(null);
        }}
        sponsorToEdit={sponsorToEdit}
        onSave={handleSaveSponsor}
      />

      {/* Direct Payment Modal */}
      <RecordSponsorPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSponsorForPayment(null);
        }}
        sponsor={sponsorForPayment}
        onConfirm={handleRegisterPayment}
      />
    </div>
  );
};
