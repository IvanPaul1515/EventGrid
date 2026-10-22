import React, { useState } from 'react';
import { X, DollarSign, Loader2, CreditCard } from 'lucide-react';
import { Sponsor, SponsorPaymentMethod } from '../../types';
import { CreatePaymentData } from '../../services/sponsors.service';

interface RecordSponsorPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sponsor: Sponsor | null;
  onConfirm: (sponsorId: string, data: CreatePaymentData) => Promise<void>;
}

export const RecordSponsorPaymentModal: React.FC<RecordSponsorPaymentModalProps> = ({
  isOpen,
  onClose,
  sponsor,
  onConfirm,
}) => {
  if (!isOpen || !sponsor) return null;

  const [amount, setAmount] = useState<number | string>(
    sponsor.pendingBalance > 0 ? sponsor.pendingBalance : ''
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] = useState<SponsorPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatRD = (val: number) =>
    new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(val);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('El monto a abonar debe ser mayor a RD$ 0.00');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onConfirm(sponsor.id, {
        amount: numAmount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        reference: reference.trim() || null,
        receiptNumber: receiptNumber.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <DollarSign className="w-5 h-5 shrink-0" />
            <span>Registrar Pago / Abono de Patrocinio</span>
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

        {/* Sponsor Context Banner */}
        <div className="mt-4 p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Patrocinador</div>
            <div className="text-sm font-bold text-foreground">{sponsor.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-medium">Balance Pendiente</div>
            <div className="text-sm font-black text-rose-400">
              {formatRD(sponsor.pendingBalance)}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Monto y botón saldo total */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-muted-foreground">
                Monto del Pago (RD$) <span className="text-rose-500">*</span>
              </label>
              {sponsor.pendingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(sponsor.pendingBalance)}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Pagar balance total ({formatRD(sponsor.pendingBalance)})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">RD$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-12 pr-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none font-bold text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fecha de Pago */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Fecha del Pago <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>

            {/* Método de Pago */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Método de Pago <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SponsorPaymentMethod)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground cursor-pointer"
                disabled={loading}
              >
                <option value="TRANSFER">Transferencia Bancaria</option>
                <option value="CHECK">Cheque</option>
                <option value="CASH">Efectivo</option>
                <option value="CREDIT_CARD">Tarjeta de Crédito</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Referencia bancaria */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Referencia Bancaria / Transacción
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej. TRANS-981245"
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>

            {/* No. de Recibo o Comprobante */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                No. Recibo / Comprobante
              </label>
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Ej. REC-0042"
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Notas o Detalles del Pago
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles adicionales, banco emisor, acuerdos de facturación..."
              className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground resize-none"
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
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Registrar Pago</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
