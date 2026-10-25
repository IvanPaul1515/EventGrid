import { useRealtimeRefresh } from '../../context/RealtimeContext';
import React, { useState, useEffect, useRef } from 'react';
import { useEdition } from '../../context/EditionContext';
import { useAuth } from '../../context/AuthContext';
import {
  inventoryService,
  StaffInventoryResponse,
  StaffInventoryItem,
  StaffTshirtDeliveryRecord,
} from '../../services/inventory.service';
import {
  Users,
  Shirt,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Plus,
  Minus,
  Send,
  History,
  Info,
  X,
  PackageCheck,
  Unlock,
} from 'lucide-react';

export const StaffTshirtsTab: React.FC = () => {
  const { currentEvent } = useEdition();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StaffInventoryResponse | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados de edición de reservas por talla
  const [reserveEdits, setReserveEdits] = useState<Record<string, number>>({});
  const [savingSize, setSavingSize] = useState<string | null>(null);

  // Modal Entrega a Staff
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [deliverSize, setDeliverSize] = useState('');
  const [deliverQuantity, setDeliverQuantity] = useState(1);
  const [deliverRecipient, setDeliverRecipient] = useState('');
  const [deliverNotes, setDeliverNotes] = useState('');
  const [submittingDeliver, setSubmittingDeliver] = useState(false);

  // Modal Liberación de Reserva
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [releaseSize, setReleaseSize] = useState('');
  const [releaseQuantity, setReleaseQuantity] = useState(1);
  const [submittingRelease, setSubmittingRelease] = useState(false);

  const readVersion = useRef(0);
  const loadStaffInventory = async (silent = false) => {
    if (!currentEvent) return;
    const version = ++readVersion.current;
    try {
      if (!silent) setLoading(true);
      const res = await inventoryService.getStaffInventory(currentEvent.id);
      if (version !== readVersion.current) return;
      setData(res);
      // Inicializar valores editables de reserva
      const edits: Record<string, number> = {};
      res.items.forEach((item) => {
        edits[item.size] = item.staffReserved;
      });
      if (!silent) setReserveEdits(edits);
    } catch (err: any) {
      console.error(err);
      setFeedback({
        type: 'error',
        message: err?.response?.data?.message || 'Error al cargar inventario del staff',
      });
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadStaffInventory();
  }, [currentEvent?.id]);

  useRealtimeRefresh('inventory', () => loadStaffInventory(true));

  const showNotification = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  // Guardar reserva de una talla
  const handleSaveReserve = async (size: string) => {
    if (!currentEvent || !isAdmin) return;
    const newQty = reserveEdits[size];
    if (newQty === undefined || newQty < 0) return;

    try {
      setSavingSize(size);
      const res = await inventoryService.reserveStaffTshirts(
        { size, reservedQuantity: newQty },
        currentEvent.id
      );
      showNotification('success', res.message || `Reserva de talla ${size} actualizada a ${newQty}`);
      await loadStaffInventory();
    } catch (err: any) {
      showNotification('error', err?.response?.data?.message || 'Error al actualizar reserva');
    } finally {
      setSavingSize(null);
    }
  };

  // Abrir modal de entrega
  const handleOpenDeliver = (size?: string) => {
    if (size) {
      setDeliverSize(size);
    } else if (data?.items.length) {
      setDeliverSize(data.items[0].size);
    }
    setDeliverQuantity(1);
    setDeliverRecipient('');
    setDeliverNotes('');
    setIsDeliverModalOpen(true);
  };

  // Registrar entrega física a staff
  const handleSubmitDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent || !isAdmin || !deliverSize) return;

    try {
      setSubmittingDeliver(true);
      const res = await inventoryService.deliverStaffTshirts(
        {
          size: deliverSize,
          quantity: deliverQuantity,
          recipientName: deliverRecipient.trim() || undefined,
          notes: deliverNotes.trim() || undefined,
        },
        currentEvent.id
      );
      showNotification('success', res.message || 'Entrega a staff registrada correctamente');
      setIsDeliverModalOpen(false);
      await loadStaffInventory();
    } catch (err: any) {
      showNotification('error', err?.response?.data?.message || 'Error al registrar entrega a staff');
    } finally {
      setSubmittingDeliver(false);
    }
  };

  // Abrir modal de liberación
  const handleOpenRelease = (item: StaffInventoryItem) => {
    setReleaseSize(item.size);
    setReleaseQuantity(Math.min(1, item.staffPending));
    setIsReleaseModalOpen(true);
  };

  // Confirmar liberación
  const handleSubmitRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent || !isAdmin || !releaseSize) return;

    try {
      setSubmittingRelease(true);
      const res = await inventoryService.releaseStaffTshirts(
        {
          size: releaseSize,
          quantityToRelease: releaseQuantity,
        },
        currentEvent.id
      );
      showNotification('success', res.message || 'Camisetas liberadas correctamente hacia participantes');
      setIsReleaseModalOpen(false);
      await loadStaffInventory();
    } catch (err: any) {
      showNotification('error', err?.response?.data?.message || 'Error al liberar reserva');
    } finally {
      setSubmittingRelease(false);
    }
  };

  const summary = data?.summary || {
    total: 0,
    deliveredParticipants: 0,
    staffReserved: 0,
    staffDelivered: 0,
    staffPending: 0,
    availableForParticipants: 0,
  };

  return (
    <div className="space-y-6">
      {/* Banner de feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Regla y descripción */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary mt-0.5">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Gestión de T-shirts para Staff y Organización</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Las camisetas del staff provienen del <strong>mismo inventario físico unificado</strong>. Las reservas apartan existencias
                para el personal organizador y reducen automáticamente la disponibilidad para participantes sin duplicar el total.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => handleOpenDeliver()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-xs shrink-0 cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Registrar Entrega al Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas métricas de inventario consolidado */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">Total Físico</span>
          <span className="text-2xl font-black text-foreground mt-1 block">{summary.total}</span>
          <span className="text-[10px] text-muted-foreground">Existencias reales</span>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">Entregadas Participantes</span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">{summary.deliveredParticipants}</span>
          <span className="text-[10px] text-muted-foreground">En check-in / taquilla</span>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">Reserva Total Staff</span>
          <span className="text-2xl font-black text-blue-400 mt-1 block">{summary.staffReserved}</span>
          <span className="text-[10px] text-muted-foreground">Apartadas para el equipo</span>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">Entregadas al Staff</span>
          <span className="text-2xl font-black text-purple-400 mt-1 block">{summary.staffDelivered}</span>
          <span className="text-[10px] text-muted-foreground">Retiradas físicamente</span>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">Staff Pendientes</span>
          <span className="text-2xl font-black text-amber-400 mt-1 block">{summary.staffPending}</span>
          <span className="text-[10px] text-muted-foreground">Aún no retiradas</span>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border bg-emerald-500/5 border-emerald-500/20">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">Disp. Participantes</span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">{summary.availableForParticipants}</span>
          <span className="text-[10px] text-muted-foreground">Libres para recepción</span>
        </div>
      </div>

      {/* Tabla editable de Tallas y Reservas */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Control de Reservas y Disponibilidad por Talla</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fórmula: <code className="text-primary font-mono text-[11px]">Disponibles = Total Físico - Entregadas Participantes - Staff Pendientes - Staff Entregadas</code>
            </p>
          </div>
          <button
            onClick={() => { void loadStaffInventory(); }}
            disabled={loading}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
            title="Refrescar datos"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2.5 px-4 font-bold">Talla</th>
                <th className="py-2.5 px-4 font-bold text-center">Total Físico</th>
                <th className="py-2.5 px-4 font-bold text-center">Entregadas Participantes</th>
                <th className="py-2.5 px-4 font-bold text-center">Reserva Staff</th>
                <th className="py-2.5 px-4 font-bold text-center">Entregadas Staff</th>
                <th className="py-2.5 px-4 font-bold text-center">Staff Pendientes</th>
                <th className="py-2.5 px-4 font-bold text-center bg-emerald-500/5 text-emerald-400">Disp. Participantes</th>
                <th className="py-2.5 px-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.items && data.items.length > 0 ? (
                data.items.map((item) => {
                  const currentReserve = reserveEdits[item.size] ?? item.staffReserved;
                  const isModified = currentReserve !== item.staffReserved;
                  // Cálculo proyectado en vivo para feedback inmediato
                  const projectedStaffPending = Math.max(0, currentReserve - item.staffDelivered);
                  const projectedAvailable = Math.max(0, item.total - item.deliveredParticipants - currentReserve);

                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-muted-foreground" />
                          <span>{item.size}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium text-foreground">{item.total}</td>
                      <td className="py-3 px-4 text-center font-mono text-emerald-400">{item.deliveredParticipants}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setReserveEdits((prev) => ({
                                    ...prev,
                                    [item.size]: Math.max(item.staffDelivered, (prev[item.size] ?? item.staffReserved) - 1),
                                  }))
                                }
                                disabled={currentReserve <= item.staffDelivered}
                                className="w-6 h-6 rounded bg-muted hover:bg-muted-foreground/20 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={item.staffDelivered}
                                max={item.total - item.deliveredParticipants}
                                value={currentReserve}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setReserveEdits((prev) => ({ ...prev, [item.size]: val }));
                                }}
                                className="w-14 py-1 text-center font-mono font-bold bg-background border border-border rounded text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReserveEdits((prev) => ({
                                    ...prev,
                                    [item.size]: Math.min(
                                      item.total - item.deliveredParticipants,
                                      (prev[item.size] ?? item.staffReserved) + 1
                                    ),
                                  }))
                                }
                                disabled={currentReserve >= item.total - item.deliveredParticipants}
                                className="w-6 h-6 rounded bg-muted hover:bg-muted-foreground/20 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <span className="font-mono font-bold text-foreground">{item.staffReserved}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-purple-400 font-medium">{item.staffDelivered}</td>
                      <td className="py-3 px-4 text-center font-mono text-amber-400 font-bold">{projectedStaffPending}</td>
                      <td className="py-3 px-4 text-center font-mono font-black bg-emerald-500/5 text-emerald-400">
                        {projectedAvailable}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isModified && isAdmin && (
                            <button
                              onClick={() => handleSaveReserve(item.size)}
                              disabled={savingSize === item.size}
                              className="px-2.5 py-1 rounded bg-primary text-white text-[11px] font-bold flex items-center gap-1 hover:bg-primary/90 transition-colors cursor-pointer"
                              title="Guardar nueva reserva"
                            >
                              <Save className="w-3 h-3" />
                              <span>{savingSize === item.size ? '...' : 'Guardar'}</span>
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenDeliver(item.size)}
                                className="px-2 py-1 rounded bg-muted hover:bg-muted-foreground/20 text-[11px] font-bold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                                title="Entregar a miembro del staff"
                              >
                                <Send className="w-3 h-3 text-purple-400" />
                                <span>Entregar</span>
                              </button>
                              {item.staffPending > 0 && (
                                <button
                                  onClick={() => handleOpenRelease(item)}
                                  className="px-2 py-1 rounded bg-muted hover:bg-muted-foreground/20 text-[11px] font-bold text-muted-foreground hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Liberar reserva a participantes"
                                >
                                  <Unlock className="w-3 h-3 text-amber-400" />
                                  <span>Liberar</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                    No hay inventario configurado para esta edición.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de entregas al Staff */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Historial de Entregas Realizadas al Staff</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">Últimas 50 entregas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2.5 px-4 font-bold">Fecha / Hora</th>
                <th className="py-2.5 px-4 font-bold">Talla</th>
                <th className="py-2.5 px-4 font-bold text-center">Cantidad</th>
                <th className="py-2.5 px-4 font-bold">Receptor / Responsable</th>
                <th className="py-2.5 px-4 font-bold">Entregado Por</th>
                <th className="py-2.5 px-4 font-bold">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.recentDeliveries && data.recentDeliveries.length > 0 ? (
                data.recentDeliveries.map((del) => (
                  <tr key={del.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-muted-foreground">
                      {new Date(del.deliveredAt).toLocaleString('es-DO', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-foreground">{del.size}</td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-purple-400">+{del.quantity}</td>
                    <td className="py-2.5 px-4 text-foreground font-medium">
                      {del.recipientName || <span className="text-muted-foreground italic">Sin nombre registrado</span>}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">
                      {del.deliveredByUser?.fullName || 'Administrador'}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground italic">
                      {del.notes || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground text-xs">
                    No se han registrado entregas físicas al staff en esta edición.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Entrega al Staff */}
      {isDeliverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Registrar Entrega al Staff</h3>
              </div>
              <button
                onClick={() => setIsDeliverModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitDeliver} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Talla a Entregar</label>
                <select
                  value={deliverSize}
                  onChange={(e) => setDeliverSize(e.target.value)}
                  className="w-full py-2 px-3 bg-background border border-border rounded-xl text-xs font-bold focus:ring-1 focus:ring-primary focus:outline-hidden"
                  required
                >
                  {data?.items.map((i) => (
                    <option key={i.id} value={i.size}>
                      {i.size} (Físicas libres: {i.total - i.deliveredParticipants - i.staffDelivered}, Reserva pendiente: {i.staffPending})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Cantidad de Camisetas</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={deliverQuantity}
                  onChange={(e) => setDeliverQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full py-2 px-3 bg-background border border-border rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-primary focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Nombre del Miembro / Responsable <span className="text-muted-foreground font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="ej. Laura Sánchez (Coordinación Técnica)"
                  value={deliverRecipient}
                  onChange={(e) => setDeliverRecipient(e.target.value)}
                  className="w-full py-2 px-3 bg-background border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Observaciones / Motivo <span className="text-muted-foreground font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="ej. Entrega de camiseta para staff de apoyo"
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  className="w-full py-2 px-3 bg-background border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsDeliverModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDeliver}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingDeliver ? (
                    'Procesando...'
                  ) : (
                    <>
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Confirmar Entrega</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Liberar Reserva */}
      {isReleaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Unlock className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-foreground">Liberar Reserva a Participantes</h3>
              </div>
              <button
                onClick={() => setIsReleaseModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRelease} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Liberará camisetas de la reserva pendiente de la talla <strong>{releaseSize}</strong> para que vuelvan a estar
                disponibles para los participantes en recepción.
              </p>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Cantidad a Liberar</label>
                <input
                  type="number"
                  min="1"
                  value={releaseQuantity}
                  onChange={(e) => setReleaseQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full py-2 px-3 bg-background border border-border rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-primary focus:outline-hidden"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsReleaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRelease}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingRelease ? (
                    'Liberando...'
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Confirmar Liberación</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
