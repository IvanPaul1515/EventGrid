import React, { useState, useEffect } from 'react';
import { Registration, PaymentMethod, SalesResponsible } from '../../types';
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
  const [totalAmount, setTotalAmount] = useState<number>(500);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar catálogos de métodos de pago y responsables para la edición activa
  useEffect(() => {
    if (currentEvent && isOpen) {
      api.get(`/events/${currentEvent.id}`).then((res) => {
        if (res.data.data) {
          setPaymentMethods(res.data.data.paymentMethods || []);
          setSalesResponsibles(res.data.data.salesResponsibles || []);
        }
      }).catch(console.error);
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
      setTotalAmount(Number(registrationToEdit.totalAmount) || 0);
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
      setTotalAmount(500);
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
      totalAmount: isCourtesy ? 0 : Number(totalAmount),
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
                placeholder="m.taveras@pucmm.edu.do"
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
                placeholder="ej. PUCMM, ITLA, Claro"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <span className="text-[11px] font-mono text-primary uppercase font-bold tracking-wider">
              Datos de la Inscripción en {currentEvent?.name}
            </span>
          </div>

          {/* Fila 4: Ticket, Monto y Estado */}
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
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Pago Total (RD$)</span>
                {isCourtesy && <span className="text-[10px] text-amber-400 font-bold">Cortesía (RD$ 0.00)</span>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isCourtesy}
                value={isCourtesy ? 0 : totalAmount}
                onChange={(e) => setTotalAmount(Number(e.target.value))}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted' : ''
                }`}
              />
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
                      setTotalAmount(0);
                    } else if (totalAmount === 0) {
                      setTotalAmount(500);
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
