import React, { useState, useEffect } from 'react';
import { communicationsService } from '../../services/communications.service';
import { EmailTemplate } from '../../types';
import {
  X,
  Mail,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Info,
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
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('DIGITAL_TICKET');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string; simulated?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen && eventId) {
      loadTemplates();
      setResultMessage(null);
      setShowPreview(false);
    }
  }, [isOpen, eventId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await communicationsService.getTemplates(eventId);
      setTemplates(data);
      // Seleccionar DIGITAL_TICKET o la primera
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSending(true);
      setResultMessage(null);
      const res = await communicationsService.sendSingleEmail({
        registrationId,
        templateCode: selectedTemplateCode,
        customSubject: subject,
        customBodyHtml: bodyHtml,
      });

      setResultMessage({
        type: 'success',
        text: res.message,
        simulated: res.status === 'SIMULATED',
      });

      if (onSent) onSent();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Error al procesar el envío de correo',
      });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
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

          {resultMessage && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
                resultMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              }`}
            >
              {resultMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{resultMessage.text}</p>
                {resultMessage.simulated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Nota de protección: El correo fue simulado y registrado en el historial sin emitir llamadas externas para preservar datos de prueba.
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
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showPreview ? 'Ocultar Vista Previa' : 'Ver Vista Previa'}</span>
                </button>
              </div>

              {showPreview ? (
                <div className="p-4 rounded-xl bg-background border border-border max-h-56 overflow-y-auto">
                  <p className="text-xs font-bold text-muted-foreground mb-2">Vista previa renderizada:</p>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-xs"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
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
                <span>Variables disponibles: {'{{nombre_completo}}'}, {'{{numero_registro}}'}, {'{{nombre_evento}}'}, {'{{lugar_evento}}'}, {'{{tipo_entrada}}'}, {'{{qr_token}}'}.</span>
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
              disabled={sending || !subject.trim() || !bodyHtml.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Procesando envío...' : 'Enviar Correo Ahora'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
