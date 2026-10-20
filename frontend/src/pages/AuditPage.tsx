import React, { useState, useEffect, useCallback } from 'react';
import { activityService, ActivityResult } from '../services/activity.service';
import { AuditLog, User } from '../types';
import {
  History,
  Shield,
  Search,
  Filter,
  User as UserIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Code,
  ArrowUpDown,
  Tag,
  Activity,
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Catálogos para filtros
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);

  // Registro expandido para inspección JSON
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await activityService.list({
        page,
        limit,
        search: search.trim() || undefined,
        userId: userId || undefined,
        action: action || undefined,
        entity: entity || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      });

      setLogs(res.data);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);

      if (res.filters) {
        if (res.filters.users?.length) setAvailableUsers(res.filters.users);
        if (res.filters.actions?.length) setAvailableActions(res.filters.actions);
        if (res.filters.entities?.length) setAvailableEntities(res.filters.entities);
      }
    } catch (err) {
      console.error('Error al cargar bitácora de actividad:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, userId, action, entity, startDate, endDate]);

  useEffect(() => {
    setPage(1);
  }, [search, userId, action, entity, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const clearFilters = () => {
    setSearch('');
    setUserId('');
    setAction('');
    setEntity('');
    setStartDate('');
    setEndDate('');
  };

  const isFiltering = !!(search || userId || action || entity || startDate || endDate);

  const getActionBadge = (act: string) => {
    switch (act.toUpperCase()) {
      case 'CHECK_IN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            CHECK-IN
          </span>
        );
      case 'ONSITE_SALE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
            VENTA PRESENCIAL
          </span>
        );
      case 'REVERT_ATTENDANCE':
      case 'CANCEL':
      case 'DELETE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            {act}
          </span>
        );
      case 'CREATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            CREACIÓN
          </span>
        );
      case 'UPDATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            ACTUALIZACIÓN
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
            {act}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              Seguridad & Trazabilidad
            </span>
            <span className="text-xs text-muted-foreground">• {total} eventos registrados</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            <span>Historial de Actividad y Auditoría</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registro cronológico inmutable de acciones realizadas en EventGrid: check-ins, ventas, modificaciones de participantes y ajustes de configuración.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs text-foreground font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Búsqueda */}
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuario, IP o cambio..."
              className="w-full pl-8.5 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs"
            />
          </div>

          {/* Filtro Usuario */}
          <div>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
            >
              <option value="">Todos los usuarios</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Acción */}
          <div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
            >
              <option value="">Todas las acciones</option>
              {availableActions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Entidad */}
          <div>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
            >
              <option value="">Todas las entidades</option>
              {availableEntities.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fechas y Limpiar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {isFiltering && (
            <button
              onClick={clearFilters}
              className="text-primary hover:underline font-semibold cursor-pointer"
            >
              Limpiar todos los filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Auditoría */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase font-mono text-[10px]">
              <tr>
                <th className="p-3.5 font-bold">Fecha / Hora</th>
                <th className="p-3.5 font-bold">Usuario Responsable</th>
                <th className="p-3.5 font-bold">Acción</th>
                <th className="p-3.5 font-bold">Entidad Afectada</th>
                <th className="p-3.5 font-bold">Dirección IP</th>
                <th className="p-3.5 font-bold text-center">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Consultando bitácora de auditoría...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center space-y-2">
                    <Shield className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                    <p className="text-sm font-bold text-foreground">
                      {isFiltering ? 'No se encontraron registros con los filtros seleccionados' : 'No hay registros de auditoría'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString('es-DO', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          {log.user ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">
                                {log.user.fullName.charAt(0)}
                              </div>
                              <div>
                                <span className="font-bold text-foreground block">{log.user.fullName}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{log.user.email}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-mono">Sistema / Anónimo</span>
                          )}
                        </td>

                        <td className="p-3.5 whitespace-nowrap">{getActionBadge(log.action)}</td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-mono text-[11px] font-bold text-foreground">
                            {log.entity}
                          </span>
                          {log.entityId && (
                            <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                              ID: {log.entityId}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {log.ipAddress || '—'}
                        </td>

                        <td className="p-3.5 text-center whitespace-nowrap">
                          {log.changes ? (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-[11px] font-semibold text-foreground flex items-center gap-1 mx-auto cursor-pointer"
                              title="Inspeccionar cambios"
                            >
                              <Code className="w-3 h-3 text-primary" />
                              <span>{isExpanded ? 'Ocultar' : 'Ver diff'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Fila expandida con JSON de cambios */}
                      {isExpanded && log.changes && (
                        <tr className="bg-muted/40">
                          <td colSpan={6} className="p-4 border-t border-border">
                            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
                              <pre className="whitespace-pre-wrap">{JSON.stringify(log.changes, null, 2)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>
              Página {page} de {totalPages} ({total} eventos)
            </span>
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
    </div>
  );
};