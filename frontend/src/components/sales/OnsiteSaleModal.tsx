import React, { useState, useEffect } from 'react';
import { TicketType, PaymentMethod, Registration } from '../../types';
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
  ArrowRight,
  Eye,
} from 'lucide-react';

interface OnsiteSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketTypes: TicketType[];
  paymentMethods: PaymentMethod[];
  onSaleSuccess: (saleData: OnsiteSaleResponse, openDrawer?: boolean) => void;
}

export const OnsiteSaleModal: React.FC<OnsiteSaleModalProps> = ({
  isOpen,
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
  const [completedSale, setCompletedSale] = useState<OnsiteSaleResponse | null>(null);

  // Inicializar tipo de entrada por defecto
  useEffect(() => {
    if (isOpen) {
      setCompletedSale(null);
      setError(null);
      const defaultTicket = ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa')) || ticketTypes[0];
      if (defaultTicket) {
        setSelectedTicketTypeId(defaultTicket.id);
        setAmountReceived(defaultTicket.price);
        setAmountPaid(defaultTicket.price);
      }
      const defaultPm = paymentMethods.find((p) => p.name.toLowerCase().includes('efectivo')) || paymentMethods[0];
      if (defaultPm) {
        setPaymentMethodId(defaultPm.id);
      }
    }
  }, [isOpen, ticketTypes, paymentMethods]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      setCompletedSale(response);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al procesar la venta presencial');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setDocumentId('');
    setPhone('');
    setAlternatePhone('');
    setInstitution('');
    setNotes('');
    setCompletedSale(null);
    setError(null);
    const defaultTicket = ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa')) || ticketTypes[0];
    if (defaultTicket) {
      setSelectedTicketTypeId(defaultTicket.id);
      setAmountReceived(defaultTicket.price);
      setAmountPaid(defaultTicket.price);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col justify-between">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <ShoppingBag className="w-5 h-5 shrink-0" />
            <span>Punto de Venta Presencial — BarCamp RD</span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pantalla de Éxito posterior a la Venta */}
        {completedSale ? (
          <div className="py-6 space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                ¡Venta Registrada Exitosamente!
              </span>
              <h3 className="text-xl font-black text-foreground mt-1">
                {completedSale.registration.participant.fullName}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {completedSale.registration.participant.institution || 'Participante General'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border max-w-md mx-auto grid grid-cols-2 gap-3 text-left">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Número de Ticket
                </span>
                <span className="text-lg font-mono font-black text-primary">
                  {completedSale.registration.registrationNumber}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Tipo de Entrada
                </span>
                <span className="text-xs font-bold text-foreground">
                  {completedSale.registration.ticketType?.name || 'General'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Monto Cobrado
                </span>
                <span className="text-sm font-mono font-black text-foreground">
                  RD$ {completedSale.financials.amountPaid.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Cambio Devuelto
                </span>
                <span className="text-sm font-mono font-black text-emerald-400">
                  RD$ {completedSale.financials.changeDue.toFixed(2)}
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              La inscripción ha quedado guardada en PostgreSQL. Según las normas de recepción, debe abrir la ficha para revisar sus datos y marcar su llegada.
            </p>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  onSaleSuccess(completedSale, true);
                  onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Abrir Ficha para Marcar Asistencia</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaleSuccess(completedSale, false);
                  resetForm();
                }}
                className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border cursor-pointer"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 space-y-4 py-3">
            {/* Selección de Tipo de Entrada */}
            <div>
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                1. Seleccionar Tipo de Entrada *
              </label>
              <div className="grid grid-cols-3 gap-2.5">
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
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                          : 'border-border bg-background hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">{tt.name}</span>
                        {isCur && (
                          <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/20 text-amber-400">
                            Cortesía
                          </span>
                        )}
                      </div>
                      <span className="text-base font-black font-mono text-primary">
                        RD$ {tt.price.toFixed(2)}
                      </span>
                      {tt.description && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tt.description}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Datos del Participante */}
            <div>
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                2. Información del Participante
              </label>
              <div className="grid grid-cols-2 gap-3">
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2.5">
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="carlos.perez@email.com"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                    Cédula / Documento ID
                  </label>
                  <input
                    type="text"
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    placeholder="402-XXXXXXX-X"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2.5">
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                    Institución / Empresa / Universidad
                  </label>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="ej. Empresa, Organización, Independiente"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase font-semibold mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="809-XXX-XXXX"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Configuración de Cobro y Pago */}
            {!isCourtesy ? (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
                  3. Información de Pago y Liquidación
                </label>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase font-semibold mb-1">
                      Forma de Pago *
                    </label>
                    <select
                      value={paymentMethodId}
                      onChange={(e) => setPaymentMethodId(e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {paymentMethods
                        .filter((pm) => !pm.name.toLowerCase().includes('cortes'))
                        .map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase font-semibold mb-1">
                      Monto Recibido (RD$)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase font-semibold mb-1">
                      Monto a Cobrar / Abonar (RD$)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-xl text-xs font-mono font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Resumen Financiero Dinámico */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/80 text-center text-xs">
                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-[9px] uppercase font-mono text-muted-foreground block">Tarifa</span>
                    <span className="font-mono font-bold text-foreground">RD$ {ticketPrice.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-[9px] uppercase font-mono text-muted-foreground block">Recibido</span>
                    <span className="font-mono font-bold text-foreground">RD$ {amountReceived.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                    <span className="text-[9px] uppercase font-mono text-emerald-400 block font-semibold">Cambio</span>
                    <span className="font-mono font-bold text-emerald-400">RD$ {changeDue.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                    <span className="text-[9px] uppercase font-mono text-amber-400 block font-semibold">Balance</span>
                    <span className="font-mono font-bold text-amber-400">RD$ {balanceDue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-amber-300">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>Cortesía — Tarifa RD$ 0.00</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-amber-400/80 mb-1">
                      Autorizado Por *
                    </label>
                    <input
                      type="text"
                      required
                      value={courtesyAuthorizedBy}
                      onChange={(e) => setCourtesyAuthorizedBy(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-amber-500/30 rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                      placeholder="ej. Ponente, Beca corporativa..."
                      className="w-full px-2.5 py-1.5 bg-background border border-amber-500/30 rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Receipt className="w-4 h-4" />
                    <span>Completar Venta y Generar Ticket</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
