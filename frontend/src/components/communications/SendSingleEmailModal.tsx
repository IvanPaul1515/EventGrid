import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { communicationsService } from '../../services/communications.service';
import { useEdition } from '../../context/EditionContext';
import { EmailTemplate } from '../../types';
import {
  X,
  Mail,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Radio,
} from 'lucide-react';

interface SendSingleEmailModalProps {
  registrationId: string;
  recipientName: string;
  recipientEmail: string;
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export const SendSingleEmailModal: React.FC<SendSingleEmailModalProps> = ({
  registrationId,
  recipientName,
  recipientEmail,
  eventId,
  isOpen,
  onClose,
  onSent,
}) => {
  const { currentEvent } = useEdition();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('DIGITAL_TICKET');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'REAL' | 'SIMULATION'>('REAL');
  const [confirmedDemoSending, setConfirmedDemoSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string; simulated?: boolean } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    previousSentAt?: string;
    previousStatus?: string;
  } | null>(null);
  const [resendReason, setResendReason] = useState('Reenvío autorizado expresamente');

  const isDemoActive = Boolean(currentEvent?.settings?.demoModeEnabled);

  useEffect(() => {
    if (isOpen && eventId) {
      loadTemplates();
      setResultMessage(null);
      setShowPreview(false);
      setConfirmedDemoSending(false);
      setDuplicateWarning(null);
    }
  }, [isOpen, eventId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await communicationsService.getTemplates(eventId);
      setTemplates(data);
      const initial = data.find((t) => t.code === 'DIGITAL_TICKET') || data[0];
      if (initial) {
        setSelectedTemplateCode(initial.code);
        setSubject(initial.subject);
        setBodyHtml(initial.bodyHtml);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (code: string) => {
    setSelectedTemplateCode(code);
    const tmpl = templates.find((t) => t.code === code);
    if (tmpl) {
      setSubject(tmpl.subject);
      setBodyHtml(tmpl.bodyHtml);
    }
  };

  const handleTogglePreview = async () => {
    if (!showPreview) {
      try {
        const preview = await communicationsService.previewEmail({
          eventId,
          registrationId,
          templateCode: selectedTemplateCode,
          customSubject: subject,
          customBodyHtml: bodyHtml,
        });
        setPreviewHtml(preview.html);
      } catch {
        setPreviewHtml(bodyHtml);
      }
    }
    setShowPreview(!showPreview);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deliveryMode === 'REAL' && isDemoActive && !confirmedDemoSending) {
      setResultMessage({
        type: 'error',
        text: 'Debe confirmar explícitamente el envío real en modo demostración.',
      });
      return;
    }

    try {
      setSending(true);
      setResultMessage(null);
      const res = await communicationsService.sendSingleEmail({
        eventId,
        registrationId,
        templateCode: selectedTemplateCode,
        customSubject: subject,
        customBodyHtml: bodyHtml,
        mode: deliveryMode,
        simulateOnly: deliveryMode === 'SIMULATION',
        confirmedDemoSending,
      });

      setResultMessage({
        type: 'success',
        text: res.message,
        simulated: res.status === 'SIMULATED',
      });
      setDuplicateWarning(null);

      if (onSent) onSent();
    } catch (err: any) {
      const isDuplicate =
        err?.response?.data?.details?.code === 'DUPLICATE_COMMUNICATION_WARNING' ||
        err?.response?.data?.message?.includes('¿Deseas reenviarlo?');

      if (isDuplicate) {
        setDuplicateWarning({
          message: err?.response?.data?.message || 'Este participante ya recibió un envío de este tipo.',
          previousSentAt: err?.response?.data?.details?.previousSentAt,
          previousStatus: err?.response?.data?.details?.previousStatus,
        });
      } else {
        setResultMessage({
          type: 'error',
          text: err?.response?.data?.message || 'Error al procesar el envío de correo',
        });
      }
    } finally {
      setSending(false);
    }
  };

  const handleExecuteResend = async () => {
    try {
      setSending(true);
      setResultMessage(null);
      const res = await communicationsService.sendSingleEmail({
        eventId,
        registrationId,
        templateCode: selectedTemplateCode,
        customSubject: subject,
        customBodyHtml: bodyHtml,
        mode: deliveryMode,
        simulateOnly: deliveryMode === 'SIMULATION',
        confirmedDemoSending,
        forceResend: true,
        confirmedResend: true,
        resendReason,
      });

      setResultMessage({
        type: 'success',
        text: res.message,
        simulated: res.status === 'SIMULATED',
      });
      setDuplicateWarning(null);
      if (onSent) onSent();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Error al autorizar el reenvío',
      });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Enviar Comunicación Individual</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-3.5 rounded-xl bg-background border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Destinatario:</span>
              <p className="text-sm font-bold text-foreground">{recipientName}</p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Correo:</span>
              <p className="text-xs font-mono text-primary">{recipientEmail}</p>
            </div>
          </div>

          {/* Selector de Modo de Envío: Real vs Simulado */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
              Modo de Entrega
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  deliveryMode === 'REAL'
                    ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryMode"
                  value="REAL"
                  checked={deliveryMode === 'REAL'}
                  onChange={() => setDeliveryMode('REAL')}
                  className="mt-0.5 text-primary focus:ring-primary"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-bold text-xs text-foreground">Enviar Correo Real (SMTP)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Entrega real y directa al servidor del destinatario mediante SMTP configurado.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  deliveryMode === 'SIMULATION'
                    ? 'bg-amber-500/10 border-amber-500 text-foreground ring-1 ring-amber-500'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryMode"
                  value="SIMULATION"
                  checked={deliveryMode === 'SIMULATION'}
                  onChange={() => setDeliveryMode('SIMULATION')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-bold text-xs text-foreground">Simular Envío (Prueba)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Registra la trazabilidad y log como SIMULATED sin realizar llamadas SMTP externas.
                  </p>
                </div>
              </label>
            </div>

            {/* Advertencia y confirmación si está en modo demo y se elige envío real */}
            {deliveryMode === 'REAL' && isDemoActive && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">
                    <strong>Atención:</strong> La edición está en <strong>Modo Demostración</strong>. Al enviar un correo real, este saldrá efectivamente al buzón externo de <strong>{recipientEmail}</strong>.
                  </p>
                </div>
                <label className="flex items-center gap-2 pt-1 border-t border-amber-500/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmedDemoSending}
                    onChange={(e) => setConfirmedDemoSending(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 bg-background border-border"
                  />
                  <span className="text-xs font-bold text-foreground">
                    Confirmo que deseo enviar este correo real externamente aun en modo demo
                  </span>
                </label>
              </div>
            )}
          </div>

          {resultMessage && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
                resultMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              {resultMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              )}
              <div>
                <p className="font-semibold">{resultMessage.text}</p>
                {resultMessage.simulated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Nota: El correo fue simulado y registrado en el historial sin emitir llamadas externas.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Plantilla de Correo
              </label>
              <select
                value={selectedTemplateCode}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Asunto del Correo
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Contenido HTML del Mensaje
                </label>
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showPreview ? 'Editar HTML' : 'Ver Vista Previa Real'}</span>
                </button>
              </div>

              {showPreview ? (
                <div className="p-3 rounded-xl bg-background border border-border">
                  <p className="text-[11px] font-bold text-muted-foreground mb-2">Vista previa en iframe aislado:</p>
                  <iframe
                    title="Vista previa del correo"
                    sandbox="allow-same-origin"
                    srcDoc={previewHtml}
                    className="w-full h-64 border border-border rounded-lg bg-white"
                  />
                </div>
              ) : (
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  rows={7}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                <span>Variables soportadas: {'{{participantName}}'}, {'{{registrationNumber}}'}, {'{{eventName}}'}, {'{{eventVenue}}'}, {'{{ticketType}}'}, {'{{qrUrl}}'}, {'{{amountPaid}}'}, {'{{balanceDue}}'}.</span>
              </p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={
                sending ||
                !subject.trim() ||
                !bodyHtml.trim() ||
                (deliveryMode === 'REAL' && isDemoActive && !confirmedDemoSending)
              }
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Procesando envío...' : deliveryMode === 'REAL' ? 'Enviar Correo Real' : 'Simular Envío'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};