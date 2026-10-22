import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { SponsorPayment } from '../../types';

interface AnnullPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: SponsorPayment | null;
  sponsorName: string;
  onConfirm: (paymentId: string, reason: string) => Promise<void>;
}

export const AnnullPaymentModal: React.FC<AnnullPaymentModalProps> = ({
  isOpen,
  onClose,
  payment,
  sponsorName,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Debe especificar un motivo válido de anulación (mínimo 3 caracteres)');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onConfirm(payment.id, reason.trim());
      setReason('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al anular el pago');
    } finally {
      setLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(payment.amount);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Anular Pago de Patrocinio</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            <p className="font-semibold mb-1">Advertencia de trazabilidad financiera</p>
            <p>
              Esta acción anulará el pago de <strong className="text-white">{formattedAmount}</strong> registrado a favor de <strong className="text-white">{sponsorName}</strong>. El pago quedará archivado como anulado y el balance pendiente se recalculará automáticamente.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Motivo de anulación <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Cheque rebotado por falta de fondos, error en digitación de monto..."
              className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none text-foreground resize-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || reason.trim().length < 3}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirmar Anulación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
