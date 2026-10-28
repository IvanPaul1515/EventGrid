import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip,Legend,LabelList} from 'recharts';
import {inventoryChart} from '../utils/inventoryChart';
import {MerchPanel} from '../components/inventory/MerchPanel';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { inventoryService, TshirtInventoryItem, InventoryStats } from '../services/inventory.service';
import { TableSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import {
  Shirt,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  Check,
  TrendingUp,
} from 'lucide-react';

export const TshirtInventoryPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  const [items, setItems] = useState<TshirtInventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [newSizeQuantity, setNewSizeQuantity] = useState(20);
  const [savingAdd, setSavingAdd] = useState(false);

  const [editingItem, setEditingItem] = useState<TshirtInventoryItem | null>(null);
  const [editQuantity, setEditQuantity] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const readVersion = useRef(0);
  const loadData = useCallback(async (silent = false) => {
    if (!currentEvent?.id) return;
    const version = ++readVersion.current;
    try {
      if (!silent) setLoading(true);
      const res = await inventoryService.getInventory(currentEvent.id);
      if (version !== readVersion.current) return;
      setItems(res.items);
      setStats(res.stats);
    } catch (err: any) {
      console.error('Error al cargar inventario de T-shirts:', err);
      setFeedback({
        type: 'error',
        text: err.response?.status === 403 ? 'Acceso denegado: No tiene permisos suficientes para consultar el inventario de T-shirts.' : (err.response?.data?.message || 'Error al consultar inventario de T-shirts'),
      });
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, [currentEvent?.id]);

  useRealtimeRefresh('inventory', () => loadData(true));

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Escuchar refrescos globales de datos
  // Sincronización en tiempo real al entregar o modificar camisetas
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('eventgrid:data-refresh', handleRefresh);
    return () => window.removeEventListener('eventgrid:data-refresh', handleRefresh);
  }, [loadData]);

  const handleInitDefault = async () => {
    if (!currentEvent?.id) return;
    try {
      setLoading(true);
      const res = await inventoryService.initDefaultInventory(currentEvent.id);
      setItems(res.items);
      setStats(res.stats);
      setFeedback({
        type: 'success',
        text: 'Inventario inicial de 282 T-shirts verificado/cargado correctamente para esta edición.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al inicializar inventario',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id || !newSizeName.trim()) return;

    setSavingAdd(true);
    setFeedback(null);
    try {
      await inventoryService.createItem(
        { size: newSizeName.trim(), initialQuantity: Number(newSizeQuantity) },
        currentEvent.id
      );
      setShowAddModal(false);
      setNewSizeName('');
      setNewSizeQuantity(20);
      setFeedback({ type: 'success', text: `Talla "${newSizeName}" agregada exitosamente al inventario.` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Error al agregar talla' });
    } finally {
      setSavingAdd(false);
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id || !editingItem) return;

    setSavingEdit(true);
    setFeedback(null);
    try {
      await inventoryService.updateItem(
        editingItem.id,
        { initialQuantity: Number(editQuantity), isActive: editActive },
        currentEvent.id
      );
      setEditingItem(null);
      setFeedback({ type: 'success', text: `Talla "${editingItem.size}" actualizada exitosamente.` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Error al actualizar talla' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (item: TshirtInventoryItem) => {
    if (!currentEvent?.id) return;
    try {
      await inventoryService.updateItem(item.id, { isActive: !item.isActive }, currentEvent.id);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Error al cambiar estado' });
    }
  };

  const handleDeleteItem = async (item: TshirtInventoryItem) => {
    if (!currentEvent?.id) return;
    if (!confirm(`¿Está seguro de eliminar la talla "${item.size}" del inventario?`)) return;

    try {
      await inventoryService.deleteItem(item.id, currentEvent.id);
      setFeedback({ type: 'success', text: `Talla "${item.size}" eliminada del inventario.` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Error al eliminar talla' });
    }
  };

  // Calcular máximo para la escala de la gráfica de barras


  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              Gestión de Stock
            </span>
            <span className="text-xs text-muted-foreground">
              • Edición: <strong className="text-foreground">{currentEvent?.name || 'BarCamp RD'}</strong>
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Shirt className="w-6 h-6 text-primary" />
            <span>Inventario de merch</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Control de existencias, entregas físicas en check-in y balance de camisetas por talla asociado exclusivamente a esta edición.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Talla</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => { void loadData(); }}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs text-foreground font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Mensajes de Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <MerchPanel/>
      <h2 className="text-xl font-bold">Camisetas por talla</h2>
      {/* Tarjetas de Métricas de Inventario */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Inicial */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-mono uppercase font-bold tracking-wider">Total Inicial</span>
            <Layers className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-foreground">
              {stats?.totalInitial ?? 0}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase font-mono">unidades</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Existencias configuradas</p>
        </div>

        {/* Camisetas Entregadas */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] font-mono uppercase font-bold tracking-wider">Entregadas</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {stats?.totalDelivered ?? 0}
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">
              ({stats?.deliveryRate ?? 0}%)
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">Descontadas en check-in</p>
        </div>

        {/* Camisetas Disponibles */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-primary">
            <span className="text-[11px] font-mono uppercase font-bold tracking-wider">Disponibles</span>
            <Package className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span data-testid="inventory-available" className="text-2xl font-black font-mono text-primary">
              {stats?.totalAvailable ?? 0}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase font-mono">en almacén</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Listas para entrega física</p>
        </div>

        {/* Pendientes de Entrega */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[11px] font-mono uppercase font-bold tracking-wider">Pendientes</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-amber-400">
              {stats?.totalPendingDelivery ?? 0}
            </span>
            <span className="text-[10px] text-amber-400/80 uppercase font-mono">por entregar</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Talla anotada sin entrega</p>
        </div>

        {/* Alertas de Stock */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1 col-span-2 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[11px] font-mono uppercase font-bold tracking-wider">Agotadas / Bajas</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-rose-400">
              {stats?.outOfStockCount ?? 0}
            </span>
            <span className="text-[10px] text-amber-400 font-mono">
              ({stats?.lowStockCount ?? 0} pocas)
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">Tallas en punto crítico</p>
        </div>
      </div>

      <section className="p-4 rounded-2xl bg-card border border-border min-w-0 space-y-3" aria-label="Inventario de camisetas por talla">
        <h3 className="font-bold text-sm">Camisetas por talla</h3>
        <p className="text-xs text-muted-foreground">Entregadas y disponibles físicas componen las existencias registradas. Pendientes representa solicitudes; no se suma al stock. Las reservas de staff permanecen dentro del stock físico.</p>
        <div className="w-full min-w-0" role="img" aria-label="Entregas, existencias físicas y solicitudes pendientes por talla">
          <ResponsiveContainer width="100%" height={260}><BarChart data={inventoryChart(items)} margin={{top:22,right:8,left:-16,bottom:4}} barGap={2}>
            <XAxis dataKey="size" tick={{fontSize:11,fill:'hsl(var(--foreground))'}} interval={0}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'hsl(var(--muted-foreground))'}}/>
            <Tooltip contentStyle={{background:'hsl(var(--card))',color:'hsl(var(--foreground))',borderColor:'hsl(var(--border))'}}/><Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="delivered" name="Entregadas" fill="#059669" maxBarSize={32}><LabelList dataKey="delivered" position="top" fontSize={10} fill="hsl(var(--foreground))"/></Bar>
            <Bar dataKey="available" name="Disponibles físicas" fill="hsl(var(--primary))" maxBarSize={32}><LabelList dataKey="available" position="top" fontSize={10} fill="hsl(var(--foreground))"/></Bar>
            <Bar dataKey="pending" name="Solicitudes pendientes" fill="#d97706" maxBarSize={32}><LabelList dataKey="pending" position="top" fontSize={10} fill="hsl(var(--foreground))"/></Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <details className="text-xs"><summary className="cursor-pointer">Consultar cantidades por talla</summary>{inventoryChart(items).map(r=><p key={r.size}>{r.size}: existencias {r.total} · entregadas {r.delivered} · físicas {r.available} · libres para participantes {r.participantAvailable} · solicitudes {r.pending}</p>)}</details>
      </section>

      {/* Tabla Detallada de Inventario */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-foreground">Distribución y Control por Talla</h3>
            <p className="text-[11px] text-muted-foreground">
              Ajuste de existencias y activación de tallas para la entrega física durante el check-in.
            </p>
          </div>
          {isAdmin && stats?.totalInitial === 0 && (
            <button
              type="button"
              onClick={handleInitDefault}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cargar 282 unidades iniciales</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase font-mono text-[10px]">
              <tr>
                <th className="p-3.5 font-bold">Talla</th>
                <th className="p-3.5 font-bold text-center">Cantidad Inicial</th>
                <th className="p-3.5 font-bold text-center">Entregadas</th>
                <th className="p-3.5 font-bold text-center">Disponibles</th>
                <th className="p-3.5 font-bold text-center">Pendientes</th>
                <th className="p-3.5 font-bold text-center">Estado</th>
                {isAdmin && <th className="p-3.5 font-bold text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <TableSkeleton rows={6} cols={6} />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8">
                    <EmptyState
                      icon={Shirt}
                      title="No hay tallas en el inventario de esta edición"
                      description="Active las tallas de camisetas deseadas o cargue la configuración de 282 unidades estándar de BarCamp."
                      actionLabel={isAdmin ? 'Cargar configuración inicial (282 camisetas)' : undefined}
                      onAction={isAdmin ? handleInitDefault : undefined}
                    />
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    {/* Nombre de la Talla */}
                    <td className="p-3.5 whitespace-nowrap font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {item.size.slice(0, 2)}
                        </span>
                        <span>{item.size}</span>
                      </div>
                    </td>

                    {/* Cantidad Inicial */}
                    <td className="p-3.5 whitespace-nowrap text-center font-mono font-bold text-foreground">
                      {item.initialQuantity}
                    </td>

                    {/* Camisetas Entregadas */}
                    <td className="p-3.5 whitespace-nowrap text-center font-mono font-bold text-emerald-400">
                      {item.deliveredQuantity}
                    </td>

                    {/* Camisetas Disponibles */}
                    <td className="p-3.5 whitespace-nowrap text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-xs font-black ${
                          item.isOutOfStock
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : item.isLowStock
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {item.availableQuantity}
                      </span>
                    </td>

                    {/* Pendientes de Entrega */}
                    <td className="p-3.5 whitespace-nowrap text-center font-mono text-xs">
                      {item.pendingDelivery > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 font-bold">
                          {item.pendingDelivery}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Estado Activo / Inactivo */}
                    <td className="p-3.5 whitespace-nowrap text-center">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className="cursor-pointer inline-flex items-center gap-1"
                          title={item.isActive ? 'Desactivar talla' : 'Activar talla'}
                        >
                          {item.isActive ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Activa
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                              Inactiva
                            </span>
                          )}
                        </button>
                      ) : item.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                          Inactiva
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    {isAdmin && (
                      <td className="p-3.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setEditQuantity(item.initialQuantity);
                              setEditActive(item.isActive);
                            }}
                            className="p-1.5 rounded-lg bg-background hover:bg-muted border border-border text-foreground transition-colors cursor-pointer"
                            title="Modificar cantidad"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-primary" />
                          </button>

                          {item.deliveredQuantity === 0 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 rounded-lg bg-background hover:bg-rose-500/10 border border-border hover:border-rose-500/30 text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                              title="Eliminar talla (solo sin entregas)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Agregar Nueva Talla */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-foreground text-sm">Agregar Talla al Inventario</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSize} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase font-mono mb-1">
                  Nombre de la Talla
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Medium (M), XL, Size 16, 3XL..."
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase font-mono mb-1">
                  Cantidad Inicial de Camisetas
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={newSizeQuantity}
                  onChange={(e) => setNewSizeQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAdd || !newSizeName.trim()}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingAdd ? 'Guardando...' : 'Guardar Talla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Talla Existente */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-foreground text-sm">Modificar Existencias — {editingItem.size}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase font-mono mb-1">
                  Cantidad Inicial Asignada
                </label>
                <input
                  type="number"
                  required
                  min={editingItem.deliveredQuantity}
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Mínimo permitido: <strong>{editingItem.deliveredQuantity}</strong> (unidades ya entregadas a participantes).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-background border border-border space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Entregadas actualmente:</span>
                  <span className="font-mono font-bold text-emerald-400">{editingItem.deliveredQuantity}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Nueva disponibilidad resultante:</span>
                  <span className="font-mono font-bold text-primary">
                    {Math.max(0, editQuantity - editingItem.deliveredQuantity)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-border bg-background"
                  />
                  <span>Talla activa en la selección de check-in</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? 'Actualizando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
