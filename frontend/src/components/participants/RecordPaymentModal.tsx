import { createPortal } from 'react-dom';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useState } from 'react';
import { PaymentMethod } from '../../types';
import { CreditCard, X, DollarSign } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, paymentMethodId: string, notes?: string) => Promise<void>;
  participantName: string;
  registrationNumber: string;
  balanceDue: number;
  paymentMethods: PaymentMethod[];
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  participantName,
  registrationNumber,
  balanceDue,
  paymentMethods,
}) => {
  const [amount, setAmount] = useState<number>(balanceDue > 0 ? balanceDue : 0);
  const [paymentMethodId, setPaymentMethodId] = useState<string>(paymentMethods[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('El monto a abonar debe ser mayor a RD$ 0.00');
      return;
    }
    if (!paymentMethodId) {
      setError('Debe seleccionar el método de pago');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onConfirm(amount, paymentMethodId, notes.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="mobile-safe-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <DollarSign className="w-5 h-5 shrink-0" />
            <span>Registrar Abono / Pago Adicional</span>
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
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Participante
                </span>
                <span className="text-xs font-bold text-foreground">{participantName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Ticket
                </span>
                <span className="font-mono text-xs font-bold text-primary">{registrationNumber}</span>
              </div>
            </div>
            {balanceDue > 0 && (
              <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-semibold">Balance Pendiente:</span>
                <span className="font-mono font-bold text-amber-400">RD$ {balanceDue.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Monto a Abonar (RD$) *
            </label>
            <CurrencyInput
              step="0.01"
              min="1"
              value={amount}
              onValueChange={setAmount}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Método de Pago *
            </label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {paymentMethods
                .filter((pm) => !pm.name.toLowerCase().includes('cortes'))
                .map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Notas / Referencia de Pago (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej. No. comprobante fiscal, transferencia #8921"
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">{error}</div>}

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
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Aplicar Abono</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
};
