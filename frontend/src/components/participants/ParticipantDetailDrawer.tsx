import React, { useState } from 'react';
import { DetailedRegistration, participantsService } from '../../services/participants.service';
import { attendanceService } from '../../services/attendance.service';
import { useAuth } from '../../context/AuthContext';
import { PaymentMethod } from '../../types';
import { RecordPaymentModal } from './RecordPaymentModal';
import { AssignCourtesyModal } from './AssignCourtesyModal';
import { ReasonModal } from './ReasonModal';
import { RevertModal } from '../attendance/RevertModal';
import {
  X,
  User,
  CreditCard,
  History,
  Calendar,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  AlertCircle,
  Edit,
  Tag,
  DollarSign,
  ShieldCheck,
  Clock,
  UserCheck,
  Ban,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ParticipantDetailDrawerProps {
  registration: DetailedRegistration | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (reg: DetailedRegistration) => void;
  onUpdated?: (updatedReg: DetailedRegistration) => void;
  paymentMethods?: PaymentMethod[];
}

export const ParticipantDetailDrawer: React.FC<ParticipantDetailDrawerProps> = ({
  registration,
  isOpen,
  onClose,
  onEdit,
  onUpdated,
  paymentMethods = [],
}) => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  // Modales secundarios
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCourtesyModal, setShowCourtesyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [showPaymentsLedger, setShowPaymentsLedger] = useState(false);

  // Estados de acción de check-in
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !registration) return null;

  const p = registration.participant;
  const history = registration.editionHistory || [];
  const payments = registration.payments || [];

  const ticketPrice = registration.isCourtesy
    ? 0
    : Number(registration.ticketPrice ?? registration.totalAmount ?? 0);
  const amountPaid = registration.isCourtesy
    ? 0
    : Number(registration.amountPaid ?? registration.totalAmount ?? 0);
  const balanceDue = registration.isCourtesy
    ? 0
    : Math.max(0, ticketPrice - amountPaid);

  // Check-in directo desde la Ficha
  const handleMarkAttendance = async () => {
    if (markingAttendance || registration.attended) return;

    setMarkingAttendance(true);
    setFeedbackMsg(null);
    try {
      const res = await attendanceService.checkIn(registration.id);
      const updatedDetailed: DetailedRegistration = {
        ...registration,
        ...res.registration,
        participant: res.registration.participant || registration.participant,
        attended: true,
        attendedAt: res.registration.attendedAt,
        attendedByUserId: res.registration.attendedByUserId,
        attendedByUser: res.registration.attendedByUser || {
          id: user?.id || '',
          fullName: user?.fullName || 'Operador',
          email: user?.email || '',
        },
        status: 'ATTENDED',
      };

      if (onUpdated) onUpdated(updatedDetailed);

      setFeedbackMsg({
        type: 'success',
        text: `¡Asistencia confirmada para ${p.fullName}!`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.message || 'Error al marcar asistencia',
      });
    } finally {
      setMarkingAttendance(false);
    }
  };

  // Reversión de Asistencia (ADMIN)
  const handleConfirmRevert = async (reason: string) => {
    const res = await attendanceService.revert(registration.id, reason);
    const updatedDetailed: DetailedRegistration = {
      ...registration,
      ...res.registration,
      attended: false,
      attendedAt: undefined,
      attendedByUserId: undefined,
      attendedByUser: undefined,
      status: balanceDue === 0 || registration.isCourtesy ? 'CONFIRMED' : 'PENDING',
    };
    if (onUpdated) onUpdated(updatedDetailed);
    setShowRevertModal(false);
    setFeedbackMsg({
      type: 'success',
      text: 'Asistencia revertida exitosamente. Estado: No ha llegado.',
    });
  };

  // Registrar Abono
  const handleConfirmPayment = async (amount: number, paymentMethodId: string, notes?: string) => {
    const res = await participantsService.recordPayment(registration.id, {
      amount,
      paymentMethodId,
      notes,
    });
    const updatedDetailed: DetailedRegistration = {
      ...registration,
      ...res.registration,
      payments: res.registration.payments || [res.payment, ...payments],
    };
    if (onUpdated) onUpdated(updatedDetailed);
    setFeedbackMsg({
      type: 'success',
      text: `Abono de RD$ ${amount.toFixed(2)} registrado correctamente`,
    });
  };

  // Asignar Cortesía
  const handleConfirmCourtesy = async (authorizedBy: string, reason: string) => {
    const updated = await participantsService.assignCourtesy(registration.id, {
      authorizedBy,
      reason,
    });
    const updatedDetailed: DetailedRegistration = {
      ...registration,
      ...updated,
    };
    if (onUpdated) onUpdated(updatedDetailed);
    setFeedbackMsg({
      type: 'success',
      text: `Cortesía asignada exitosamente a ${p.fullName}`,
    });
  };

  // Cancelar Registro
  const handleConfirmCancel = async (reason: string) => {
    const updated = await participantsService.cancel(registration.id, reason);
    const updatedDetailed: DetailedRegistration = {
      ...registration,
      ...updated,
    };
    if (onUpdated) onUpdated(updatedDetailed);
    setFeedbackMsg({
      type: 'success',
      text: 'Inscripción cancelada. Los datos y pagos históricos se conservan.',
    });
  };

  // Reactivar Registro
  const handleConfirmReactivate = async (reason: string) => {
    const updated = await participantsService.reactivate(registration.id, reason);
    const updatedDetailed: DetailedRegistration = {
      ...registration,
      ...updated,
    };
    if (onUpdated) onUpdated(updatedDetailed);
    setFeedbackMsg({
      type: 'success',
      text: 'Inscripción reactivada correctamente.',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Confirmado</span>;
      case 'ATTENDED':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">Asistió</span>;
      case 'PENDING':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Pendiente</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">Cancelado</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-8">
          <div className="w-screen max-w-lg bg-card border-l border-border shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-250">
            {/* Cabecera de la Ficha */}
            <div className="border-b border-border bg-gradient-to-b from-primary/15 via-background to-background p-6 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/15 border border-primary/25">
                  Ficha Oficial del Participante
                </span>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-barcamp-burgundy flex items-center justify-center text-white font-black text-xl shadow-lg ring-2 ring-primary/40 shrink-0">
                  {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black text-foreground truncate tracking-tight">
                    {p.fullName}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>

                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-zinc-800 text-white border border-zinc-700">
                      {registration.registrationNumber}
                    </span>
                    {getStatusBadge(registration.status)}
                    {registration.isCourtesy && (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Cortesía
                      </span>
                    )}
                    {registration.attended ? (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Asistió
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> No ha llegado
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mensajes de retroalimentación inmediata */}
              {feedbackMsg && (
                <div
                  className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    feedbackMsg.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  }`}
                >
                  {feedbackMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}
            </div>

            {/* Cuerpo de la Ficha con las 4 Secciones Requeridas */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-230px)]">
              {/* SECCIÓN 4 PRIMERO: CONTROL DE ASISTENCIA (CHECK-IN DESTACADO) */}
              <div className="p-4 rounded-2xl border bg-muted/20 border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      Control de Entrada (Check-in)
                    </span>
                  </div>
                  {registration.attended ? (
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Entrada Registrada
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-zinc-800 text-amber-400 border border-zinc-700">
                      Pendiente de Entrada
                    </span>
                  )}
                </div>

                {registration.attended ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Asistencia Física Confirmada</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                          Hora de Llegada
                        </span>
                        <span className="font-semibold text-foreground">
                          {registration.attendedAt
                            ? new Date(registration.attendedAt).toLocaleTimeString('es-DO', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                          Operador Responsable
                        </span>
                        <span className="font-semibold text-foreground truncate block">
                          {registration.attendedByUser?.fullName || 'Operador en turno'}
                        </span>
                      </div>
                    </div>

                    {/* Botón de Revertir Asistencia (Solo ADMIN) */}
                    {isAdmin && (
                      <div className="pt-2 border-t border-emerald-500/20 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowRevertModal(true)}
                          className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Revertir Asistencia (Admin)</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Revise la identidad y datos del participante antes de confirmar su entrada física al recinto.
                    </p>
                    <button
                      type="button"
                      disabled={markingAttendance || registration.status === 'CANCELLED'}
                      onClick={handleMarkAttendance}
                      className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {markingAttendance ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check className="w-5 h-5 stroke-[3]" />
                          <span>MARCAR ASISTENCIA</span>
                        </>
                      )}
                    </button>
                    {registration.status === 'CANCELLED' && (
                      <p className="text-[11px] text-rose-400 text-center font-semibold">
                        No se puede registrar asistencia a una inscripción en estado Cancelado.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* SECCIÓN 1: INFORMACIÓN PERSONAL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-wider text-foreground">
                    1. Información Personal
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Cédula / Pasaporte
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {p.documentId || 'No especificado'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Institución / Empresa
                    </span>
                    <span className="text-xs font-bold text-primary truncate block">
                      {p.institution || 'Independiente / No registrada'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Phone className="w-3 h-3 text-primary" /> Teléfono
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {p.phone || 'No registrado'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Phone className="w-3 h-3 text-zinc-500" /> Tel. Alterno
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {p.alternatePhone || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-background border border-border">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground flex items-center gap-1 mb-0.5">
                    <Mail className="w-3 h-3 text-primary" /> Correo Electrónico
                  </span>
                  <span className="text-xs font-semibold text-foreground break-all">
                    {p.email}
                  </span>
                </div>
              </div>

              {/* SECCIÓN 2: INFORMACIÓN DE INSCRIPCIÓN */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-wider text-foreground">
                    2. Información de Inscripción
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Tipo de Entrada
                    </span>
                    <span className="text-xs font-black text-foreground">
                      {registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General')}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Origen de Inscripción
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {registration.source === 'ONSITE_SALE'
                        ? '🏪 Venta Presencial'
                        : registration.source === 'EXCEL_IMPORT'
                        ? '📥 Archivo Excel'
                        : '✍️ Registro Manual'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Responsable de Venta
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {registration.salesResponsible?.name || 'Comité Organizador'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Fecha de Registro
                    </span>
                    <span className="text-xs text-foreground">
                      {new Date(registration.saleTimestamp).toLocaleDateString('es-DO')}
                    </span>
                  </div>
                </div>

                {registration.notes && (
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Observaciones / Notas
                    </span>
                    <p className="text-xs text-foreground italic whitespace-pre-line">{registration.notes}</p>
                  </div>
                )}
              </div>

              {/* SECCIÓN 3: INFORMACIÓN FINANCIERA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      3. Información Financiera
                    </span>
                  </div>
                  {isAdmin && !registration.isCourtesy && (
                    <button
                      type="button"
                      onClick={() => setShowCourtesyModal(true)}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Tag className="w-3 h-3" /> Asignar Cortesía
                    </button>
                  )}
                </div>

                {/* Banner de Cortesía Oficial si aplica */}
                {registration.isCourtesy && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                      <Tag className="w-4 h-4 text-amber-400" />
                      <span>Cortesía Institucional Aprobada</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 pt-0.5">
                      <div>
                        <span className="text-[10px] text-amber-400/80 uppercase block">Autorizado Por:</span>
                        <span className="font-semibold">{registration.courtesyAuthorizedBy || 'Comité Directivo'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-400/80 uppercase block">Motivo:</span>
                        <span className="font-semibold">{registration.courtesyReason || 'No especificado'}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-400 border-t border-amber-500/20 pt-1 font-mono">
                      Monto RD$ 0.00 — Exento de balance y no suma en la recaudación del evento.
                    </p>
                  </div>
                )}

                {/* Desglose Financiero */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Tarifa Boleto
                    </span>
                    <span className="text-sm font-mono font-black text-foreground">
                      RD$ {ticketPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Total Pagado
                    </span>
                    <span className="text-sm font-mono font-black text-foreground">
                      RD$ {amountPaid.toFixed(2)}
                    </span>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      balanceDue > 0
                        ? 'bg-amber-500/15 border-amber-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/25'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-mono tracking-wider block mb-0.5 text-muted-foreground">
                      Balance Pendiente
                    </span>
                    <span
                      className={`text-sm font-mono font-black ${
                        balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      RD$ {balanceDue.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Forma de Pago
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {registration.isCourtesy
                        ? 'Cortesía'
                        : registration.paymentMethod?.name || 'No registrada'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-background border border-border">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">
                      Estado de Pago
                    </span>
                    {balanceDue === 0 || registration.isCourtesy ? (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Liquidado
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Pago Parcial
                      </span>
                    )}
                  </div>
                </div>

                {/* Botón para registrar Abono si hay balance o para abonos adicionales */}
                {!registration.isCourtesy && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Registrar Abono / Pago Adicional</span>
                    </button>

                    {payments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPaymentsLedger(!showPaymentsLedger)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                      >
                        <span>Pagos ({payments.length})</span>
                        {showPaymentsLedger ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}

                {/* Desglose de Pagos / Abonos Registrados */}
                {showPaymentsLedger && payments.length > 0 && (
                  <div className="space-y-2 p-3 rounded-xl bg-background border border-border text-xs">
                    <span className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider block">
                      Libro de Pagos del Participante:
                    </span>
                    {payments.map((pm, idx) => (
                      <div
                        key={pm.id || idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border"
                      >
                        <div>
                          <span className="font-bold text-foreground">
                            RD$ {Number(pm.amount).toFixed(2)}
                          </span>
                          <span className="text-muted-foreground text-[10px] block">
                            {pm.paymentMethod?.name || 'Pago'} •{' '}
                            {new Date(pm.createdAt).toLocaleString('es-DO', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {pm.receivedByUser?.fullName || 'Recepción'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HISTORIAL INTERANUAL DE EDICIONES */}
              {history.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 pb-1 border-b border-border">
                    <History className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      Historial en Ediciones Anteriores ({history.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {history.map((h) => (
                      <div
                        key={h.registrationId}
                        className="p-3 rounded-xl bg-background border border-border flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground">{h.editionName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                              {h.year}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Ticket: {h.registrationNumber} • {h.paymentMethodName}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-foreground block">
                            RD$ {h.totalAmount.toFixed(2)}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-emerald-400">
                            {h.attended ? 'Asistió' : h.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pie de la Ficha: Acciones */}
            <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(registration);
                }}
                className="py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar Datos</span>
              </button>

              {/* Acciones de Cancelación / Reactivación para ADMIN */}
              {isAdmin && (
                <>
                  {registration.status === 'CANCELLED' ? (
                    <button
                      type="button"
                      onClick={() => setShowReactivateModal(true)}
                      className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reactivar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancelar Inscripción</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border transition-colors cursor-pointer ml-auto"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modales Secundarios Integrados */}
      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleConfirmPayment}
        participantName={p.fullName}
        registrationNumber={registration.registrationNumber}
        balanceDue={balanceDue}
        paymentMethods={paymentMethods}
      />

      <AssignCourtesyModal
        isOpen={showCourtesyModal}
        onClose={() => setShowCourtesyModal(false)}
        onConfirm={handleConfirmCourtesy}
        participantName={p.fullName}
        registrationNumber={registration.registrationNumber}
      />

      <ReasonModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
        title="Cancelar Inscripción de Participante"
        description={`Está a punto de cancelar la inscripción de ${p.fullName} (${registration.registrationNumber}). Los datos y el historial de pagos se conservarán intactos sin reembolsos automáticos.`}
        confirmLabel="Confirmar Cancelación"
        isDestructive={true}
      />

      <ReasonModal
        isOpen={showReactivateModal}
        onClose={() => setShowReactivateModal(false)}
        onConfirm={handleConfirmReactivate}
        title="Reactivar Inscripción Cancelada"
        description={`Va a reactivar la inscripción de ${p.fullName} (${registration.registrationNumber}).`}
        confirmLabel="Reactivar Inscripción"
        isDestructive={false}
      />

      <RevertModal
        isOpen={showRevertModal}
        loading={false}
        onClose={() => setShowRevertModal(false)}
        onConfirm={handleConfirmRevert}
        registration={registration}
      />
    </>
  );
};
