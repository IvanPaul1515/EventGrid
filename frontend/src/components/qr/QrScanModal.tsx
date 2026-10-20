import React, { useState, useEffect, useRef } from 'react';
import { qrService } from '../../services/qr.service';
import { attendanceService } from '../../services/attendance.service';
import { QrScanResult, Registration } from '../../types';
import { useEdition } from '../../context/EditionContext';
import {
  X,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Camera,
  ExternalLink,
} from 'lucide-react';

interface QrScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttendanceMarked?: () => void;
  onOpenParticipantDetail?: (reg: Registration) => void;
}

export const QrScanModal: React.FC<QrScanModalProps> = ({
  isOpen,
  onClose,
  onAttendanceMarked,
  onOpenParticipantDetail,
}) => {
  const { currentEvent } = useEdition();
  const [scanInput, setScanInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<QrScanResult | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-enfocar el campo de escaneo al abrir
  useEffect(() => {
    if (isOpen) {
      setScanInput('');
      setScanResult(null);
      setCheckInSuccess(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraError(null);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError('No se pudo acceder a la cámara o no está disponible en este dispositivo.');
      setCameraActive(false);
    }
  };

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = scanInput.trim();
    if (!token) return;

    try {
      setIsScanning(true);
      setCheckInSuccess(null);
      const result = await qrService.scan(token, currentEvent?.id);
      setScanResult(result);
    } catch (err: any) {
      setScanResult({
        valid: false,
        status: 'INVALID_CODE',
        message: err?.response?.data?.message || 'Error al validar el código QR',
        canCheckIn: false,
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!scanResult?.registration) return;
    try {
      setIsCheckingIn(true);
      await attendanceService.checkIn(scanResult.registration.id);
      setCheckInSuccess(`¡Llegada confirmada con éxito para ${scanResult.registration.participant.fullName}!`);
      // Actualizar el estado del resultado a asistido
      setScanResult({
        ...scanResult,
        canCheckIn: false,
        status: 'ALREADY_CHECKED_IN',
        message: 'Asistencia registrada exitosamente',
        registration: {
          ...scanResult.registration,
          attended: true,
          attendedAt: new Date().toISOString(),
        },
      });
      if (onAttendanceMarked) onAttendanceMarked();
      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al registrar asistencia');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleResetForNext = () => {
    setScanInput('');
    setScanResult(null);
    setCheckInSuccess(null);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Escáner de Entradas QR (Check-in)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Cámara en vivo opcional */}
          {cameraActive ? (
            <div className="space-y-2">
              <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-border">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline />
                <div className="absolute inset-0 border-2 border-primary/50 m-8 rounded-lg pointer-events-none animate-pulse" />
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Apunte la cámara al código QR de la entrada</span>
                <button
                  onClick={stopCamera}
                  className="text-primary hover:underline font-semibold cursor-pointer"
                >
                  Cerrar cámara
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-primary" />
                ¿Desea escanear con la cámara del dispositivo?
              </span>
              <button
                type="button"
                onClick={startCamera}
                className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors cursor-pointer"
              >
                Activar Cámara
              </button>
            </div>
          )}

          {cameraError && (
            <p className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
              {cameraError}
            </p>
          )}

          {/* Formulario de Entrada / Lector USB */}
          <form onSubmit={handleScanSubmit} className="space-y-3">
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
              Lector de Código de Barras / USB o Token QR:
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Escanee con el lector USB o pegue el enlace/token..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={isScanning || !scanInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isScanning ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Validar</span>
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Compatible con pistolas lectoras USB conectadas (envían Enter automáticamente) o URLs de entrada.
            </p>
          </form>

          {/* Notificación de Confirmación de Asistencia */}
          {checkInSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm flex items-center gap-3 animate-fade-in font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{checkInSuccess}</span>
            </div>
          )}

          {/* Resultado de Validación */}
          {scanResult && (
            <div className="space-y-4 pt-2 border-t border-border animate-fade-in">
              {/* Tarjeta de Estado */}
              {scanResult.status === 'VALID' ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-bold text-sm">Entrada Válida — Listo para ingresar</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : scanResult.status === 'ALREADY_CHECKED_IN' ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    <span className="font-bold text-sm">Asistencia Ya Registrada</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : scanResult.status === 'EDITION_MISMATCH' ? (
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold text-sm">Edición o Evento Incorrecto</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" />
                    <span className="font-bold text-sm">Entrada No Válida o Revocada</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              )}

              {/* Ficha Resumida del Participante Validado */}
              {scanResult.registration && (
                <div className="p-4 rounded-xl bg-background border border-border space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                        Participante
                      </p>
                      <h4 className="text-base font-bold text-foreground mt-0.5">
                        {scanResult.registration.participant.fullName}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        {scanResult.registration.participant.documentId || 'Sin documento'} • {scanResult.registration.participant.email}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-black text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">
                      {scanResult.registration.registrationNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border">
                    <div>
                      <span className="text-muted-foreground">Tipo de Entrada:</span>
                      <p className="font-bold text-foreground">
                        {scanResult.registration.ticketType?.name || 'General'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Estado de Pago:</span>
                      <p className="font-bold text-foreground">
                        {scanResult.registration.isCourtesy
                          ? 'Cortesía'
                          : scanResult.registration.paymentStatus === 'PAID'
                          ? 'Pagado'
                          : 'Pendiente'}
                      </p>
                    </div>
                  </div>

                  {/* Botón de Confirmación de Asistencia (Control Operativo Seguro) */}
                  {scanResult.canCheckIn && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleConfirmCheckIn}
                        disabled={isCheckingIn}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserCheck className="w-5 h-5" />
                        <span>{isCheckingIn ? 'Registrando entrada...' : 'MARCAR ASISTENCIA AHORA'}</span>
                      </button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                        El escaneo verifica la entrada sin marcarla automáticamente; confirme la identidad visual antes de pulsar.
                      </p>
                    </div>
                  )}

                  {/* Acciones Secundarias */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenParticipantDetail && scanResult.registration) {
                          onOpenParticipantDetail(scanResult.registration);
                          onClose();
                        }
                      }}
                      className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Ver ficha completa</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={handleResetForNext}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Escanear siguiente</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
