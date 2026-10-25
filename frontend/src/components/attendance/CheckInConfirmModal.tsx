import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shirt, CheckCircle2, UserCheck, AlertTriangle, AlertCircle, X, Package, Check } from 'lucide-react';
import { TshirtSizeSelector } from './TshirtSizeSelector';
import { inventoryService, TshirtInventoryItem } from '../../services/inventory.service';

const DEFAULT_BARCAMP_TSHIRT_SIZES = [
  'Medium (M)',
  'XL',
  'L',
  '2XL',
  'Size 16',
  'Size 12',
  'Size 14',
  'S',
];

interface CheckInConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tshirtSize: string | null, tshirtDelivered: boolean) => Promise<void>;
  participantName: string;
  registrationNumber: string;
  ticketTypeName: string;
  tshirtEnabled: boolean;
  availableSizes?: string[] | string | null;
  eventId?: string;
  initialTshirtSize?: string | null;
  isLoading?: boolean;
}

export const CheckInConfirmModal: React.FC<CheckInConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  participantName,
  registrationNumber,
  ticketTypeName,
  tshirtEnabled,
  availableSizes,
  eventId,
  initialTshirtSize = null,
  isLoading = false,
}) => {
  const [selectedSize, setSelectedSize] = useState<string | null>(initialTshirtSize);
  const [deliverTshirt, setDeliverTshirt] = useState<boolean>(true);
  const [inventoryItems, setInventoryItems] = useState<TshirtInventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Cargar existencias en tiempo real de la edición
  useEffect(() => {
    let active = true;
    if (isOpen && tshirtEnabled) {
      setLoadingInventory(true);
      inventoryService
        .getInventory(eventId)
        .then((res) => {
          if (active) setInventoryItems(res.items);
        })
        .catch((err) => {
          console.error('Error al cargar existencias de inventario:', err);
        })
        .finally(() => {
          if (active) setLoadingInventory(false);
        });
    }
    return () => { active = false; };
  }, [isOpen, tshirtEnabled, eventId, registrationNumber]);

  // Mapa de disponibilidad por talla
  const stockMap: Record<string, number> = {};
  for (const item of inventoryItems) {
    if (item.isActive !== false) stockMap[item.size] = item.availableQuantity;
  }

  const currentAvailable = selectedSize ? (stockMap[selectedSize] ?? 0) : 0;
  const isSelectedOutOfStock = selectedSize ? currentAvailable <= 0 : false;

  useEffect(() => { if (isOpen) { setSelectedSize(initialTshirtSize); setDeliverTshirt(true); setInventoryItems([]); } }, [isOpen, registrationNumber, eventId]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const finalDelivered = Boolean(selectedSize && !loadingInventory && !isSelectedOutOfStock && deliverTshirt);
    await onConfirm(selectedSize, finalDelivered);
  };

  // Normalizar availableSizes de forma segura (soporta array, JSON string o fallback)
  let normalizedAvailableSizes: string[] = [];
  if (Array.isArray(availableSizes)) {
    normalizedAvailableSizes = availableSizes;
  } else if (typeof availableSizes === 'string') {
    try {
      const parsed = JSON.parse(availableSizes);
      if (Array.isArray(parsed)) {
        normalizedAvailableSizes = parsed;
      }
    } catch {
      normalizedAvailableSizes = [];
    }
  }

  if (normalizedAvailableSizes.length === 0) {
    normalizedAvailableSizes = DEFAULT_BARCAMP_TSHIRT_SIZES;
  }

  // Si hay inventario cargado, priorizar las tallas activas del inventario
  const sizesToDisplay: string[] =
    inventoryItems.length > 0
      ? inventoryItems.filter((i) => i.isActive).map((i) => i.size)
      : normalizedAvailableSizes;

  return createPortal(
    <div className="mobile-safe-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] max-sm:max-h-full bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-label="Confirmar asistencia">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">Confirmar Asistencia Física</h3>
              <p className="text-[11px] text-muted-foreground font-mono">Control de Entrada & Entrega de T-shirt</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 max-h-[80vh] min-h-0 overflow-y-auto">
          {/* Ficha Resumida del Participante */}
          <div className="p-3.5 rounded-xl bg-background border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-white">
                {registrationNumber}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {ticketTypeName}
              </span>
            </div>
            <h4 className="text-base font-bold text-foreground truncate">{participantName}</h4>
          </div>

          {/* Selector de Talla de T-shirt */}
          {tshirtEnabled ? (
            <div className="p-4 rounded-xl bg-background border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Tamaño de T-Shirt
                  </span>
                </div>
                {selectedSize ? (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isSelectedOutOfStock
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-primary/20 text-primary border border-primary/30'
                    }`}
                  >
                    Talla: {selectedSize} ({isSelectedOutOfStock ? 'Agotada' : `${currentAvailable} disp.`})
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-400 font-semibold">Sin registrar / Pendiente</span>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Seleccione el tamaño solicitado por el participante.
              </p>

              {/* Selector de Tallas con indicador de disponibilidad */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(sizesToDisplay) ? sizesToDisplay : DEFAULT_BARCAMP_TSHIRT_SIZES).map((size) => {
                    const avail = stockMap[size];
                    const outOfStock = avail !== undefined && avail <= 0;
                    const isSelected = selectedSize === size;

                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={isLoading}
                        onClick={() => setSelectedSize(isSelected ? null : size)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? outOfStock
                              ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                              : 'bg-primary text-white border-primary shadow-md'
                            : outOfStock
                            ? 'bg-rose-500/10 text-rose-400/80 border-rose-500/20 hover:border-rose-500/40'
                            : 'bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted'
                        }`}
                      >
                        <span>{size}</span>
                        {avail !== undefined && (
                          <span
                            className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                              isSelected
                                ? 'bg-black/30 text-white'
                                : outOfStock
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {outOfStock ? '0' : avail}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setSelectedSize(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      selectedSize === null
                        ? 'bg-zinc-700 text-zinc-200 border-zinc-600'
                        : 'bg-transparent text-muted-foreground border-border hover:border-zinc-600'
                    }`}
                  >
                    Dejar pendiente
                  </button>
                </div>
              </div>

              {/* Alerta de Talla Agotada */}
              {selectedSize && isSelectedOutOfStock && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Talla "{selectedSize}" agotada en inventario</span>
                    <p className="text-[11px] text-rose-300 mt-0.5">
                      No hay existencias para entregar en este momento. La asistencia se confirmará y la talla quedará guardada como <strong>pendiente de entrega</strong> sin descontar inventario.
                    </p>
                  </div>
                </div>
              )}

              {/* Control de Entrega Física (Solo si hay talla y existencias) */}
              {selectedSize && !isSelectedOutOfStock && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                  <fieldset className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-2"><input type="radio" name="manual-delivery" checked={!deliverTshirt} onChange={() => setDeliverTshirt(false)} disabled={isLoading} />Registrar entrega pendiente</label>
                    <label className="flex items-center gap-2"><input type="radio" name="manual-delivery" checked={deliverTshirt} onChange={() => setDeliverTshirt(true)} disabled={isLoading} />Entregar ahora</label>
                  </fieldset>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Al confirmar, se registrará la hora de llegada física y el operador responsable.
            </p>
          )}

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {deliverTshirt && selectedSize && !isSelectedOutOfStock
                ? `Se confirmará la asistencia y se descontará 1 unidad de la talla "${selectedSize}" del inventario.`
                : selectedSize
                ? `Se confirmará la asistencia. La talla "${selectedSize}" quedará registrada como PENDIENTE de entrega.`
                : 'Se confirmará la asistencia del participante.'}
            </span>
          </div>
        </div>

        <p className="px-4 pb-3 text-xs text-amber-500">Esta operación registrará definitivamente su asistencia y no podrá deshacerse.</p>
        {/* Acciones del Modal */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2.5 shrink-0 max-sm:flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UserCheck className="w-4 h-4" />
            )}
            <span>{isLoading ? 'Registrando...' : 'Confirmar Asistencia'}</span>
          </button>
        </div>
      </div>
    </div>, document.body
  );
};
