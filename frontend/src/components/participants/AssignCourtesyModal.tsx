import React, { useState } from 'react';
import { Tag, X, Award } from 'lucide-react';

interface AssignCourtesyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (authorizedBy: string, reason: string) => Promise<void>;
  participantName: string;
  registrationNumber: string;
}

export const AssignCourtesyModal: React.FC<AssignCourtesyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  participantName,
  registrationNumber,
}) => {
  const [authorizedBy, setAuthorizedBy] = useState('Comité Directivo BarCamp RD');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizedBy.trim()) {
      setError('Debe indicar quién autoriza la cortesía');
      return;
    }
    if (!reason.trim()) {
      setError('Debe indicar el motivo o justificación de la cortesía');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onConfirm(authorizedBy.trim(), reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al asignar la cortesía');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Award className="w-5 h-5 shrink-0" />
            <span>Asignar Cortesía Oficial</span>
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
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider block opacity-75">
                  Participante
                </span>
                <span className="text-xs font-bold text-foreground">{participantName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono tracking-wider block opacity-75">
                  Ticket
                </span>
                <span className="font-mono text-xs font-bold text-amber-400">{registrationNumber}</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-300 mt-2 border-t border-amber-500/20 pt-1.5 leading-relaxed">
              Al otorgar cortesía, el precio y el balance pendiente se fijarán en <strong>RD$ 0.00</strong> y no computarán en la recaudación del evento.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Autorizado Por *
            </label>
            <input
              type="text"
              value={authorizedBy}
              onChange={(e) => setAuthorizedBy(e.target.value)}
              required
              placeholder="ej. Dirección BarCamp RD, Decanato PUCMM"
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Motivo o Justificación *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="ej. Ponente del track de Desarrollo Web, Beca patrocinador ITLA..."
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Tag className="w-3.5 h-3.5" />
                  <span>Confirmar Cortesía</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
