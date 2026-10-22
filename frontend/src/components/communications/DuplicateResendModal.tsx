import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock, Mail, User, History, RefreshCw, X, AlertCircle } from 'lucide-react';
import { formatEmailStatus, formatTemplateName } from '../../utils/emailFormatters';

export interface DuplicateResendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmResend: (reason?: string) => void | Promise<void>;
  onViewHistory?: () => void;
  participantName: string;
  recipientEmail: string;
  templateCode?: string;
  templateName?: string;
  previousSentAt?: string | Date | null;
  previousStatus?: string | null;
  isLoading?: boolean;
}

export const DuplicateResendModal: React.FC<DuplicateResendModalProps> = ({
  isOpen,
  onClose,
  onConfirmResend,
  onViewHistory,
  participantName,
  recipientEmail,
  templateCode,
  templateName,
  previousSentAt,
  previousStatus,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const statusInfo = formatEmailStatus(previousStatus);
  const displayType = templateName || formatTemplateName(templateCode);

  const formattedDate = previousSentAt
    ? new Date(previousSentAt).toLocaleString('es-DO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Fecha no registrada';

  const isUnknown = previousStatus === 'UNKNOWN_DELIVERY_STATUS';
  const isFailure = previousStatus === 'FAILED' || previousStatus === 'REJECTED';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-amber-500/10 dark:bg-amber-500/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">
                Este correo ya fue enviado anteriormente
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Control de duplicados de EventGrid
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">Participante:</span>
              </div>
              <span className="font-bold text-foreground text-right">{participantName || 'Sin nombre'}</span>
            </div>

            <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">Correo:</span>
              </div>
              <span className="font-mono text-foreground text-right">{recipientEmail}</span>
            </div>

            <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium">Tipo:</span>
              </div>
              <span className="font-semibold text-primary text-right">{displayType}</span>
            </div>

            <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">Último envío:</span>
              </div>
              <span className="font-mono text-foreground text-right">{formattedDate}</span>
            </div>

            <div className="flex items-start justify-between gap-3 pt-0.5">
              <span className="font-medium text-muted-foreground">Estado:</span>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${statusInfo.badgeClass}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>

          {/* Explicación del estado */}
          <div className="p-3 rounded-xl bg-background border border-border text-xs space-y-1">
            <p className="text-muted-foreground leading-relaxed">
              {statusInfo.description}
            </p>
            {isUnknown && (
              <p className="text-[11px] text-amber-500 font-semibold flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Advertencia: El mensaje podría haber llegado al destinatario.</span>
              </p>
            )}
            {isFailure && (
              <p className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1 mt-1">
                <span>El envío anterior falló; es seguro reintentarlo.</span>
              </p>
            )}
          </div>

          <div className="pt-1">
            <p className="text-xs font-bold text-foreground text-center">
              ¿Deseas volver a enviarlo?
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {onViewHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewHistory();
                }}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 border border-border flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <History className="w-3.5 h-3.5 text-primary" />
                <span>Ver historial</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onConfirmResend('Reenvío autorizado expresamente')}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Reenviando...' : 'Sí, reenviar correo'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
