import { WalletButtons } from './WalletButtons';
import React, { useState, useEffect } from 'react';
import { qrService } from '../../services/qr.service';
import { QrTicketData } from '../../types';
import {
  X,
  Printer,
  Download,
  RotateCcw,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  Tag,
} from 'lucide-react';

interface DigitalTicketModalProps {
  registrationId: string;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onQrRevoked?: () => void;
}

export const DigitalTicketModal: React.FC<DigitalTicketModalProps> = ({
  registrationId,
  isOpen,
  onClose,
  isAdmin = false,
  onQrRevoked,
}) => {
  const [ticketData, setTicketData] = useState<QrTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await qrService.getTicketQr(registrationId);
      setTicketData(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al obtener la credencial digital');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && registrationId) {
      fetchTicket();
      setRevokeSuccess(null);
    }
  }, [isOpen, registrationId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    if (!ticketData?.qrDataUrl) return;
    const regNum = ticketData?.registration?.registrationNumber || (ticketData as any)?.registrationNumber || 'ticket';
    const link = document.createElement('a');
    link.href = ticketData.qrDataUrl;
    link.download = `ticket-${regNum}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRevoke = async () => {
    if (!window.confirm('¿Está seguro de revocar este código QR? El código actual quedará invalidado y se emitirá una nueva credencial.')) {
      return;
    }
    try {
      setRevoking(true);
      await qrService.revokeQr(registrationId);
      setRevokeSuccess('Código QR revocado y regenerado exitosamente.');
      await fetchTicket();
      if (onQrRevoked) onQrRevoked();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al revocar el código QR');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 print:p-0 print:bg-white">
      <div className="relative w-full max-w-lg bg-card rounded-3xl border border-border shadow-2xl overflow-hidden print:shadow-none print:border-none print:w-full">
        {/* Cabecera del Modal (Oculta al imprimir) */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-card/60 backdrop-blur print:hidden">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-foreground text-sm tracking-tight">
              Entrada Digital Oficial & Código QR
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold">Generando entrada digital oficial...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : ticketData ? (() => {
            const ev: any = ticketData.event || (ticketData as any).ticket || {};
            const reg: any = ticketData.registration || (ticketData as any).ticket || {};
            const part: any = ticketData.participant || (ticketData as any).ticket || {};
            const evName = ev.name || ev.eventName || 'BarCamp RD 2026';
            const evVenue = ev.venue || 'PUCMM, Santiago';
            const evStartDate = ev.startDate ? new Date(ev.startDate).toLocaleDateString('es-DO', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }) : '14 de noviembre, 2026';
            const pName = part.fullName || part.participantName || 'Participante';
            const pDoc = part.documentId;
            const pInst = part.institution || part.participantInstitution;
            const rNum = reg.registrationNumber || (ticketData as any).registrationNumber || '';
            const tType = reg.ticketType || reg.ticketTypeName || 'General';
            const isCourt = Boolean(reg.isCourtesy);
            const pStatus = reg.paymentStatus;
            const isAttended = Boolean(reg.attended);
            const attAt = reg.attendedAt;


            return (
              <div className="space-y-5">
                {revokeSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2 print:hidden">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{revokeSuccess}</span>
                  </div>
                )}

                {/* TICKET CARD (Diseño Oficial BarCamp 2026) */}
                <div
                  id="printable-ticket"
                  className="bg-card rounded-3xl border border-border p-6 shadow-xl relative overflow-hidden print:border-black print:text-black print:bg-white"
                >
                  {/* Franja de Color Superior con Degradado Oficial BarCamp */}
                  <div className="absolute top-0 left-0 right-0 h-2.5 bg-primary print:bg-black" style={{backgroundColor:(ticketData as any).ticket?.primaryColor||'var(--primary)'}} />

                  {/* Encabezado del Evento con Logo Oficial */}
                  <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4 pt-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/25">
                          Credencial Digital BarCamp RD
                        </span>
                      </div>
                      <h2 className="text-xl font-display font-black text-foreground tracking-tight">
                        {evName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          {evVenue}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                          {evStartDate}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-center p-1">
                      <img
                        src="/barcamp-logo-extended.svg"
                        alt="BarCamp 2026"
                        className="h-9 w-auto object-contain on-dark-only print:hidden"
                      />
                      <img
                        src="/barcamp-logo-extended-on-light.svg"
                        alt="BarCamp 2026"
                        className="h-9 w-auto object-contain on-light-only print:block"
                      />
                    </div>
                  </div>

                  {/* Información del Participante y Entrada */}
                  <div className="py-4 grid grid-cols-2 gap-4 border-b border-border/80">
                    <div>
                      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                        Participante
                      </p>
                      <p className="text-sm font-bold font-display text-foreground mt-0.5 truncate">
                        {pName}
                      </p>
                      {pDoc && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          Doc: {pDoc}
                        </p>
                      )}
                      {pInst && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium">
                          {pInst}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                        No. Registro & Tipo
                      </p>
                      <p className="text-sm font-black font-mono text-primary mt-0.5">
                        {rNum}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-muted text-foreground border border-border">
                          {tType}
                        </span>
                        {isCourt ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            Cortesía
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {pStatus === 'PAID' ? 'Pagado' : 'Pendiente'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Código QR Central con Canvas Blanco Nítido para Escaneo Rápido */}
                  <div className="py-5 flex flex-col items-center justify-center bg-muted/20 rounded-2xl my-4 border border-dashed border-border/70">
                    <div className="p-3.5 bg-white rounded-2xl shadow-lg border border-zinc-200">
                      <img
                        src={ticketData.qrDataUrl}
                        alt="Código QR de Entrada"
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center mt-1 max-w-xs">
                      Presenta este QR en la recepción del evento.
                    </p>
                  </div>

                  {/* Estado de Asistencia */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                    <span className="text-muted-foreground font-medium">Estado de llegada:</span>
                    {isAttended ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Asistencia Confirmada ({attAt ? new Date(attAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : ''})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-semibold text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Pendiente de check-in
                      </span>
                    )}
                  </div>
                </div>

                {/* Botones de Acción (Ocultos al imprimir) */}
                <div className="space-y-3 print:hidden">
                  <WalletButtons registrationId={registrationId} revision={ticketData.generatedAt} />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handlePrint}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-foreground text-background font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-md"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Imprimir Entrada</span>
                    </button>

                    <button
                      onClick={handleDownloadPng}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-muted text-foreground font-bold text-xs hover:bg-muted/80 border border-border transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Descargar QR (PNG)</span>
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="pt-2 border-t border-border">
                      <button
                        onClick={handleRevoke}
                        disabled={revoking}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-2xl text-primary hover:bg-primary/10 border border-primary/25 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${revoking ? 'animate-spin' : ''}`} />
                        <span>{revoking ? 'Revocando credencial...' : 'Revocar y Regenerar Código QR'}</span>
                      </button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1.5 font-mono">
                        Acción administrativa: Si el código QR se extravió o fue comprometido, quedará invalidado de inmediato.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })() : null}
        </div>
      </div>
    </div>
  );
};
