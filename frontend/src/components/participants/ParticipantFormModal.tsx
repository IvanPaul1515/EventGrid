import React, { useState, useEffect } from 'react';
import { Registration, PaymentMethod, SalesResponsible, TicketType } from '../../types';
import { useEdition } from '../../context/EditionContext';
import { api } from '../../services/api';
import {
  X,
  User,
  CreditCard,
  Mail,
  Phone,
  FileText,
  AlertCircle,
  Save,
  Plus,
  Tag,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface ParticipantFormModalProps {
  isOpen: boolean;
  registrationToEdit: Registration | null;
  onClose: () => void;
  onSuccess: (saved: Registration) => void;
}

export const ParticipantFormModal: React.FC<ParticipantFormModalProps> = ({
  isOpen,
  registrationToEdit,
  onClose,
  onSuccess,
}) => {
  const { currentEvent } = useEdition();

  // Estados del formulario
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [institution, setInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');

  // Tarifas y estado financiero
  const [ticketTypeId, setTicketTypeId] = useState<string>('');
  const [ticketPrice, setTicketPrice] = useState<number>(1750);
  const [amountPaid, setAmountPaid] = useState<number>(1750);
  const [saleTimestamp, setSaleTimestamp] = useState<string>('');

  const [isVerified, setIsVerified] = useState(true);
  const [isCourtesy, setIsCourtesy] = useState(false);
  const [courtesyAuthorizedBy, setCourtesyAuthorizedBy] = useState('');
  const [courtesyReason, setCourtesyReason] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [salesResponsibleId, setSalesResponsibleId] = useState<string>('');
  const [status, setStatus] = useState<string>('CONFIRMED');
  const [notes, setNotes] = useState('');

  // Catálogos de la edición
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [salesResponsibles, setSalesResponsibles] = useState<SalesResponsible[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar catálogos de métodos de pago, responsables y tipos de entrada para la edición activa
  useEffect(() => {
    if (currentEvent && isOpen) {
      api
        .get(`/events/${currentEvent.id}`)
        .then((res) => {
          if (res.data.data) {
            setPaymentMethods(res.data.data.paymentMethods || []);
            setSalesResponsibles(res.data.data.salesResponsibles || []);
            const tts: TicketType[] = res.data.data.ticketTypes || [];
            setTicketTypes(tts);

            // Si es un registro nuevo y aún no hay tipo seleccionado, inicializar con el primer tipo activo
            if (!registrationToEdit && tts.length > 0) {
              const defT =
                tts.find((t) => Number(t.price) > 0 && !t.name.toLowerCase().includes('preventa')) ||
                tts[0];
              if (defT) {
                setTicketTypeId(defT.id);
                setTicketPrice(Number(defT.price));
                setAmountPaid(Number(defT.price));
              }
            }
          }
        })
        .catch(console.error);
    }
  }, [currentEvent, isOpen]);

  // Inicializar campos según creación o edición
  useEffect(() => {
    if (registrationToEdit) {
      const p = registrationToEdit.participant;
      setFirstName(p.firstName || '');
      setLastName(p.lastName || '');
      setDocumentId(p.documentId || '');
      setInstitution(p.institution || '');
      setEmail(p.email || '');
      setPhone(p.phone || '');
      setAlternatePhone(p.alternatePhone || '');
      setRegistrationNumber(registrationToEdit.registrationNumber || '');

      const initialTicketPrice = Number(
        registrationToEdit.ticketPrice ?? registrationToEdit.totalAmount ?? 0
      );
      const initialAmountPaid = Number(
        registrationToEdit.amountPaid ?? registrationToEdit.totalAmount ?? 0
      );
      setTicketTypeId(registrationToEdit.ticketTypeId || '');
      setTicketPrice(initialTicketPrice);
      setAmountPaid(initialAmountPaid);

      setSaleTimestamp(
        registrationToEdit.saleTimestamp
          ? new Date(registrationToEdit.saleTimestamp).toISOString().slice(0, 16)
          : ''
      );

      setIsVerified(registrationToEdit.isVerified || false);
      setIsCourtesy(Boolean(registrationToEdit.isCourtesy));
      setCourtesyAuthorizedBy(registrationToEdit.courtesyAuthorizedBy || '');
      setCourtesyReason(registrationToEdit.courtesyReason || '');
      setPaymentMethodId(registrationToEdit.paymentMethodId || '');
      setSalesResponsibleId(registrationToEdit.salesResponsibleId || '');
      setStatus(registrationToEdit.status || 'CONFIRMED');
      setNotes(registrationToEdit.notes || '');
    } else {
      setFirstName('');
      setLastName('');
      setDocumentId('');
      setInstitution('');
      setEmail('');
      setPhone('');
      setAlternatePhone('');
      setRegistrationNumber('');
      setTicketTypeId('');
      setTicketPrice(1750);
      setAmountPaid(1750);
      setSaleTimestamp(new Date().toISOString().slice(0, 16));
      setIsVerified(true);
      setIsCourtesy(false);
      setCourtesyAuthorizedBy('');
      setCourtesyReason('');
      setPaymentMethodId('');
      setSalesResponsibleId('');
      setStatus('CONFIRMED');
      setNotes('');
    }
    setError(null);
  }, [registrationToEdit, isOpen]);

  if (!isOpen) return null;

  // Manejo de cambio en el selector de tipo de entrada
  const handleTicketTypeChange = (newTicketId: string) => {
    setTicketTypeId(newTicketId);
    const selected = ticketTypes.find((t) => t.id === newTicketId);
    if (selected) {
      const price = Number(selected.price);
      setTicketPrice(price);
      if (price === 0 || selected.name.toLowerCase().includes('cortes')) {
        setIsCourtesy(true);
        setAmountPaid(0);
      } else {
        setIsCourtesy(false);
        // Si el monto pagado coincidía con la tarifa previa o estaba en 0, sincronizar con la nueva tarifa
        if (amountPaid === 0 || amountPaid === ticketPrice) {
          setAmountPaid(price);
        }
      }
    }
  };

  const balanceDue = isCourtesy ? 0 : Math.max(0, ticketPrice - amountPaid);
  const overpaidAmount = isCourtesy ? 0 : Math.max(0, amountPaid - ticketPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      firstName,
      lastName,
      documentId: documentId.trim() || null,
      institution: institution.trim() || null,
      email,
      phone: phone.trim() || null,
      alternatePhone: alternatePhone.trim() || null,
      registrationNumber: registrationNumber.trim() || null,
      ticketTypeId: ticketTypeId || null,
      ticketPrice: isCourtesy ? 0 : Number(ticketPrice),
      amountPaid: isCourtesy ? 0 : Number(amountPaid),
      totalAmount: isCourtesy ? 0 : Number(amountPaid),
      balanceDue: isCourtesy ? 0 : Math.max(0, Number(ticketPrice) - Number(amountPaid)),
      saleTimestamp: saleTimestamp ? new Date(saleTimestamp).toISOString() : undefined,
      isVerified,
      isCourtesy,
      courtesyAuthorizedBy: isCourtesy ? courtesyAuthorizedBy.trim() || null : null,
      courtesyReason: isCourtesy ? courtesyReason.trim() || null : null,
      paymentMethodId: paymentMethodId || null,
      salesResponsibleId: salesResponsibleId || null,
      status,
      notes: notes.trim() || null,
    };

    try {
      let res;
      if (registrationToEdit) {
        res = await api.put(`/participants/${registrationToEdit.id}`, payload);
      } else {
        res = await api.post('/participants', payload);
      }
      onSuccess(res.data.data);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al guardar el participante';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h3 className="text-lg font-black text-foreground">
              {registrationToEdit ? 'Editar Información del Participante' : 'Nuevo Registro de Participante'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edición en contexto: <strong className="text-primary">{currentEvent?.name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Fila 1: Nombres y Apellidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Nombres *
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ej. Marcos"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Apellidos *
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ej. Taveras Gómez"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Fila 2: Documento y Correo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Cédula / Documento de Identidad
              </label>
              <input
                type="text"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="ej. 031-0198274-1"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Correo Electrónico *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Fila 3: Teléfonos e Institución */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Teléfono Principal
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="809-580-1962"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Teléfono Alternativo
              </label>
              <input
                type="text"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="829-445-1029"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Institución / Empresa
              </label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="ej. Empresa, Instituto, Universidad"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <span className="text-[11px] font-mono text-primary uppercase font-bold tracking-wider">
              Datos de la Inscripción y Tarifa en {currentEvent?.name}
            </span>
          </div>

          {/* Fila 4: Tipo de Entrada, Tarifa y Fecha de Venta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>Tipo de Entrada</span>
              </label>
              <select
                value={ticketTypeId}
                onChange={(e) => handleTicketTypeChange(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Seleccionar Tarifa --</option>
                {ticketTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name} — RD$ {Number(tt.price).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Tarifa del Boleto (RD$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isCourtesy}
                value={isCourtesy ? 0 : ticketPrice}
                onChange={(e) => setTicketPrice(Number(e.target.value))}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted' : ''
                }`}
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Precio oficial del boleto
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Monto Pagado (RD$)</span>
                {isCourtesy && <span className="text-[10px] text-amber-400 font-bold">Cortesía</span>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isCourtesy}
                value={isCourtesy ? 0 : amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted' : ''
                }`}
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Total efectivamente abonado
              </span>
            </div>
          </div>

          {/* Panel Dinámico Financiero (Saldo a Favor o Balance Pendiente) */}
          {!isCourtesy && (
            <div>
              {overpaidAmount > 0 ? (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      ¡El participante pagó más de la tarifa! Saldo a favor:{' '}
                      <strong className="text-white font-mono">+RD$ {overpaidAmount.toFixed(2)}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmountPaid(ticketPrice)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Ajustar pago a la nueva tarifa (RD$ {ticketPrice.toFixed(2)})
                  </button>
                </div>
              ) : balanceDue > 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Balance pendiente por pagar:{' '}
                      <strong className="text-white font-mono">RD$ {balanceDue.toFixed(2)}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmountPaid(ticketPrice)}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Liquidar completo (RD$ {ticketPrice.toFixed(2)})
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pago liquidado exacto (RD$ {ticketPrice.toFixed(2)})</span>
                </div>
              )}
            </div>
          )}

          {/* Fila 5: Número de Registro, Fecha de Compra y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Número de Registro
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="Vacío para autogenerar"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Prefijo: {currentEvent?.settings?.registrationPrefix || 'BC26-'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Fecha de Compra</span>
              </label>
              <input
                type="datetime-local"
                value={saleTimestamp}
                onChange={(e) => setSaleTimestamp(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Fecha en que se adquirió la boleta
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Estado de Confirmación
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="CONFIRMED">Confirmado</option>
                <option value="PENDING">Pendiente</option>
                <option value="ATTENDED">Asistió al Evento</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Toggle de Cortesía */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCourtesy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsCourtesy(checked);
                    if (checked) {
                      setAmountPaid(0);
                    } else if (amountPaid === 0) {
                      setAmountPaid(ticketPrice);
                    }
                  }}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-background border-border"
                />
                <span className="text-xs font-bold text-amber-300">
                  Registrar como Entrada de Cortesía (RD$ 0.00)
                </span>
              </label>
              <span className="text-[10px] text-amber-400/80 font-mono">
                Excluido de la recaudación neta
              </span>
            </div>

            {isCourtesy && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-500/20">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200 mb-1">
                    Autorizado Por *
                  </label>
                  <input
                    type="text"
                    value={courtesyAuthorizedBy}
                    onChange={(e) => setCourtesyAuthorizedBy(e.target.value)}
                    placeholder="ej. Comité Organizador / Patrocinador"
                    required={isCourtesy}
                    className="w-full px-3 py-1.5 bg-background border border-amber-500/30 rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200 mb-1">
                    Motivo de la Cortesía
                  </label>
                  <input
                    type="text"
                    value={courtesyReason}
                    onChange={(e) => setCourtesyReason(e.target.value)}
                    placeholder="ej. Ponente, Becado, Voluntario, Prensa"
                    className="w-full px-3 py-1.5 bg-background border border-amber-500/30 rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fila 5: Forma de pago y Responsable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Forma de Pago
              </label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- No especificada --</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Responsable de Venta
              </label>
              <select
                value={salesResponsibleId}
                onChange={(e) => setSalesResponsibleId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Comité Organizador --</option>
                {salesResponsibles.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.name} {sr.role ? `(${sr.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Verificación de Pago Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isVerifiedCheck"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary bg-background border-border"
            />
            <label htmlFor="isVerifiedCheck" className="text-xs font-medium text-foreground cursor-pointer">
              Marcar pago como <strong>verificado / recibido</strong> en cuentas o caja
            </label>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Notas u Observaciones
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas del registro (ej. beca estudiantil, propuesta de charla)..."
              rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{registrationToEdit ? 'Guardar Cambios' : 'Registrar Participante'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
