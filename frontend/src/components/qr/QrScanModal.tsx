import { inventoryService, TshirtInventoryItem } from '../../services/inventory.service';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
import { participantsService } from '../../services/participants.service';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { qrService } from '../../services/qr.service';
import { attendanceService } from '../../services/attendance.service';
import { QrScanResult, Registration } from '../../types';
import { useEdition } from '../../context/EditionContext';
import { TshirtSizeSelector } from '../attendance/TshirtSizeSelector';
import {
  X,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  RotateCcw,
  Camera,
  Keyboard,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ShieldAlert,
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

  // Modo de escaneo: 'camera' (Cámara en vivo cuadrada) o 'manual' (Lector USB / Token manual)
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera');

  const [scanInput, setScanInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<QrScanResult | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
  const [selectedTshirtSize, setSelectedTshirtSize] = useState<string | null>(null);

  // Estados específicos de la cámara
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [deliverNow, setDeliverNow] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<TshirtInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const tshirtEnabled = currentEvent?.settings?.tshirtSizesEnabled === true;
  const rawTshirtSizes = currentEvent?.settings?.tshirtSizes;
  const tshirtSizes: string[] = (() => {
    if (Array.isArray(rawTshirtSizes)) return rawTshirtSizes;
    if (typeof rawTshirtSizes === 'string') {
      try {
        const parsed = JSON.parse(rawTshirtSizes);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
    return ['Medium (M)', 'XL', 'L', '2XL', 'Size 16', 'Size 12', 'Size 14', 'S'];
  })();

  useEffect(() => {
    let active = true;
    setInventoryItems([]);
    if (isOpen && tshirtEnabled && scanResult?.registration) {
      setInventoryLoading(true);
      inventoryService.getInventory(currentEvent?.id).then(result => { if (active) setInventoryItems(result.items); }).catch(() => {}).finally(() => { if (active) setInventoryLoading(false); });
    }
    return () => { active = false; };
  }, [isOpen, tshirtEnabled, currentEvent?.id, scanResult?.registration?.id]);
  const sizeAvailable = Boolean(selectedTshirtSize && inventoryItems.some(item => item.isActive !== false && item.size === selectedTshirtSize && item.availableQuantity > 0));
  const effectiveDelivery = Boolean(tshirtEnabled && deliverNow && sizeAvailable && !inventoryLoading);

  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraHost = useRef<HTMLDivElement | null>(null);
  const cameraElement = useRef<HTMLDivElement | null>(null);
  const attachCameraHost = useCallback((host: HTMLDivElement | null) => {
    cameraHost.current = host;
    const element = cameraElement.current;
    if (!host && element) {
      // Keep pending video initialization connected until the library can stop it.
      // Removing its video before loadedmetadata can leave start() pending forever.
      element.style.cssText = 'position:fixed;left:-10000px;top:0;width:310px;height:310px;pointer-events:none';
      element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(element);
    }
  }, []);
  const lastScannedTokenRef = useRef<string | null>(null);
  const cameraQueue = useRef<Promise<void>>(Promise.resolve());
  const cameraGeneration = useRef(0);
  const scanGeneration = useRef(0);
  const scanBusy = useRef(false);
  const checkInBusy = useRef(false);
  const transitionGeneration = useRef(0);

  const releaseCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const video = cameraElement.current?.querySelector('video');
    const tracks = (video?.srcObject as MediaStream | null)?.getTracks() || [];
    try {
      if (video && !scanner.isScanning && scanner.getState() === Html5QrcodeScannerState.SCANNING) {
        // Let the library's pending play() settle before removing its surface.
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            video.removeEventListener('playing', finish);
            video.removeEventListener('error', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 1500);
          video.addEventListener('playing', finish, { once: true });
          video.addEventListener('error', finish, { once: true });
        });
      }
      // getState() also covers the interval before the first video frame sets isScanning.
      if (scanner.getState() !== Html5QrcodeScannerState.NOT_STARTED) await scanner.stop();
    } finally {
      // Release hardware even if the library's DOM cleanup fails.
      tracks.forEach((track) => track.stop());
      try {
        scanner.clear();
      } finally {
        cameraElement.current?.remove();
        cameraElement.current = null;
        if (scannerRef.current === scanner) scannerRef.current = null;
      }
    }
  }, []);

  const stopCamera = useCallback(async () => {
    cameraGeneration.current += 1;
    setCameraActive(false);
    setCameraLoading(false);
    cameraQueue.current = cameraQueue.current.then(releaseCamera).catch(() => {});
    await cameraQueue.current;
  }, [releaseCamera]);

  useRealtimeRefresh('attendance', async () => {
    if (!isOpen || !scanResult?.registration || checkInBusy.current) return;
    const id = scanResult.registration.id; const fresh = await participantsService.getById(id);
    if (fresh.attended) setScanResult(previous => previous?.registration?.id === id ? { ...previous, status: 'ALREADY_CHECKED_IN', canCheckIn: false, message: 'Asistencia registrada previamente', registration: { ...previous.registration!, ...fresh } } : previous);
  });

  const processToken = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed || scanBusy.current) return;
    scanBusy.current = true;
    const generation = scanGeneration.current;
    try {
      setIsScanning(true);
      setCheckInSuccess(null);
      setCameraActive(false);
      setCameraLoading(false);
      cameraGeneration.current += 1;
      cameraQueue.current = cameraQueue.current.catch(() => {}).then(releaseCamera);
      await cameraQueue.current;
      const result = await qrService.scan(trimmed, currentEvent?.id);
      if (generation !== scanGeneration.current) return;
      setDeliverNow(true);
      setScanResult(result);
      setSelectedTshirtSize(result.registration?.tshirtSize || null);
    } catch (err: any) {
      if (generation !== scanGeneration.current) return;
      setScanResult({
        valid: false,
        status: 'INVALID_CODE',
        message: err?.response?.data?.message || 'Error al validar el código QR',
        canCheckIn: false,
      });
    } finally {
      if (generation === scanGeneration.current) {
        scanBusy.current = false;
        setIsScanning(false);
      }
    }
  }, [currentEvent?.id, releaseCamera]);

  const startCamera = useCallback(async () => {
    const generation = ++cameraGeneration.current;
    setCameraError(null);
    setCameraLoading(true);
    cameraQueue.current = cameraQueue.current.then(async () => {
      await releaseCamera();
      if (generation !== cameraGeneration.current || !cameraHost.current) return;
    try {
          const element = document.createElement('div');
          element.id = 'qr-square-viewport';
          element.className = 'w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover';
          cameraElement.current = element;
          cameraHost.current.appendChild(element);
          const scanner = new Html5Qrcode('qr-square-viewport');
          scannerRef.current = scanner;

          await scanner.start(
            { facingMode: 'environment' },
            {
              fps: 12,
              qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const qrboxSize = Math.floor(minEdge * 0.82);
                return { width: qrboxSize, height: qrboxSize };
              },
            },
            async (decodedText) => {
              // Prevenir lecturas repetidas instantáneas del mismo código
              if (generation !== cameraGeneration.current || scanBusy.current || lastScannedTokenRef.current !== null) return;
              lastScannedTokenRef.current = decodedText;

              // Pausar el escáner para evitar lecturas consecutivas mientras se revisa la ficha
              try {
                scanner.pause(true);
              } catch {}

              await processToken(decodedText);
            },
            () => {
              // Ignorar errores por frame sin código
            }
          );
          if (generation !== cameraGeneration.current) {
            await releaseCamera();
            return;
          }
          setCameraActive(true);
          setCameraLoading(false);
        } catch (err: any) {
          await releaseCamera().catch(() => {});
          if (generation !== cameraGeneration.current) return;
          console.error('Error al inicializar cámara:', err);
          setCameraLoading(false);
          setCameraActive(false);

          if (err?.name === 'NotAllowedError' || err?.message?.toLowerCase().includes('permission')) {
            setCameraError(
              'Permiso de cámara denegado. En iPhone: Ajustes > Safari > Cámara > Permitir. En Android: Permisos del sitio > Cámara.'
            );
          } else {
            setCameraError(
              'No fue posible acceder a la cámara. Verifique que otra aplicación no la esté utilizando o use el modo lector USB.'
            );
          }
        }
    }).catch(() => {
      if (generation === cameraGeneration.current) {
        setCameraLoading(false);
        setCameraActive(false);
        setCameraError('Error al iniciar la cámara en este dispositivo.');
      }
    });
    await cameraQueue.current;
  }, [processToken, releaseCamera]);

  // Al abrir/cerrar modal o cambiar de modo
  useEffect(() => {
    scanGeneration.current += 1;
    scanBusy.current = false;
    setIsScanning(false);
    setDeliverNow(false);
    if (isOpen) {
      setScanInput('');
      setScanResult(null);
      setCheckInSuccess(null);
      setSelectedTshirtSize(null);
      lastScannedTokenRef.current = null;
      setCameraError(null);

      if (scanMode === 'camera') {
        startCamera();
      } else {
        stopCamera();
        inputRef.current?.focus();
      }
    } else {
      stopCamera();
    }
    return () => {
      scanGeneration.current += 1;
      stopCamera();
    };
  }, [isOpen, scanMode, startCamera, stopCamera]);

  const handleClose = async () => {
    transitionGeneration.current += 1;
    scanGeneration.current += 1;
    await stopCamera();
    onClose();
  };

  const handleSwitchMode = async (mode: 'camera' | 'manual') => {
    if (mode === scanMode) return;
    const transition = ++transitionGeneration.current;
    scanGeneration.current += 1;
    await stopCamera();
    if (transition !== transitionGeneration.current) return;
    setScanMode(mode);
    setScanResult(null);
    setCheckInSuccess(null);
    lastScannedTokenRef.current = null;

  };

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = scanInput.trim();
    if (!token) return;

    await processToken(token);
  };

  const handleConfirmCheckIn = async (size?: string | null, tshirtDelivered?: boolean) => {
    if (!scanResult?.registration || !scanResult.canCheckIn || checkInBusy.current) return;
    checkInBusy.current = true;
    const generation = scanGeneration.current;
    const finalSize = size !== undefined ? size : selectedTshirtSize;

    try {
      setIsCheckingIn(true);
      const confirmed = await attendanceService.checkIn(scanResult.registration.id, finalSize || undefined, tshirtDelivered);
      onAttendanceMarked?.();
      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      if (generation !== scanGeneration.current) return;
      setCheckInSuccess(`¡Llegada confirmada con éxito para ${scanResult.registration.participant.fullName}!`);

      // Actualizar el estado del resultado a asistido
      setScanResult({
        ...scanResult,
        canCheckIn: false,
        status: 'ALREADY_CHECKED_IN',
        message: 'Asistencia registrada exitosamente',
        registration: { ...scanResult.registration, ...confirmed.registration },
      });
      setDeliverNow(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Error al registrar asistencia');
    } finally {
      checkInBusy.current = false;
      setIsCheckingIn(false);
    }
  };

  const handleResetForNext = () => {
    setDeliverNow(false);
    setScanInput('');
    setScanResult(null);
    setCheckInSuccess(null);
    setSelectedTshirtSize(null);
    lastScannedTokenRef.current = null;

    if (scanMode === 'camera') {
      if (scannerRef.current && cameraActive) {
        try {
          scannerRef.current.resume();
        } catch {
          startCamera();
        }
      } else {
        startCamera();
      }
    } else {
      inputRef.current?.focus();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-card rounded-2xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] max-sm:max-h-full" role="dialog" aria-modal="true" aria-label="Escáner de entradas QR">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-border bg-card/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm leading-tight">Escáner de Entradas QR</h3>
              <p className="text-[11px] text-muted-foreground leading-tight">Control de asistencia y check-in</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Modo: Cámara vs Lector Externo/Manual */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleSwitchMode('camera')}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                scanMode === 'camera'
                  ? 'bg-card text-foreground shadow-sm font-bold border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Camera className="w-4 h-4 text-primary" />
              <span>Modo Cámara</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('manual')}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                scanMode === 'manual'
                  ? 'bg-card text-foreground shadow-sm font-bold border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Keyboard className="w-4 h-4 text-primary" />
              <span>Lector USB / Manual</span>
            </button>
          </div>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* MODO 1: CÁMARA CON GUÍA CUADRADA */}
          {scanMode === 'camera' && !isScanning && !scanResult && (
            <div className="space-y-3">
              {/* Contenedor Cuadrado con Retícula y Láser */}
              <div className="relative w-full max-w-[310px] aspect-square mx-auto rounded-2xl overflow-hidden bg-black border-2 border-primary/40 shadow-inner flex items-center justify-center">
                {/* Contenedor del video html5-qrcode con recorte cuadrado perfecto y sin deformación */}
                <div
                  ref={attachCameraHost}
                  className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                />

                {/* Esquinas visuales de referencia (Reticle Corners BarCamp Red) */}
                <div className="absolute top-3 left-3 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl pointer-events-none z-10 shadow-sm" />
                <div className="absolute top-3 right-3 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl pointer-events-none z-10 shadow-sm" />
                <div className="absolute bottom-3 left-3 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl pointer-events-none z-10 shadow-sm" />
                <div className="absolute bottom-3 right-3 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl pointer-events-none z-10 shadow-sm" />

                {/* Láser de escaneo animado en movimiento continuo */}
                {cameraActive && !cameraLoading && !scanResult && (
                  <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_#ED2917] pointer-events-none z-10 animate-scan-line" />
                )}

                {/* Estado de carga de la cámara */}
                {cameraLoading && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2 p-4 text-center z-20">
                    <RefreshCw className="w-7 h-7 text-primary animate-spin" />
                    <span className="text-xs font-semibold text-white">
                      Inicializando cámara...
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Conceda permisos si el navegador los solicita
                    </span>
                  </div>
                )}

                {/* Mensaje de guía sobre la cámara */}
                {cameraActive && !cameraLoading && !scanResult && (
                  <div className="absolute bottom-3 inset-x-3 pointer-events-none z-10 text-center">
                    <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-sm text-[11px] font-medium text-white border border-white/10 shadow">
                      Apunte al código QR del participante
                    </span>
                  </div>
                )}
              </div>

              {/* Controles de cámara bajo el visor */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                  <span>{cameraActive ? 'Cámara activa' : 'Cámara pausada'}</span>
                </span>
                <div className="flex items-center gap-2">
                  {cameraActive ? (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
                    >
                      Pausar cámara
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="text-primary hover:underline text-xs font-bold cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reactivar cámara</span>
                    </button>
                  )}
                </div>
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-rose-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          )}

          {/* MODO 2: LECTOR USB EXTERNO O ENTRADA MANUAL */}
          {scanMode === 'manual' && (
            <div className="space-y-3">
              <form onSubmit={handleScanSubmit} className="space-y-2.5">
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
                  Entrada de Lector USB o Token QR:
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Escanee con lector USB o pegue el enlace/token..."
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isScanning || !scanInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isScanning ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Validar</span>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Compatible con pistolas lectoras USB/Bluetooth (envían Enter automáticamente tras la lectura) y URLs completas de ticket.
                </p>
              </form>
            </div>
          )}

          {/* Notificación de Confirmación de Asistencia Exitosa */}
          {checkInSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm flex items-center gap-3 animate-fade-in font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span className="flex-1">{checkInSuccess}</span>
            </div>
          )}

          {/* Resultado de Validación */}
          {scanResult && (
            <div className="space-y-3.5 pt-3 border-t border-border animate-fade-in">
              {!scanResult.registration && (
                <button type="button" onClick={handleResetForNext}
                  className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-bold cursor-pointer">
                  Escanear siguiente
                </button>
              )}
              {/* Tarjeta de Estado del Ticket */}
              {scanResult.status === 'VALID' ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-sm">Entrada Válida — Listo para ingresar</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : scanResult.status === 'ALREADY_CHECKED_IN' ? (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-sm">Asistencia Ya Registrada Anteriormente</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : scanResult.status === 'EDITION_MISMATCH' ? (
                <div className="p-3.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-sm">Edición o Evento Incorrecto</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-sm">Código No Válido o Revocado</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanResult.message}
                  </p>
                </div>
              )}

              {/* Ficha del Participante Identificado */}
              {scanResult.registration && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-white">
                          {scanResult.registration.registrationNumber}
                        </span>
                        {scanResult.registration.isDemo && (
                          <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            DEMO
                          </span>
                        )}
                      </div>
                      <h4 className="font-display font-bold text-base text-foreground mt-1">
                        {scanResult.registration.participant.fullName}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {scanResult.registration.participant.email}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground block">
                        Entrada
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {scanResult.registration.ticketType?.name || 'General'}
                      </span>
                      <span className="text-[10px] block mt-0.5 text-muted-foreground">
                        {scanResult.registration.isCourtesy
                          ? 'Cortesía'
                          : scanResult.registration.paymentStatus === 'PAID'
                          ? 'Pagado'
                          : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* Selector de Talla de Camiseta (si está habilitado para el evento) */}
                  {scanResult.canCheckIn && tshirtEnabled && (
                    <div className="p-3 rounded-xl bg-background border border-border">
                      <TshirtSizeSelector
                        sizes={tshirtSizes}
                        selectedSize={selectedTshirtSize}
                        onSelect={setSelectedTshirtSize}
                        disabled={isCheckingIn}
                        showSkip={true}
                        label="Talla de Camiseta (Opcional)"
                      />
                    </div>
                  )}

                  {scanResult.canCheckIn && tshirtEnabled && selectedTshirtSize && !sizeAvailable && <p className="text-xs text-muted-foreground">{inventoryLoading ? 'Comprobando disponibilidad...' : 'Talla sin disponibilidad confirmada. Puede registrar la entrega pendiente.'}</p>}
                  {scanResult.canCheckIn && tshirtEnabled && <fieldset className="flex flex-wrap gap-4 text-xs p-3 rounded-xl bg-background border border-border">
                    <label className="flex items-center gap-2"><input type="radio" name="qr-delivery" checked={!effectiveDelivery} onChange={() => setDeliverNow(false)} disabled={isCheckingIn} />Registrar entrega pendiente</label>
                    <label className="flex items-center gap-2"><input type="radio" name="qr-delivery" checked={effectiveDelivery} onChange={() => setDeliverNow(true)} disabled={isCheckingIn || !sizeAvailable || inventoryLoading} />Entregar ahora</label>
                  </fieldset>}

                  {/* Botón Principal: Confirmar Asistencia con salvaguarda anti doble clic */}
                  {scanResult.canCheckIn && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => handleConfirmCheckIn(selectedTshirtSize, effectiveDelivery)}
                        disabled={isCheckingIn || inventoryLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserCheck className="w-5 h-5" />
                        <span>{isCheckingIn ? 'Registrando entrada...' : 'Confirmar asistencia'}</span>
                      </button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                        El escáner no marca automáticamente para prevenir ingresos accidentales. Confirme la identidad antes de pulsar.
                      </p>
                    </div>
                  )}

                  {/* Acciones Secundarias y Botón Continuar Escaneando */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={async () => {
                        if (onOpenParticipantDetail && scanResult.registration) {
                          await handleClose();
                          onOpenParticipantDetail(scanResult.registration);
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
                      className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-border"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-primary" />
                      <span>Escanear siguiente</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>, document.body
  );
};
