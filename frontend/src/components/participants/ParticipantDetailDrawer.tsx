import React, { useState, useEffect } from 'react';
import { DetailedRegistration, participantsService } from '../../services/participants.service';
import { attendanceService } from '../../services/attendance.service';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { api } from '../../services/api';
import { PaymentMethod, RegistrationStatus, PaymentStatus } from '../../types';
import { RecordPaymentModal } from './RecordPaymentModal';
import { AssignCourtesyModal } from './AssignCourtesyModal';
import { ReasonModal } from './ReasonModal';
import { RevertModal } from '../attendance/RevertModal';
import { DigitalTicketModal } from '../qr/DigitalTicketModal';
import { SendSingleEmailModal } from '../communications/SendSingleEmailModal';
import { TshirtSizeSelector } from '../attendance/TshirtSizeSelector';
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
  Clock,
  UserCheck,
  Ban,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Save,
  Shield,
  QrCode,
  Send,
  Shirt,
} from 'lucide-react';

interface ParticipantDetailDrawerProps {
  registration: DetailedRegistration | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (reg: DetailedRegistration) => void;
  onUpdated?: (updatedReg: DetailedRegistration) => void;
  paymentMethods?: PaymentMethod[];
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const ParticipantDetailDrawer: React.FC<ParticipantDetailDrawerProps> = ({
  registration,
  isOpen,
  onClose,
  onEdit,
  onUpdated,
  paymentMethods = [],
  onNavigate,
  hasPrev = false,
  hasNext = false,
}) => {
  const { user, hasRole } = useAuth();
  const { currentEvent } = useEdition();
  const isAdmin = hasRole(['ADMIN']);
  const isOperatorOrAdmin = hasRole(['ADMIN', 'OPERATOR']);

  // T-shirt settings from event
  const tshirtEnabled = currentEvent?.settings?.tshirtSizesEnabled === true;
  const tshirtSizes = currentEvent?.settings?.tshirtSizes || ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

  // Modales secundarios
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCourtesyModal, setShowCourtesyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [showPaymentsLedger, setShowPaymentsLedger] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Modo edición directa inline dentro de la ficha
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDocumentId, setEditDocumentId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAlternatePhone, setEditAlternatePhone] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingInline, setSavingInline] = useState(false);

  // Estados de acción de check-in
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // T-shirt selection pending check-in
  const [pendingTshirtSize, setPendingTshirtSize] = useState<string | null>(null);
  const [showTshirtSelector, setShowTshirtSelector] = useState(false);
  // Edit tshirt after check-in
  const [editingTshirt, setEditingTshirt] = useState(false);
  const [tshirtEditSize, setTshirtEditSize] = useState<string | null>(null);
  const [savingTshirt, setSavingTshirt] = useState(false);

  useEffect(() => {
    if (registration) {
      setEditFirstName(registration.participant.firstName || '');
      setEditLastName(registration.participant.lastName || '');
      setEditEmail(registration.participant.email || '');
      setEditDocumentId(registration.participant.documentId || '');
      setEditPhone(registration.participant.phone || '');
      setEditAlternatePhone(registration.participant.alternatePhone || '');
      setEditInstitution(registration.participant.institution || '');
      setEditNotes(registration.notes || '');
      setIsInlineEditing(false);
      setFeedbackMsg(null);
    }
  }, [registration?.id]);

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
  const creditBalance = registration.isCourtesy
    ? 0
    : Math.max(0, amountPaid - ticketPrice);

  // Ajustar monto pagado directamente a la tarifa actual
  const handleAdjustPaymentToTariff = async () => {
    setSavingInline(true);
    setFeedbackMsg(null);
    try {
      const updated = await participantsService.update(registration.id, {
        amountPaid: ticketPrice,
        totalAmount: ticketPrice,
      });

      const updatedDetailed: DetailedRegistration = {
        ...registration,
        ...updated,
        participant: {
          ...registration.participant,
          ...updated.participant,
        },
      };

      if (onUpdated) onUpdated(updatedDetailed);
      setFeedbackMsg({
        type: 'success',
        text: `Monto pagado ajustado a la tarifa de RD$ ${ticketPrice.toFixed(2)} exitosamente.`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.message || 'Error al ajustar el monto del participante',
      });
    } finally {
      setSavingInline(false);
    }
  };

  // Guardar cambios de edición inline directamente en la ficha
  const handleSaveInline = async () => {
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Nombres, Apellidos y Correo electrónico son obligatorios.' });
      return;
    }

    setSavingInline(true);
    setFeedbackMsg(null);
    try {
      const updated = await participantsService.update(registration.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        email: editEmail.trim(),
        documentId: editDocumentId.trim() || null,
        phone: editPhone.trim() || null,
        alternatePhone: editAlternatePhone.trim() || null,
        institution: editInstitution.trim() || null,
        notes: editNotes.trim() || null,
      });

      const updatedDetailed: DetailedRegistration = {
        ...registration,
        ...updated,
        participant: {
          ...registration.participant,
          ...updated.participant,
        },
      };

      if (onUpdated) onUpdated(updatedDetailed);
      setIsInlineEditing(false);
      setFeedbackMsg({
        type: 'success',
        text: 'Datos actualizados correctamente en la ficha.',
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.message || 'Error al actualizar el participante',
      });
    } finally {
      setSavingInline(false);
    }
  };

  // Check-in directo desde la Ficha
  const handleMarkAttendance = async (tshirtSize?: string | null) => {
    if (markingAttendance || registration.attended) return;

    setMarkingAttendance(true);
    setFeedbackMsg(null);
    setShowTshirtSelector(false);
    try {
      const res = await attendanceService.checkIn(registration.id, tshirtSize || undefined);
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
        status: res.registration.status,
        tshirtSize: (res.registration as any).tshirtSize || tshirtSize || undefined,
      };

      if (onUpdated) onUpdated(updatedDetailed);
      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      setPendingTshirtSize(null);

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

  // Guardar talla de camiseta después de check-in
  const handleSaveTshirt = async () => {
    if (!registration || savingTshirt) return;
    setSavingTshirt(true);
    try {
      await api.put(`/participants/${registration.id}/tshirt-size`, { tshirtSize: tshirtEditSize });
      const updatedDetailed: DetailedRegistration = {
        ...registration,
        tshirtSize: tshirtEditSize || undefined,
      };
      if (onUpdated) onUpdated(updatedDetailed);
      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      setEditingTshirt(false);
      setFeedbackMsg({ type: 'success', text: 'Talla de camiseta actualizada.' });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.message || 'Error al actualizar talla' });
    } finally {
      setSavingTshirt(false);
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
      status: res.registration.status,
    };
    if (onUpdated) onUpdated(updatedDetailed);
    window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
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
    window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
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
    window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
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
    window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
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
    window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
    setFeedbackMsg({
      type: 'success',
      text: 'Inscripción reactivada correctamente.',
    });
  };

  // Insignia 1: Estado de Inscripción (RegistrationStatus)
  const renderRegistrationBadge = (status: RegistrationStatus | string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Confirmada
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pendiente
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <Ban className="w-3 h-3" /> Cancelada
          </span>
        );
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  // Insignia 2: Estado de Pago (PaymentStatus)
  const renderPaymentBadge = () => {
    if (registration.isCourtesy) {
      return (
        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
          <Tag className="w-3 h-3" /> Cortesía
        </span>
      );
    }
    const payStatus = registration.paymentStatus || (balanceDue === 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING');
    switch (payStatus) {
      case 'PAID':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Pagado
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Abono Parcial
          </span>
        );
      case 'COURTESY':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
            <Tag className="w-3 h-3" /> Cortesía
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Pendiente Pago
          </span>
        );
    }
  };

  // Insignia 3: Estado de Asistencia
  const renderAttendanceBadge = () => {
    if (registration.attended) {
      const timeStr = registration.attendedAt
        ? new Date(registration.attendedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
        : '';
      return (
        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Asistió {timeStr && `(${timeStr})`}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1">
        <Clock className="w-3 h-3" /> No ha llegado
      </span>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-8">
          <div className="w-screen max-w-full sm:max-w-xl bg-card border-l border-border shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-250">
            {/* Cabecera de la Ficha con Navegación Anterior/Siguiente */}
            <div className="border-b border-border bg-gradient-to-b from-primary/15 via-background to-background p-4 sm:p-6 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/15 border border-primary/25">
                    Ficha del Participante
                  </span>
                  {/* Navegación rápida entre participantes */}
                  {onNavigate && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => onNavigate('prev')}
                        disabled={!hasPrev}
                        className="p-1 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Participante anterior"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('next')}
                        disabled={!hasNext}
                        className="p-1 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Participante siguiente"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isOperatorOrAdmin && !isInlineEditing && (
                    <button
                      type="button"
                      onClick={() => setIsInlineEditing(true)}
                      className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-bold border border-primary/30 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Editar datos directamente en esta ficha"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Perfil del Participante */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-barcamp-burgundy flex items-center justify-center text-white font-black text-xl shadow-lg ring-2 ring-primary/40 shrink-0">
                  {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-foreground truncate tracking-tight">
                      {p.fullName}
                    </h2>
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-zinc-800 text-white border border-zinc-700">
                      {registration.registrationNumber}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>

                  {/* Tres insignias de estado independientes */}
                  <div className="flex items-center flex-wrap gap-2 mt-2.5">
                    {renderRegistrationBadge(registration.status)}
                    {renderPaymentBadge()}
                    {renderAttendanceBadge()}
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

            {/* Cuerpo de la Ficha */}
            <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto max-h-[calc(100vh-210px)]">
              {/* CONTROL DE ENTRADA (CHECK-IN DESTACADO) */}
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
                      <span>Asistencia Confirmada</span>
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

                    {/* T-shirt size — show/edit after check-in */}
                    {tshirtEnabled && (
                      <div className="pt-2 border-t border-emerald-500/20">
                        {editingTshirt ? (
                          <div className="space-y-2">
                            <TshirtSizeSelector
                              sizes={tshirtSizes}
                              selectedSize={tshirtEditSize}
                              onSelect={setTshirtEditSize}
                              disabled={savingTshirt}
                              showSkip={true}
                              label="Cambiar talla de camiseta"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditingTshirt(false); setTshirtEditSize(registration.tshirtSize || null); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                disabled={savingTshirt}
                                onClick={handleSaveTshirt}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary hover:bg-primary/90 text-white cursor-pointer disabled:opacity-50"
                              >
                                {savingTshirt ? 'Guardando...' : 'Guardar talla'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <Shirt className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Camiseta:</span>
                              {registration.tshirtSize ? (
                                <span className="px-2 py-0.5 rounded font-bold bg-primary/20 text-primary border border-primary/30">
                                  {registration.tshirtSize}
                                </span>
                              ) : (
                                <span className="text-zinc-500 italic">Sin registrar</span>
                              )}
                            </div>
                            {isOperatorOrAdmin && (
                              <button
                                type="button"
                                onClick={() => { setEditingTshirt(true); setTshirtEditSize(registration.tshirtSize || null); }}
                                className="text-[11px] text-primary hover:underline cursor-pointer"
                              >
                                {registration.tshirtSize ? 'Cambiar' : 'Registrar talla'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Revise la identidad y datos del participante antes de confirmar su entrada física al recinto.
                    </p>

                    {/* T-shirt size selector (if event has it enabled) */}
                    {tshirtEnabled && (
                      <div className="p-3 rounded-xl bg-background border border-border">
                        <TshirtSizeSelector
                          sizes={tshirtSizes}
                          selectedSize={pendingTshirtSize}
                          onSelect={setPendingTshirtSize}
                          disabled={markingAttendance}
                          showSkip={true}
                          label="Talla de camiseta (opcional)"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={markingAttendance || registration.status === 'CANCELLED'}
                      onClick={() => handleMarkAttendance(pendingTshirtSize)}
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

              {/* ENTRADA DIGITAL & CÓDIGO QR */}
              <div className="p-4 rounded-2xl border bg-card border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      Entrada Digital & Código QR
                    </span>
                  </div>
                  {registration.qrCode && (
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                      Token Activo
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-muted/20 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">Credencial Digital del Participante</p>
                      <p className="text-[11px] text-muted-foreground">
                        {registration.qrCode ? 'Código QR seguro generado para acceso al evento' : 'QR pendiente de asignación'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTicketModal(true)}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Ver Entrada / QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs border border-border flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Enviar correo individual"
                    >
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span>Enviar Correo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 1: INFORMACIÓN PERSONAL (MODO VISTA / EDICIÓN INLINE) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      1. Información Personal
                    </span>
                  </div>
                  {isInlineEditing && (
                    <span className="text-[10px] font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                      Modo Edición Activo
                    </span>
                  )}
                </div>

                {isInlineEditing ? (
                  <div className="space-y-3 p-4 rounded-2xl bg-background border border-primary/40 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Apellido
                        </label>
                        <input
                          type="text"
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Cédula / Documento
                        </label>
                        <input
                          type="text"
                          value={editDocumentId}
                          onChange={(e) => setEditDocumentId(e.target.value)}
                          placeholder="402-XXXXXXX-X"
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Institución / Empresa
                        </label>
                        <input
                          type="text"
                          value={editInstitution}
                          onChange={(e) => setEditInstitution(e.target.value)}
                          placeholder="PUCMM / Empresa"
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Teléfono
                        </label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="809-XXX-XXXX"
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                          Tel. Alterno
                        </label>
                        <input
                          type="text"
                          value={editAlternatePhone}
                          onChange={(e) => setEditAlternatePhone(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-mono font-bold text-muted-foreground mb-1">
                        Notas / Observaciones
                      </label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setIsInlineEditing(false)}
                        className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveInline}
                        disabled={savingInline}
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingInline ? 'Guardando...' : 'Guardar Ficha'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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

                {registration.notes && !isInlineEditing && (
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
                <div className={`grid gap-2.5 text-center ${creditBalance > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
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

                  {creditBalance > 0 && (
                    <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 block mb-0.5 font-bold">
                        Pagó de más / Saldo
                      </span>
                      <span className="text-sm font-mono font-black text-cyan-300">
                        + RD$ {creditBalance.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Banner de Ajuste por Pago Superior a la Tarifa */}
                {creditBalance > 0 && (
                  <div className="mt-3 p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2 text-cyan-200">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>
                        El participante pagó <strong>RD$ {creditBalance.toFixed(2)}</strong> por encima de la tarifa actual (RD$ {ticketPrice.toFixed(2)}).
                      </span>
                    </div>
                    {hasRole(['ADMIN', 'OPERATOR']) && (
                      <button
                        onClick={handleAdjustPaymentToTariff}
                        disabled={savingInline}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors cursor-pointer shadow disabled:opacity-50"
                      >
                        Ajustar pago a la tarifa (RD$ {ticketPrice.toFixed(2)})
                      </button>
                    )}
                  </div>
                )}

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

              {/* AUDITORÍA Y TRAZABILIDAD */}
              <div className="p-3 rounded-xl bg-muted/20 border border-border text-[11px] text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    Última actualización:{' '}
                    <strong className="text-foreground">
                      {new Date(registration.updatedAt).toLocaleString('es-DO')}
                    </strong>
                  </span>
                </span>
                <span>
                  Por:{' '}
                  <strong className="text-foreground">
                    {registration.updatedByUser?.fullName || p.updatedByUser?.fullName || 'Sistema'}
                  </strong>
                </span>
              </div>
            </div>

            {/* Pie de la Ficha: Acciones */}
            <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-2 shrink-0">
              {isInlineEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveInline}
                    disabled={savingInline}
                    className="py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingInline ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInlineEditing(false)}
                    className="py-2.5 px-3 rounded-xl border border-border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsInlineEditing(true)}
                  className="py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Editar Ficha</span>
                </button>
              )}

              {/* Acciones de Cancelación / Reactivación para ADMIN */}
              {isAdmin && !isInlineEditing && (
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
                      <span>Cancelar</span>
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
        participantName={p.fullName}
        registrationNumber={registration.registrationNumber}
        balanceDue={balanceDue}
        paymentMethods={paymentMethods}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleConfirmPayment}
      />

      <AssignCourtesyModal
        isOpen={showCourtesyModal}
        participantName={p.fullName}
        registrationNumber={registration.registrationNumber}
        onClose={() => setShowCourtesyModal(false)}
        onConfirm={handleConfirmCourtesy}
      />

      <ReasonModal
        isOpen={showCancelModal}
        title="Cancelar Inscripción de Participante"
        description={`¿Está seguro de que desea cancelar la inscripción de ${p.fullName} (${registration.registrationNumber})? Los pagos históricos y registros de auditoría se mantendrán intactos.`}
        confirmLabel="Confirmar Cancelación"
        isDestructive={true}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
      />

      <ReasonModal
        isOpen={showReactivateModal}
        title="Reactivar Inscripción"
        description={`Reactivará la inscripción de ${p.fullName} (${registration.registrationNumber}).`}
        confirmLabel="Confirmar Reactivación"
        isDestructive={false}
        onClose={() => setShowReactivateModal(false)}
        onConfirm={handleConfirmReactivate}
      />

      <RevertModal
        registration={registration}
        isOpen={showRevertModal}
        loading={false}
        onClose={() => setShowRevertModal(false)}
        onConfirm={handleConfirmRevert}
      />

      <DigitalTicketModal
        registrationId={registration.id}
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        isAdmin={isAdmin}
      />

      <SendSingleEmailModal
        registrationId={registration.id}
        recipientName={p.fullName}
        recipientEmail={p.email}
        eventId={registration.eventId}
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
      />
    </>
  );
};
