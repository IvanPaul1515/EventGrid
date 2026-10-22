import React from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, User, Clock, ShieldCheck, AlertCircle, FileText, Send } from 'lucide-react';
import { EmailLog } from '../../types';
import { formatEmailStatus, formatTemplateName } from '../../utils/emailFormatters';

interface EmailDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: EmailLog | null;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  isOpen,
  onClose,
  email,
}) => {
  if (!isOpen || !email) return null;

  const statusInfo = formatEmailStatus(email.status);
  const templateName = formatTemplateName(email.templateCode);

  const formattedDate = email.sentAt
    ? new Date(email.sentAt).toLocaleString('es-DO', {
        dateStyle: 'full',
        timeStyle: 'medium',
      })
    : 'No registrada';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Mail className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">
                Detalle de Comunicación
              </h3>
              <p className="text-[11px] text-muted-foreground font-mono">
                ID: {email.id.slice(0, 16)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Tarjeta de Estado Principal */}
          <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Estado Actual del Correo
              </span>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${statusInfo.badgeClass}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {statusInfo.description}
            </p>
          </div>

          {/* Información del Destinatario */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-primary" />
              <span>Destinatario y Participante</span>
            </h4>
            <div className="rounded-xl border border-border/70 p-3 space-y-1.5 text-xs bg-background">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre:</span>
                <span className="font-bold text-foreground">{email.recipientName || 'Sin nombre registrado'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Correo:</span>
                <span className="font-mono text-foreground font-medium">{email.recipientEmail}</span>
              </div>
              {email.registration?.registrationNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ticket / Registro:</span>
                  <span className="font-mono text-primary font-bold">{email.registration.registrationNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Asunto y Contenido */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Contenido y Plantilla</span>
            </h4>
            <div className="rounded-xl border border-border/70 p-3 space-y-2 text-xs bg-background">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tipo de mensaje:</span>
                <span className="font-bold text-primary">{templateName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px] mb-0.5">Asunto:</span>
                <p className="font-semibold text-foreground bg-muted/40 p-2 rounded-lg border border-border/50 text-xs">
                  {email.subject}
                </p>
              </div>
            </div>
          </div>

          {/* Trazabilidad y Operación */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Trazabilidad del Envío</span>
            </h4>
            <div className="rounded-xl border border-border/70 p-3 space-y-1.5 text-xs bg-background">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha del intento:</span>
                <span className="font-mono text-foreground">{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Canal de emisión:</span>
                <span className="font-semibold text-foreground">
                  {email.batchId ? `Campaña Masiva (${email.batchId.slice(0, 10)}...)` : 'Envío Individual'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Autorizado por:</span>
                <span className="font-semibold text-foreground">
                  {email.sentByUser?.fullName || 'Sistema Automatizado'}
                </span>
              </div>
            </div>
          </div>

          {/* Error del proveedor si existe */}
          {email.errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Respuesta / Error del Proveedor:</span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed break-all">
                {email.errorMessage}
              </p>
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex justify-end p-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
