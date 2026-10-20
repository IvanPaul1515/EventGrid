import React, { useState, useEffect } from 'react';
import { qrService } from '../../services/qr.service';
import { QrTicketData } from '../../types';
import {
  X,
  Printer,
  Download,
  RotateCcw,
  ShieldAlert,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
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
      setError(err?.response?.data?.message || 'Error al obtener la entrada digital');
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
    const link = document.createElement('a');
    link.href = ticketData.qrDataUrl;
    link.download = `ticket-${ticketData.registration.registrationNumber}-qr.png`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white">
      <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden print:shadow-none print:border-none print:w-full">
        {/* Cabecera del Modal (Oculta al imprimir) */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40 print:hidden">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Entrada Digital & Código QR</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Generando entrada digital y código QR...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : ticketData ? (
            <div className="space-y-6">
              {revokeSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center gap-2 print:hidden">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{revokeSuccess}</span>
                </div>
              )}

              {/* TICKET CARD (Diseño Imprimible Profesional) */}
              <div
                id="printable-ticket"
                className="bg-background rounded-2xl border-2 border-border p-6 shadow-md relative overflow-hidden print:border-black print:text-black"
              >
                {/* Franja de Color Superior */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-primary via-barcamp-burgundy to-rose-500 print:bg-black" />

                {/* Encabezado del Evento */}
                <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4 pt-1">
                  <div>
                    <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      Entrada Oficial EventGrid
                    </span>
                    <h2 className="text-lg font-black text-foreground tracking-tight mt-1.5">
                      {ticketData.event.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        {ticketData.event.venue}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        {new Date(ticketData.event.startDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {ticketData.event.logoUrl && (
                    <img
                      src={ticketData.event.logoUrl}
                      alt={ticketData.event.name}
                      className="w-12 h-12 object-contain rounded-lg border border-border p-1 bg-card shrink-0"
                    />
                  )}
                </div>

                {/* Información del Participante y Entrada */}
                <div className="py-4 grid grid-cols-2 gap-4 border-b border-border/80">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Participante
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                      {ticketData.participant.fullName}
                    </p>
                    {ticketData.participant.documentId && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        Doc: {ticketData.participant.documentId}
                      </p>
                    )}
                    {ticketData.participant.institution && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ticketData.participant.institution}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      No. Registro & Tipo
                    </p>
                    <p className="text-sm font-black font-mono text-primary mt-0.5">
                      {ticketData.registration.registrationNumber}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-foreground border border-border">
                        {ticketData.registration.ticketType}
                      </span>
                      {ticketData.registration.isCourtesy ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          Cortesía
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {ticketData.registration.paymentStatus === 'PAID' ? 'Pagado' : 'Pendiente'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Código QR Central */}
                <div className="py-6 flex flex-col items-center justify-center bg-muted/20 rounded-xl my-4 border border-dashed border-border">
                  <div className="p-3 bg-white rounded-xl shadow-md border border-zinc-200">
                    <img
                      src={ticketData.qrDataUrl}
                      alt="Código QR de Entrada"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                  <p className="text-[11px] font-mono font-medium text-muted-foreground mt-3 tracking-wider text-center">
                    TOKEN: {ticketData.token}
                  </p>
                  <p className="text-[11px] text-muted-foreground text-center mt-1">
                    Presente este código QR en el módulo de recepción para registrar su entrada.
                  </p>
                </div>

                {/* Estado de Asistencia */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-muted-foreground">Estado de llegada:</span>
                  {ticketData.registration.attended ? (
                    <span className="flex items-center gap-1 font-bold text-emerald-500">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Asistencia Registrada ({ticketData.registration.attendedAt ? new Date(ticketData.registration.attendedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-amber-500">
                      <Clock className="w-3.5 h-3.5" />
                      Pendiente de entrada
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de Acción (Ocultos al imprimir) */}
              <div className="space-y-3 print:hidden">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Entrada</span>
                  </button>

                  <button
                    onClick={handleDownloadPng}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-semibold text-xs hover:bg-muted/80 border border-border transition-colors cursor-pointer"
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
                      className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${revoking ? 'animate-spin' : ''}`} />
                      <span>{revoking ? 'Revocando credencial...' : 'Revocar y Regenerar Código QR'}</span>
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                      Solo administradores. Si el QR fue comprometido o extraviado, invalidará el anterior inmediatamente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
