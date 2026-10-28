import {Link} from 'react-router-dom';
import {ReceiptReader} from '../sales/ReceiptReader';
import {receiptRegistrationDraft} from '../../utils/receiptOcr';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Registration, PaymentMethod, SalesResponsible, TicketType } from '../../types';
import { useAuth } from '../../context/AuthContext';
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
  CheckCircle2,
} from 'lucide-react';

interface ParticipantFormModalProps {
  onScanList?:()=>void;
  initialReceipt?: boolean;
  isOpen: boolean;
  registrationToEdit: Registration | null;
  onClose: () => void;
  onSuccess: (saved: Registration) => void;
}

export const ParticipantFormModal: React.FC<ParticipantFormModalProps> = ({
  isOpen,
  initialReceipt = false,
  onScanList,
  registrationToEdit,
  onClose,
  onSuccess,
}) => {
  const { currentEvent } = useEdition();
  const { user } = useAuth();
  const [requestCourtesy, setRequestCourtesy] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const [requestSent, setRequestSent] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');

  // Estados del formulario
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [institution, setInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [numberChangeReason, setNumberChangeReason] = useState('');
  const [responsibleChangeReason, setResponsibleChangeReason] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  useEffect(() => { setNumberChangeReason(''); setResponsibleChangeReason(''); }, [isOpen, registrationToEdit?.id]);

  // Tarifas y estado financiero
  const [ticketTypeId, setTicketTypeId] = useState<string>('');
  const [ticketPrice, setTicketPrice] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [readingReceipt,setReadingReceipt]=useState(false);
  const [historical,setHistorical]=useState(false);
  const [purchaseDate,setPurchaseDate]=useState(''),[purchaseTime,setPurchaseTime]=useState(''),[sourceTimezone,setSourceTimezone]=useState('');
  const [receiptReference,setReceiptReference]=useState(''),[historicalPaymentConfirmed,setHistoricalPaymentConfirmed]=useState(false);

  const [isVerified, setIsVerified] = useState(false);
  const [isCourtesy, setIsCourtesy] = useState(false);
  const [courtesyAuthorizedBy, setCourtesyAuthorizedBy] = useState('');
  const [courtesyReason, setCourtesyReason] = useState('');
  const [exceptionType, setExceptionType] = useState('COURTESY');
  const [agreementReference, setAgreementReference] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [salesResponsibleId, setSalesResponsibleId] = useState<string>('');
  const [status, setStatus] = useState<string>('PENDING');
  const [notes, setNotes] = useState('');

  // Catálogos de la edición
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [salesResponsibles, setSalesResponsibles] = useState<SalesResponsible[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar catálogos de métodos de pago, responsables y tipos de entrada para la edición activa
  useEffect(() => {
    let active = true;
    if (currentEvent && isOpen) {
      setCatalogLoading(true);
      api
        .get(`/events/${currentEvent.id}`)
        .then((res) => {
          if (active && res.data.data) {
            const methods: PaymentMethod[] = (res.data.data.paymentMethods || []).filter((method: PaymentMethod) => !method.name.toLowerCase().includes('cortes'));
            const paymentOrder = (name: string) => /efectivo|cash/i.test(name) ? 0 : /tarjeta|card/i.test(name) ? 1 : 2;
            methods.sort((a, b) => paymentOrder(a.name) - paymentOrder(b.name));
            setPaymentMethods(methods);
            if (!registrationToEdit) setPaymentMethodId(methods.find(method => /efectivo|cash/i.test(method.name))?.id || '');
            setSalesResponsibles(res.data.data.salesResponsibles || []);
            const tts: TicketType[] = (res.data.data.ticketTypes || []).filter((tt: TicketType) => tt.isActive !== false || tt.id === registrationToEdit?.ticketTypeId);
            setTicketTypes(tts);

            // Si es un registro nuevo y aún no hay tipo seleccionado, inicializar con el primer tipo activo
            if (!registrationToEdit && tts.length > 0) {
              const defT = tts.find(t => t.id === res.data.data.defaultTicketTypeId && t.isActive && Number(t.price) > 0);
              if (defT) {
                setTicketTypeId(defT.id);
                setTicketPrice(Number(defT.price));
                setAmountPaid(0);
              }
            }
          }
        })
        .catch(() => { if (active) setError('No se pudieron cargar las tarifas. Reabra el formulario para reintentar.'); }).finally(() => { if (active) setCatalogLoading(false); });
    }
    return () => { active = false; };
  }, [currentEvent?.id, isOpen]);

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

      setIsVerified(registrationToEdit.isVerified || false);
      setIsCourtesy(Boolean(registrationToEdit.isCourtesy));
      setCourtesyAuthorizedBy(registrationToEdit.courtesyAuthorizedBy || '');
      setCourtesyReason(registrationToEdit.courtesyReason || '');
      setPaymentMethodId(registrationToEdit.paymentMethodId || '');
      setSalesResponsibleId(registrationToEdit.salesResponsibleId || '');
      setStatus(String(registrationToEdit.status) === 'ATTENDED' ? 'CONFIRMED' : registrationToEdit.status || 'PENDING');
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
      setTicketPrice(0);
      setAmountPaid(0);
      setHistorical(false);setPurchaseDate('');setPurchaseTime('');setSourceTimezone('');setReceiptReference('');setHistoricalPaymentConfirmed(false);setReadingReceipt(initialReceipt);
      setIsVerified(false);
      setIsCourtesy(false);
      setCourtesyAuthorizedBy('');
      setCourtesyReason('');
      setPaymentMethodId('');
      setSalesResponsibleId('');
      setStatus('PENDING');
      setNotes('');
    }
    setError(null);
    setRequestCourtesy(false);
    setRequestSent(false);
    setRequestMessage('');
    requestKey.current = crypto.randomUUID();
  }, [registrationToEdit, isOpen, initialReceipt, currentEvent?.id]);

  // Comprobar si el formulario tiene cambios sin guardar para evitar pérdidas accidentales (Sección 6)
  const isFormDirty = !requestSent && Boolean(
    firstName.trim() ||
    lastName.trim() ||
    email.trim() ||
    documentId.trim() ||
    phone.trim() ||
    institution.trim() ||
    notes.trim() || receiptReference.trim() || purchaseDate || purchaseTime ||
    courtesyReason.trim()
  );

  const handleRequestClose = () => {
    if (loading) return;
    if (!registrationToEdit && isFormDirty) {
      const confirmDiscard = window.confirm(
        'Tiene cambios sin guardar en el formulario de participante. ¿Está seguro de que desea salir sin guardar?'
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen || readingReceipt) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, loading, isFormDirty, registrationToEdit, readingReceipt]);

  if (!isOpen) return null;

  const toggleCourtesy = () => {
    if (isCourtesy) {
      setIsCourtesy(false);
      if (!registrationToEdit || registrationToEdit.isCourtesy) {
        const official = ticketTypes.find(t => t.id === currentEvent?.defaultTicketTypeId && t.isActive && Number(t.price)>0);
        setTicketTypeId(official?.id || ''); setTicketPrice(Number(official?.price || 0));
      }
      return;
    }
    if (user?.role === 'ADMIN') { setIsCourtesy(true); setAmountPaid(0); setCourtesyAuthorizedBy(user.fullName); }
    else if (user?.role === 'OPERATOR') { setRequestCourtesy(value => !value); setAmountPaid(0); }
  };

  const balanceDue = isCourtesy ? 0 : Math.max(0, ticketPrice - amountPaid);
  const overpaidAmount = isCourtesy ? 0 : Math.max(0, amountPaid - ticketPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving.current || catalogLoading || requestSent) return;
    if (!isCourtesy && !ticketTypeId && !registrationToEdit) { setError('Configure una tarifa oficial activa para esta edición.'); return; }
    saving.current = true;
    setLoading(true);
    setError(null);

    const payload: any = {
      firstName,
      lastName,
      documentId: documentId.trim() || null,
      institution: institution.trim() || null,
      email,
      phone: phone.trim() || null,
      alternatePhone: alternatePhone.trim() || null,
      registrationNumber: registrationToEdit && user?.role === 'ADMIN' ? registrationNumber.trim() || undefined : undefined,
      numberChangeReason: numberChangeReason.trim() || undefined,
      responsibleChangeReason: responsibleChangeReason.trim() || undefined,
      ticketTypeId: ticketTypeId || null,
      ticketPrice: isCourtesy ? 0 : Number(ticketPrice),
      amountPaid: isCourtesy ? 0 : Number(amountPaid),
      totalAmount: isCourtesy ? 0 : Number(amountPaid),
      balanceDue: isCourtesy ? 0 : Math.max(0, Number(ticketPrice) - Number(amountPaid)),
      ...(!registrationToEdit ? {purchaseOrigin:historical?'HISTORICAL_ONSITE':'EVENTGRID',...(historical?{purchaseDate,purchaseTime,sourceTimezone,receiptReference,historicalPaymentConfirmed}:{})} : {}),
      isVerified,
      isCourtesy,
      courtesyAuthorizedBy: isCourtesy ? courtesyAuthorizedBy.trim() || null : null,
      courtesyReason: isCourtesy ? courtesyReason.trim() || null : null,
      paymentMethodId: isCourtesy ? null : (paymentMethodId || null),
      salesResponsibleId: isCourtesy ? null : (salesResponsibleId || null),
      status,
      notes: notes.trim() || null,
    };

    if (requestCourtesy && user?.role === 'OPERATOR') {
      try {
        if (courtesyReason.trim().length < 3) throw new Error('Indique un motivo de al menos 3 caracteres.');
        const response = await api.post('/participants/courtesy-requests', { requestKey: requestKey.current, reason: courtesyReason.trim(), exceptionType, agreementReference: agreementReference.trim() || undefined, ...(registrationToEdit ? { registrationId: registrationToEdit.id } : { registration: { ...payload, isCourtesy: false, amountPaid: 0, totalAmount: 0, status: 'PENDING' } }) });
        setRequestSent(true);
        setRequestMessage(response.data.data?.status === 'APPROVED' ? 'Cortesía aprobada.' : response.data.data?.status === 'REJECTED' ? 'Cortesía rechazada.' : 'Solicitud enviada. Pendiente de autorización.');
        window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      } catch (err: any) { setError(err.response?.data?.message || err.message || 'No se pudo confirmar la solicitud. Consulte sus solicitudes antes de reintentar.'); }
      finally { saving.current = false; setLoading(false); }
      return;
    }
    if (registrationToEdit) { delete payload.amountPaid; delete payload.totalAmount; delete payload.balanceDue; }
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
      saving.current = false;
      setLoading(false);
    }
  };

  if (readingReceipt && !registrationToEdit) return <ReceiptReader onClose={()=>setReadingReceipt(false)} onUse={draft=>{const proposal=receiptRegistrationDraft(draft);if(proposal.firstName)setFirstName(proposal.firstName);if(proposal.lastName)setLastName(proposal.lastName);setHistorical(true);setPurchaseDate(proposal.purchaseDate);setPurchaseTime(proposal.purchaseTime);setSourceTimezone('');setReceiptReference(proposal.receiptReference);setHistoricalPaymentConfirmed(false);if(proposal.proposedAmount!==null)setAmountPaid(proposal.proposedAmount);const methods=paymentMethods.filter(m=>draft.method&&m.name.toLowerCase().includes(draft.method.toLowerCase()));if(methods.length===1)setPaymentMethodId(methods[0].id);setReadingReceipt(false);}}/>;
  return createPortal(
    <div className="mobile-safe-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200" onClick={handleRequestClose}>
      <div className="bg-card border border-border w-full h-full max-sm:max-h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl lg:max-w-4xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-muted/30">
          <div>
            <h3 className="text-lg font-black text-foreground">
              {registrationToEdit ? 'Editar Información del Participante' : 'Nuevo Registro de Participante'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edición en contexto: <strong className="text-primary">{currentEvent?.name}</strong>
            </p>
          </div>
          <button
            onClick={handleRequestClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
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

        {requestSent && <div role="status" className="p-4 border-b border-border bg-muted text-sm">{requestMessage} Consulte el resultado en sus solicitudes antes de reintentar.</div>}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col justify-between">
          <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1 min-h-0">
          {!registrationToEdit&&<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={()=>setReadingReceipt(false)}>Agregar manualmente</button><Link className="btn-secondary" to="/import" onClick={e=>{if(isFormDirty&&!window.confirm('Ir a Excel descarta este formulario sin guardar. ¿Continuar?'))e.preventDefault();}}>Importar Excel</Link>{onScanList&&<button type="button" className="btn-secondary" onClick={()=>{if(!isFormDirty||window.confirm('Cambiar al escáner descarta este formulario sin guardar. ¿Continuar?'))onScanList();}}>Escanear lista manuscrita</button>}<button type="button" className="text-xs underline text-muted-foreground" onClick={()=>setReadingReceipt(true)}>Comprobante individual (opcional)</button></div>}
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
                type="tel"
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
                <span>Tarifa</span>
              </label>
              <output aria-label="Tarifa oficial" className="block w-full px-3 py-2 bg-muted border border-border rounded-xl text-xs font-bold text-foreground">
                {catalogLoading ? 'Cargando tarifa...' : isCourtesy ? 'Cortesía — RD$ 0.00' : ticketTypeId ? `Tarifa oficial: RD$${ticketPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sin tarifa oficial configurada'}
              </output>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Tarifa del Boleto (RD$)
              </label>
              <output className="block w-full px-3 py-2 bg-muted border border-border rounded-xl text-xs font-mono" aria-label="Precio de la tarifa">{(isCourtesy ? 0 : ticketPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</output>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Precio oficial del boleto
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Monto Pagado (RD$)</span>
                {isCourtesy && <span className="text-[10px] text-amber-400 font-bold">Cortesía</span>}
              </label>
              <CurrencyInput
                step="0.01"
                min="0"
                aria-label="Monto pagado"
                disabled={isCourtesy || requestCourtesy || Boolean(registrationToEdit)}
                value={isCourtesy ? 0 : amountPaid}
                onValueChange={setAmountPaid}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted' : ''
                }`}
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {registrationToEdit ? 'Historial conservado. Registre nuevos abonos desde Ventas o la ficha.' : 'Total efectivamente abonado'}
              </span>
            </div>
          </div>

          {/* Panel Dinámico Financiero (Saldo a Favor o Balance Pendiente) */}
          {!isCourtesy && (ticketTypeId || registrationToEdit) && (
            <div>
              {overpaidAmount > 0 ? (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      ¡El participante pagó más de la tarifa! Saldo a favor:{' '}
                      <strong className="text-white font-mono">+RD$ {overpaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(registrationToEdit)}
                    onClick={() => setAmountPaid(ticketPrice)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Ajustar pago a la nueva tarifa (RD$ {ticketPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </button>
                </div>
              ) : balanceDue > 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Balance pendiente por pagar:{' '}
                      <strong className="text-white font-mono">RD$ {balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(registrationToEdit)}
                    onClick={() => setAmountPaid(ticketPrice)}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Liquidar completo (RD$ {ticketPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pago liquidado exacto (RD$ {ticketPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                </div>
              )}
            </div>
          )}

          {/* Fila 5: Número de Registro, Fecha de Compra y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {registrationToEdit ? <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Número de Registro
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                readOnly={user?.role !== 'ADMIN'}
                placeholder="Asignado automáticamente"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Solo el administrador puede corregirlo con un motivo.
              </span>
              {user?.role === 'ADMIN' && <input aria-label="Motivo de cambio del número" placeholder="Motivo de la corrección" value={numberChangeReason} onChange={e => setNumberChangeReason(e.target.value)} className="input-field text-base" />}
            </div> : <p className="text-xs text-muted-foreground">Número interno: se asigna automáticamente al guardar.</p>}

            {!registrationToEdit ? <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm">Origen de la compra<select className="input-field" value={historical?'HISTORICAL_ONSITE':'EVENTGRID'} onChange={e=>{setHistorical(e.target.value==='HISTORICAL_ONSITE');setHistoricalPaymentConfirmed(false);}}><option value="EVENTGRID">Venta nueva en EventGrid (hora del servidor)</option><option value="HISTORICAL_ONSITE">Venta presencial histórica</option></select></label>
              {historical&&<><p className="text-xs text-muted-foreground">Fechas declaradas, pendientes de revisión administrativa. No se inventan horas ni zonas. La incorporación queda registrada por separado.</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><label className="text-xs">Fecha original<input type="date" className="input-field" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></label><label className="text-xs">Hora original (opcional)<input type="time" step="1" className="input-field" value={purchaseTime} onChange={e=>setPurchaseTime(e.target.value)}/></label><label className="text-xs">Zona conocida (opcional)<input className="input-field" placeholder="-04:00" value={sourceTimezone} onChange={e=>setSourceTimezone(e.target.value)}/></label></div><label className="block text-xs">Referencia única / número de comprobante<input required maxLength={120} className="input-field" value={receiptReference} onChange={e=>setReceiptReference(e.target.value)}/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={historicalPaymentConfirmed} onChange={e=>setHistoricalPaymentConfirmed(e.target.checked)}/>Confirmo que el monto indicado ya se recibió fuera de EventGrid. Se conciliará como pago externo, sin ingreso nuevo de caja.</label></>}
            </div> : <p className="text-xs text-muted-foreground">Las fechas originales se consultan en la ficha; sus correcciones requieren revisión administrativa con motivo en la cronología de compras.</p>}

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Estado de inscripción (no es asistencia)
              </label>
              <select
                value={status}
                disabled={loading || registrationToEdit?.status === 'CANCELLED'}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="CONFIRMED">Inscripción confirmada</option>
                <option value="PENDING">Inscripción pendiente</option>

                {registrationToEdit?.status === 'CANCELLED' && <option value="CANCELLED">Cancelado</option>}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">La confirmación corresponde a la inscripción. El pago se calcula con los abonos; la asistencia requiere check-in. Cancelar o reactivar requiere la acción administrativa de la ficha.</p>
            </div>
          </div>

          {/* Toggle de Cortesía */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <input type="checkbox" checked={isCourtesy || requestCourtesy} onChange={toggleCourtesy} disabled={loading || user?.role === 'VIEWER' || Boolean(registrationToEdit && Number(registrationToEdit.amountPaid || registrationToEdit.totalAmount) > 0)} />
              {user?.role === 'OPERATOR' ? 'Solicitar cortesía' : 'Registrar como Entrada de Cortesía'}
            </label>
            <p className="text-xs text-muted-foreground">La cortesía requiere autorización administrativa. No registra un pago ni una entrega de efectivo.</p>
            {requestCourtesy && <p className="text-xs text-muted-foreground">{firstName} {lastName} · {email} · {currentEvent?.name}. El registro seguirá pendiente con la tarifa oficial hasta que un administrador decida desde su sesión. No se registrará un pago.{registrationToEdit ? ' Esta acción solo envía la solicitud; no guarda cambios de datos personales.' : ''}</p>}
            {requestCourtesy && <div className="space-y-2">
              <label className="block text-sm">Tipo de excepción<select className="input-field text-base" value={exceptionType} onChange={e => setExceptionType(e.target.value)}><option value="COURTESY">Cortesía</option><option value="SPONSOR">Patrocinador</option><option value="GUEST">Invitado</option><option value="AGREEMENT">Acuerdo</option></select></label>
              <label className="block text-sm">Referencia del acuerdo (si aplica)<input className="input-field text-base" value={agreementReference} maxLength={250} onChange={e => setAgreementReference(e.target.value)} /></label>
            </div>}
            {(isCourtesy || requestCourtesy) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-500/20">
                {user?.role === 'ADMIN' && <div>
                  <label className="block text-[11px] font-semibold text-amber-200 mb-1">
                    Autorizado Por *
                  </label>
                  <input
                    type="text"
                    value={courtesyAuthorizedBy}
                    readOnly
                    placeholder={user?.role === 'ADMIN' ? user.fullName : 'Administrador: se validará al guardar'}
                    className="w-full px-3 py-1.5 bg-background border border-amber-500/30 rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>}
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200 mb-1">
                    Motivo de la Cortesía
                  </label>
                  <input
                    type="text"
                    required={isCourtesy || requestCourtesy}
                    minLength={3}
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
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Forma de Pago</span>
                {isCourtesy && <span className="text-[10px] text-amber-500 font-bold">No aplica</span>}
              </label>
              <select
                value={isCourtesy || requestCourtesy ? '' : paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                disabled={isCourtesy || requestCourtesy}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground' : ''
                }`}
              >
                <option value="">{isCourtesy ? 'No aplica (Cortesía institucional)' : '-- No especificada --'}</option>
                {!isCourtesy &&
                  paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Responsable de Venta</span>
                {isCourtesy && <span className="text-[10px] text-amber-500 font-bold">No aplica</span>}
              </label>
              <select
                value={isCourtesy || requestCourtesy ? '' : salesResponsibleId}
                onChange={(e) => setSalesResponsibleId(e.target.value)}
                disabled={isCourtesy || requestCourtesy || user?.role !== 'ADMIN'}
                className={`w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCourtesy ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground' : ''
                }`}
              >
                <option value="">{isCourtesy ? 'No aplica (Cortesía)' : `Responsable: ${registrationToEdit ? registrationToEdit.commercialUser?.fullName || 'No especificado' : user?.fullName || 'usuario actual'}`}</option>
                {!isCourtesy &&
                  salesResponsibles.map((sr) => (
                    <option key={sr.id} value={sr.id}>
                      {sr.name} {sr.role ? `(${sr.role})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {user?.role === 'ADMIN' && (salesResponsibleId || registrationToEdit) && <label className="block text-xs">Motivo del responsable comercial<input value={responsibleChangeReason} onChange={e => setResponsibleChangeReason(e.target.value)} className="input-field text-base" /></label>}

          {/* Verificación de Pago Toggle (Solo si no es cortesía) */}
          {!isCourtesy && (
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
          )}

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
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 shrink-0">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || requestSent || catalogLoading}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{requestCourtesy ? 'Enviar solicitud de cortesía' : registrationToEdit ? 'Guardar Cambios' : 'Registrar Participante'}</span>
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
