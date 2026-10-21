import React, { useState, useEffect, useCallback } from 'react';
import { activityService } from '../services/activity.service';
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
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [result, setResult] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Catálogos para filtros
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);

  // Registro expandido para inspección
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showRawJsonMap, setShowRawJsonMap] = useState<Record<string, boolean>>({});

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
        result: result || undefined,
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
  }, [page, limit, search, userId, action, entity, result, startDate, endDate]);

  useEffect(() => {
    setPage(1);
  }, [search, userId, action, entity, result, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const clearFilters = () => {
    setSearch('');
    setUserId('');
    setAction('');
    setEntity('');
    setResult('');
    setStartDate('');
    setEndDate('');
  };

  const isFiltering = !!(search || userId || action || entity || result || startDate || endDate);

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await activityService.export({
        search: search.trim() || undefined,
        userId: userId || undefined,
        action: action || undefined,
        entity: entity || undefined,
        result: result || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EventGrid_Historial_Actividades_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error al exportar bitácora:', err);
      alert('Error al descargar el archivo de auditoría.');
    } finally {
      setExporting(false);
    }
  };

  const getActionBadge = (act: string) => {
    const upper = act.toUpperCase();
    if (upper.includes('CHECKIN') || upper === 'CHECK_IN') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          CHECK-IN
        </span>
      );
    }
    if (upper.includes('SALE') || upper.includes('VENTA')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
          VENTA PRESENCIAL
        </span>
      );
    }
    if (upper.includes('REVERT') || upper.includes('CANCEL') || upper.includes('DELETE') || upper.includes('REVOKE')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          {act}
        </span>
      );
    }
    if (upper.includes('CREATE') || upper.includes('IMPORT')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
          {act}
        </span>
      );
    }
    if (upper.includes('UPDATE') || upper.includes('TSHIRT')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          {act}
        </span>
      );
    }
    if (upper.includes('PAYMENT') || upper.includes('COURTESY')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          {act}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
        {act}
      </span>
    );
  };

  const getResultBadge = (res?: string) => {
    switch (res?.toUpperCase()) {
      case 'SUCCESS':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Exitoso</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Rechazado</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>Fallido</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            {res || 'Completado'}
          </span>
        );
    }
  };

  const toggleRawJson = (id: string) => {
    setShowRawJsonMap((prev) => ({ ...prev, [id]: !prev[id] }));
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
            <span className="text-xs text-muted-foreground">• {total} registros en bitácora</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            <span>Historial Centralizado de Actividades y Auditoría</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-3xl">
            Trazabilidad inmutable de todas las operaciones realizadas en EventGrid: check-ins físicos, escaneo QR, cambios de tallas, importaciones Excel, ventas presenciales, modificaciones y auditoría de administración.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/20 transition-all cursor-pointer disabled:opacity-50"
            title="Exportar registros filtrados a formato Excel (.xlsx)"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            <span>{exporting ? 'Exportando...' : 'Exportar Excel'}</span>
          </button>

          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs text-foreground font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Búsqueda */}
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por operador, participante o detalle..."
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
              <option value="">Todos los operadores</option>
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

          {/* Filtro Resultado */}
          <div>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
            >
              <option value="">Todos los resultados</option>
              <option value="SUCCESS">Exitoso (SUCCESS)</option>
              <option value="REJECTED">Rechazado (REJECTED)</option>
              <option value="FAILED">Fallido (FAILED)</option>
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
                <th className="p-3.5 font-bold">Operador</th>
                <th className="p-3.5 font-bold">Acción</th>
                <th className="p-3.5 font-bold">Módulo / Entidad</th>
                <th className="p-3.5 font-bold text-center">Resultado</th>
                <th className="p-3.5 font-bold">IP</th>
                <th className="p-3.5 font-bold text-center">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Consultando bitácora de auditoría...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center space-y-2">
                    <Shield className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                    <p className="text-sm font-bold text-foreground">
                      {isFiltering ? 'No se encontraron eventos con los filtros seleccionados' : 'No hay registros de auditoría'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const showRawJson = !!showRawJsonMap[log.id];

                  // Parse changes if string
                  let changes = log.changes;
                  if (typeof changes === 'string') {
                    try {
                      changes = JSON.parse(changes);
                    } catch {
                      // string
                    }
                  }

                  const hasDiff = changes && (changes.previous || changes.current || changes.reason || changes.tshirtSize || changes.participantName);

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
                            <span className="text-muted-foreground font-mono">Sistema / Proceso</span>
                          )}
                        </td>

                        <td className="p-3.5 whitespace-nowrap">{getActionBadge(log.action)}</td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-mono text-[11px] font-bold text-foreground">
                            {log.entity}
                          </span>
                          {log.entityId && (
                            <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[140px]" title={log.entityId}>
                              ID: {log.entityId.slice(0, 13)}...
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center whitespace-nowrap">
                          {getResultBadge(log.result)}
                        </td>

                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {log.ipAddress || '—'}
                        </td>

                        <td className="p-3.5 text-center whitespace-nowrap">
                          {changes ? (
                            <button
                              type="button"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-[11px] font-semibold text-foreground flex items-center gap-1 mx-auto cursor-pointer"
                              title="Inspeccionar cambios y valores"
                            >
                              <Code className="w-3 h-3 text-primary" />
                              <span>{isExpanded ? 'Ocultar' : 'Detalles'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Fila expandida con desglose detallado */}
                      {isExpanded && changes && (
                        <tr className="bg-muted/30">
                          <td colSpan={7} className="p-4 border-t border-border">
                            <div className="space-y-3 bg-card p-4 rounded-xl border border-border text-xs">
                              <div className="flex items-center justify-between border-b border-border pb-2">
                                <span className="font-bold text-foreground flex items-center gap-1.5">
                                  <Shield className="w-4 h-4 text-primary" />
                                  <span>Detalle Operativo del Evento</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleRawJson(log.id)}
                                  className="text-[11px] text-primary hover:underline font-mono cursor-pointer"
                                >
                                  {showRawJson ? 'Ver formato visual' : 'Ver payload JSON'}
                                </button>
                              </div>

                              {showRawJson ? (
                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(changes, null, 2)}</pre>
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  {/* Participante o ticket involucrado */}
                                  {(changes.participantName || changes.registrationNumber || changes.ticket) && (
                                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border">
                                      <span className="text-muted-foreground text-[11px]">Participante:</span>
                                      <span className="font-bold text-foreground">
                                        {changes.participantName || 'N/A'}
                                      </span>
                                      {(changes.registrationNumber || changes.ticket) && (
                                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-white border border-zinc-700">
                                          {changes.registrationNumber || changes.ticket}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Motivo o Razón */}
                                  {changes.reason && (
                                    <div className="p-2.5 rounded-lg bg-background border border-border">
                                      <span className="text-muted-foreground text-[11px] block">Motivo / Razón especificada:</span>
                                      <span className="text-foreground font-semibold italic">"{changes.reason}"</span>
                                    </div>
                                  )}

                                  {/* T-Shirt Size */}
                                  {changes.tshirtSize && (
                                    <div className="p-2.5 rounded-lg bg-background border border-border flex items-center gap-2">
                                      <span className="text-muted-foreground text-[11px]">Talla de Camiseta Entregada:</span>
                                      <span className="px-2 py-0.5 rounded font-bold bg-primary/20 text-primary border border-primary/30">
                                        {changes.tshirtSize}
                                      </span>
                                    </div>
                                  )}

                                  {/* Cambio de T-Shirt Size */}
                                  {changes.newSize && (
                                    <div className="p-2.5 rounded-lg bg-background border border-border flex items-center gap-2">
                                      <span className="text-muted-foreground text-[11px]">Modificación de Talla:</span>
                                      <span className="line-through text-muted-foreground">{changes.previousSize || 'Sin talla'}</span>
                                      <span>→</span>
                                      <span className="px-2 py-0.5 rounded font-bold bg-primary/20 text-primary border border-primary/30">
                                        {changes.newSize}
                                      </span>
                                    </div>
                                  )}

                                  {/* Resumen de Importación Excel */}
                                  {(changes.totalRows !== undefined || changes.createdCount !== undefined) && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div className="p-2 rounded-lg bg-background border border-border">
                                        <span className="text-[10px] text-muted-foreground block uppercase font-mono">Filas procesadas</span>
                                        <span className="font-bold text-foreground">{changes.totalRows ?? changes.processedCount ?? 0}</span>
                                      </div>
                                      <div className="p-2 rounded-lg bg-background border border-border">
                                        <span className="text-[10px] text-emerald-400 block uppercase font-mono">Creados</span>
                                        <span className="font-bold text-emerald-400">{changes.createdCount ?? 0}</span>
                                      </div>
                                      <div className="p-2 rounded-lg bg-background border border-border">
                                        <span className="text-[10px] text-amber-400 block uppercase font-mono">Duplicados</span>
                                        <span className="font-bold text-amber-400">{changes.duplicateCount ?? 0}</span>
                                      </div>
                                      <div className="p-2 rounded-lg bg-background border border-border">
                                        <span className="text-[10px] text-rose-400 block uppercase font-mono">Errores / Rechazados</span>
                                        <span className="font-bold text-rose-400">{changes.errorCount ?? changes.rejectedCount ?? 0}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Comparación Diff (Anterior vs Nuevo) */}
                                  {changes.previous && changes.current && (
                                    <div className="border border-border rounded-lg overflow-hidden">
                                      <div className="p-2 bg-muted/40 font-mono text-[10px] uppercase font-bold text-muted-foreground">
                                        Valores Modificados (Comparativa Anterior vs Nuevo):
                                      </div>
                                      <table className="w-full text-left text-xs font-mono">
                                        <thead className="bg-muted/20 border-b border-border text-[10px] text-muted-foreground">
                                          <tr>
                                            <th className="p-2">Campo</th>
                                            <th className="p-2">Valor Anterior</th>
                                            <th className="p-2">Nuevo Valor</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border text-[11px]">
                                          {Object.keys(changes.current).map((key) => {
                                            const prev = changes.previous?.[key];
                                            const curr = changes.current?.[key];
                                            if (prev === curr) return null;
                                            return (
                                              <tr key={key}>
                                                <td className="p-2 font-bold text-foreground">{key}</td>
                                                <td className="p-2 text-rose-400/90 line-through">
                                                  {String(prev ?? '—')}
                                                </td>
                                                <td className="p-2 text-emerald-400 font-bold">
                                                  {String(curr ?? '—')}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
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
              Página {page} de {totalPages} ({total} eventos registrados)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
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
