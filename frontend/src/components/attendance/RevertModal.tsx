import React, { useState } from 'react';
import { Registration } from '../../types';
import { AlertTriangle, X, Undo2 } from 'lucide-react';

interface RevertModalProps {
  registration: Registration | null;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export const RevertModal: React.FC<RevertModalProps> = ({
  registration,
  isOpen,
  loading,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !registration) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Debe especificar un motivo justificado (mínimo 3 caracteres)');
      return;
    }
    setError(null);
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Revertir Asistencia Registrada</span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Está a punto de anular la asistencia de{' '}
            <strong className="text-foreground">{registration.participant.fullName}</strong> (Ticket{' '}
            <span className="font-mono text-primary font-bold">{registration.registrationNumber}</span>).
            El estado de la persona regresará a <strong className="text-amber-400">«No ha llegado»</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Motivo de la Reversión *
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="ej. Marcado por error involuntario en mesa de recepción, homónimo verificado..."
              required
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {error && <span className="text-[11px] text-rose-400 mt-1 block">{error}</span>}
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border/80 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground block mb-0.5">Auditoría Requerida:</span>
            Esta corrección quedará registrada permanentemente con su nombre de usuario, rol de administrador y fecha exacta.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Confirmar Reversión</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
