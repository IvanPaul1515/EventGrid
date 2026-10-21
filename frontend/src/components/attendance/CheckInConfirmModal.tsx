import React, { useState } from 'react';
import { Shirt, CheckCircle2, UserCheck, AlertCircle, X } from 'lucide-react';
import { TshirtSizeSelector } from './TshirtSizeSelector';

interface CheckInConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tshirtSize: string | null) => Promise<void>;
  participantName: string;
  registrationNumber: string;
  ticketTypeName: string;
  tshirtEnabled: boolean;
  availableSizes: string[];
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
  initialTshirtSize = null,
  isLoading = false,
}) => {
  const [selectedSize, setSelectedSize] = useState<string | null>(initialTshirtSize);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    await onConfirm(selectedSize);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">Confirmar Asistencia Física</h3>
              <p className="text-[11px] text-muted-foreground font-mono">Control de Entrada (Check-in)</p>
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
        <div className="p-5 space-y-4">
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

          {/* Selector de Talla de T-shirt (si está habilitado para la edición) */}
          {tshirtEnabled ? (
            <div className="p-4 rounded-xl bg-background border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Talla de Camiseta (T-Shirt)
                  </span>
                </div>
                {selectedSize ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/20 text-primary border border-primary/30">
                    Talla: {selectedSize}
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-400 font-semibold">Pendiente / Sin talla</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Seleccione la talla entregada en la recepción física o deje pendiente si se desconoce.
              </p>
              <TshirtSizeSelector
                sizes={availableSizes}
                selectedSize={selectedSize}
                onSelect={setSelectedSize}
                disabled={isLoading}
                showSkip={true}
                label="Seleccione la talla:"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Al confirmar, se registrará la hora de llegada y el operador responsable de la entrada.
            </p>
          )}

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              La asistencia y la talla se guardarán simultáneamente en la inscripción oficial y en el historial de auditoría.
            </span>
          </div>
        </div>

        {/* Acciones del Modal */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2.5">
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
    </div>
  );
};
