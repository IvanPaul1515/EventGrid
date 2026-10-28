import {reviewedReceiptAmount,ReceiptDraft} from '../../utils/receiptOcr';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TicketType, PaymentMethod } from '../../types';
import { participantsService, OnsiteSaleResponse } from '../../services/participants.service';
import {
  ShoppingBag,
  X,
  User,
  CreditCard,
  Building,
  CheckCircle2,
  DollarSign,
  Receipt,
  Tag,
  AlertCircle,
  Phone,
  Mail,
  FileText,
} from 'lucide-react';

interface OnsiteSaleModalProps {
  receiptDraft?:ReceiptDraft;
  isOpen: boolean;
  onClose: () => void;
  ticketTypes: TicketType[];
  paymentMethods: PaymentMethod[];
  onSaleSuccess: (saleData: OnsiteSaleResponse, openDrawer?: boolean) => void;
}

export const OnsiteSaleModal: React.FC<OnsiteSaleModalProps> = ({
  isOpen,
  receiptDraft,
  onClose,
  ticketTypes,
  paymentMethods,
  onSaleSuccess,
}) => {
  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [institution, setInstitution] = useState('');
  const [notes, setNotes] = useState('');

  // Ticket & Financial states
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string>('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);

  // Courtesy fields
  const [courtesyAuthorizedBy, setCourtesyAuthorizedBy] = useState('Comité Directivo BarCamp RD');
  const [courtesyReason, setCourtesyReason] = useState('');

  // Processing states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar tipo de entrada por defecto
  useEffect(() => {
    if (isOpen) {
      setError(null);
      const defaultTicket =
        ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa')) ||
        ticketTypes[0];
      if (defaultTicket) {
        setSelectedTicketTypeId(defaultTicket.id);
        setAmountReceived(defaultTicket.price);
        setAmountPaid(defaultTicket.price);
      }
      const defaultPm =
        paymentMethods.find((p) => p.name.toLowerCase().includes('efectivo')) ||
        paymentMethods[0];
      if (defaultPm) {
        setPaymentMethodId(defaultPm.id);
      }
    }
  }, [isOpen, ticketTypes, paymentMethods]);

  useEffect(()=>{if(!isOpen||!receiptDraft)return;const parts=receiptDraft.participant.trim().split(/\s+/);if(receiptDraft.participant){setFirstName(parts[0]);setLastName(parts.slice(1).join(' '));}const amount=reviewedReceiptAmount(receiptDraft.amount);if(amount!==null){setAmountReceived(amount);setAmountPaid(amount);}setNotes('Propuesta OCR revisada (no constituye verificación de pago): '+JSON.stringify(receiptDraft));const method=paymentMethods.filter(m=>m.name.toLowerCase().includes(receiptDraft.method.toLowerCase()));if(receiptDraft.method&&method.length===1)setPaymentMethodId(method[0].id);},[isOpen,receiptDraft,paymentMethods]);

  // Manejo de scroll del body y tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketTypeId);
  const isCourtesy =
    selectedTicket?.price === 0 ||
    selectedTicket?.name.toLowerCase().includes('cortes') ||
    false;

  // Actualizar montos al cambiar el tipo de entrada
  const handleTicketTypeChange = (ticketId: string) => {
    setSelectedTicketTypeId(ticketId);
    const tt = ticketTypes.find((t) => t.id === ticketId);
    if (tt) {
      if (tt.price === 0 || tt.name.toLowerCase().includes('cortes')) {
        setAmountReceived(0);
        setAmountPaid(0);
      } else {
        setAmountReceived(tt.price);
        setAmountPaid(tt.price);
      }
    }
  };

  const ticketPrice = isCourtesy ? 0 : Number(selectedTicket?.price || 0);
  const changeDue = Math.max(0, amountReceived - amountPaid);
  const balanceDue = Math.max(0, ticketPrice - amountPaid);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setDocumentId('');
    setPhone('');
    setAlternatePhone('');
    setInstitution('');
    setNotes('');
    setError(null);
    const defaultTicket =
      ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa')) ||
      ticketTypes[0];
    if (defaultTicket) {
      setSelectedTicketTypeId(defaultTicket.id);
      setAmountReceived(defaultTicket.price);
      setAmountPaid(defaultTicket.price);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Nombre, Apellido y Correo electrónico son obligatorios');
      return;
    }
    if (!selectedTicketTypeId) {
      setError('Debe seleccionar un tipo de entrada');
      return;
    }
    if (!isCourtesy && !paymentMethodId) {
      setError('Debe seleccionar una forma de pago');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await participantsService.onsiteSale({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        documentId: documentId.trim() || undefined,
        phone: phone.trim() || undefined,
        alternatePhone: alternatePhone.trim() || undefined,
        institution: institution.trim() || undefined,
        ticketTypeId: selectedTicketTypeId,
        paymentMethodId: isCourtesy ? undefined : paymentMethodId,
        amountReceived: isCourtesy ? 0 : amountReceived,
        amountPaid: isCourtesy ? 0 : amountPaid,
        notes: notes.trim() || undefined,
        courtesyAuthorizedBy: isCourtesy ? courtesyAuthorizedBy.trim() : undefined,
        courtesyReason: isCourtesy ? courtesyReason.trim() : undefined,
      });

      // Éxito confirmado: disparar callback, limpiar formulario y cerrar modal
      onSaleSuccess(response, false);
      resetForm();
      onClose();
    } catch (err: any) {
      // Si falla, conservar los datos introducidos y mostrar el error
      setError(err.response?.data?.message || 'Error al procesar la venta presencial');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="mobile-safe-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="bg-card border border-border w-full h-full max-sm:max-h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl lg:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera Centrada y Accesible */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Punto de Venta Presencial — BarCamp RD
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Emisión de tickets presenciales, cobro directo y registro de participantes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Error si la operación falla */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 hover:opacity-80 text-rose-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Formulario en 2 Columnas para PC */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col justify-between">
          <div className="overflow-y-auto flex-1 min-h-0 p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COLUMNA IZQUIERDA: Entrada y Participante */}
              <div className="lg:col-span-7 space-y-5">
                {/* 1. Selección de Entrada */}
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-primary" />
                    <span>1. Seleccionar Tipo de Entrada *</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {ticketTypes.map((tt) => {
                      const isCur = tt.price === 0 || tt.name.toLowerCase().includes('cortes');
                      const isSelected = selectedTicketTypeId === tt.id;
                      return (
                        <button
                          key={tt.id}
                          type="button"
                          onClick={() => handleTicketTypeChange(tt.id)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                              : 'border-border bg-background hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-foreground truncate">
                              {tt.name}
                            </span>
                            {isCur && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/20 text-amber-400">
                                Cortesía
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-black font-mono text-primary block">
                            RD$ {Number(tt.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {tt.description && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                              {tt.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Datos del Participante */}
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                    <span>2. Datos del Participante *</span>
                  </label>

                  <div className="space-y-3 bg-muted/20 border border-border p-3.5 rounded-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Nombres *
                        </label>
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="ej. Carlos"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Apellidos *
                        </label>
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="ej. Pérez"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Correo Electrónico *
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="correo@ejemplo.com"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Cédula / Documento
                        </label>
                        <input
                          type="text"
                          value={documentId}
                          onChange={(e) => setDocumentId(e.target.value)}
                          placeholder="001-0000000-0"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="809-555-0123"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Institución / Empresa
                        </label>
                        <input
                          type="text"
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          placeholder="Empresa o Universidad"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA: Pago, Liquidación y Resumen */}
              <div className="lg:col-span-5 space-y-5">
                {/* 3. Forma de Pago o Cortesía */}
                {!isCourtesy ? (
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-primary" />
                      <span>3. Forma de Pago y Cobro *</span>
                    </label>

                    <div className="space-y-3 bg-muted/20 border border-border p-3.5 rounded-xl">
                      <div>
                        <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                          Método de Pago *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {paymentMethods.map((pm) => (
                            <button
                              key={pm.id}
                              type="button"
                              onClick={() => setPaymentMethodId(pm.id)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                paymentMethodId === pm.id
                                  ? 'bg-primary text-white border-primary shadow-sm'
                                  : 'bg-background text-foreground border-border hover:bg-muted/60'
                              }`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span className="truncate">{pm.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                            Monto Recibido *
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-[11px] font-mono text-muted-foreground">
                              RD$
                            </span>
                            <CurrencyInput
                              min="0"
                              step="any"
                              required
                              value={amountReceived}
                              onValueChange={setAmountReceived}
                              className="w-full pl-10 pr-2.5 py-1.5 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                            Monto a Cobrar *
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-[11px] font-mono text-muted-foreground">
                              RD$
                            </span>
                            <CurrencyInput
                              min="0"
                              max={ticketPrice}
                              step="any"
                              required
                              value={amountPaid}
                              onValueChange={setAmountPaid}
                              className="w-full pl-10 pr-2.5 py-1.5 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Resumen Financiero Dinámico */}
                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/80 text-center text-xs">
                        <div className="p-2 rounded-lg bg-background border border-border">
                          <span className="text-[9px] uppercase font-mono text-muted-foreground block">
                            Tarifa
                          </span>
                          <span className="font-mono font-bold text-foreground text-[11px]">
                            RD$ {ticketPrice.toFixed(0)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-background border border-border">
                          <span className="text-[9px] uppercase font-mono text-muted-foreground block">
                            Recibido
                          </span>
                          <span className="font-mono font-bold text-foreground text-[11px]">
                            RD$ {amountReceived.toFixed(0)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                          <span className="text-[9px] uppercase font-mono text-emerald-400 block font-semibold">
                            Cambio
                          </span>
                          <span className="font-mono font-bold text-emerald-400 text-[11px]">
                            RD$ {changeDue.toFixed(0)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                          <span className="text-[9px] uppercase font-mono text-amber-400 block font-semibold">
                            Balance
                          </span>
                          <span className="font-mono font-bold text-amber-400 text-[11px]">
                            RD$ {balanceDue.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>3. Registro de Cortesía (RD$ 0.00)</span>
                    </label>

                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-3 text-amber-300">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Tarifa: RD$ 0.00</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">
                          Exento de Pago
                        </span>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-semibold text-amber-400/80 mb-1">
                          Autorizado Por *
                        </label>
                        <input
                          type="text"
                          required
                          value={courtesyAuthorizedBy}
                          onChange={(e) => setCourtesyAuthorizedBy(e.target.value)}
                          className="w-full px-3 py-2 bg-background border border-amber-500/30 rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-semibold text-amber-400/80 mb-1">
                          Motivo / Justificación *
                        </label>
                        <input
                          type="text"
                          required
                          value={courtesyReason}
                          onChange={(e) => setCourtesyReason(e.target.value)}
                          placeholder="ej. Ponente, Patrocinador, Prensa..."
                          className="w-full px-3 py-2 bg-background border border-amber-500/30 rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Notas de la Venta */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                    Notas adicionales
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones de recepción o facturación..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción Accesibles y Fijos */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-muted/20 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando Venta...</span>
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  <span>Completar Venta y Generar Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
