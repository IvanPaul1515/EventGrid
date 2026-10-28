import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  DollarSign,
  Gift,
  Calendar,
  Mail,
  Phone,
  User,
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  AlertCircle,
  Receipt,
  FileText,
} from 'lucide-react';
import { Sponsor, SponsorPayment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { RecordSponsorPaymentModal } from './RecordSponsorPaymentModal';
import { AnnullPaymentModal } from './AnnullPaymentModal';
import { SponsorFormModal } from './SponsorFormModal';
import { CreatePaymentData, UpdateSponsorData } from '../../services/sponsors.service';

interface SponsorDetailDrawerProps {
  sponsor: Sponsor | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (data: UpdateSponsorData) => Promise<void>;
  onArchive: (isArchived: boolean) => Promise<void>;
  onRegisterPayment: (sponsorId: string, data: CreatePaymentData) => Promise<void>;
  onAnnullPayment: (paymentId: string, reason: string) => Promise<void>;
}

export const SponsorDetailDrawer: React.FC<SponsorDetailDrawerProps> = ({
  sponsor,
  isOpen,
  onClose,
  onEdit,
  onArchive,
  onRegisterPayment,
  onAnnullPayment,
}) => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [paymentToAnnull, setPaymentToAnnull] = useState<SponsorPayment | null>(null);

  if (!isOpen || !sponsor) return null;

  const formatRD = (val: number) =>
    new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(val);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Pagado Completo
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Abono Parcial
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <Ban className="w-3 h-3" /> Cancelado
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Pendiente Pago
          </span>
        );
    }
  };

  const renderTierBadge = (category?: string | null) => {
    if (!category) return null;
    const catLower = category.toLowerCase();
    if (catLower.includes('gold') || catLower.includes('oro')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#d8b25a]/15 text-[#8a6414] dark:text-[#d8b25a] border border-[#d8b25a]/30">
          {category}
        </span>
      );
    }
    if (catLower.includes('silver') || catLower.includes('plata')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#c4c8ce]/15 text-[#5d6168] dark:text-[#c4c8ce] border border-[#c4c8ce]/30">
          {category}
        </span>
      );
    }
    if (catLower.includes('geek') || catLower.includes('platino') || catLower.includes('diamante')) {
      return (
        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
          {category}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
        {category}
      </span>
    );
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'TRANSFER':
        return 'Transferencia Bancaria';
      case 'CHECK':
        return 'Cheque';
      case 'CASH':
        return 'Efectivo';
      case 'CREDIT_CARD':
        return 'Tarjeta';
      default:
        return 'Otro';
    }
  };

  const percentPaid = sponsor.committedAmount > 0
    ? Math.min(100, Math.round((sponsor.receivedAmount / sponsor.committedAmount) * 100))
    : (sponsor.contributionType === 'IN_KIND' ? 100 : 0);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity cursor-pointer"
          onClick={onClose}
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-8 pointer-events-none">
          <div
            className="mobile-drawer w-screen max-w-full sm:w-[520px] md:w-[580px] lg:w-[40vw] lg:min-w-[520px] lg:max-w-[700px] h-full max-h-screen bg-card border-l border-border shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="border-b border-border bg-gradient-to-b from-primary/10 via-background to-background p-4 sm:p-6 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/25">
                    {sponsor.type === 'SPONSOR' ? 'Patrocinador Oficial' : 'Colaborador Aliado'}
                  </span>
                  {sponsor.isArchived && (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Archivado
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="px-3 py-1 rounded-full bg-primary/15 hover:bg-primary/25 text-primary text-xs font-bold border border-primary/30 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Editar datos del patrocinador"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onArchive(!sponsor.isArchived)}
                        className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                        title={sponsor.isArchived ? 'Desarchivar' : 'Archivar'}
                      >
                        {sponsor.isArchived ? (
                          <ArchiveRestore className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Title & Avatar */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-[#BA1513] flex items-center justify-center text-white font-display font-black text-xl shadow-lg ring-2 ring-primary/40 shrink-0 overflow-hidden">
                  {sponsor.logoUrl ? (
                    <img
                      src={sponsor.logoUrl}
                      alt={sponsor.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span>{sponsor.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-display font-black text-foreground truncate tracking-tight">
                      {sponsor.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {renderTierBadge(sponsor.category)}
                    {getStatusBadge(sponsor.status)}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 p-4 sm:p-6 space-y-6 overflow-y-auto">
              {/* Financial Breakdown Card */}
              <div className="p-4 rounded-3xl border bg-muted/20 border-border space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-foreground">
                      Balance Financiero (RD$)
                    </span>
                  </div>
                  {isAdmin && sponsor.status !== 'PAID' && (
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="px-3 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Registrar Pago</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] font-mono text-muted-foreground block font-medium">Comprometido</span>
                    <span className="text-sm font-mono font-black text-foreground block mt-0.5 truncate">
                      {formatRD(sponsor.committedAmount)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] font-mono text-muted-foreground block font-medium">Recibido</span>
                    <span className="text-sm font-mono font-black text-emerald-400 block mt-0.5 truncate">
                      {formatRD(sponsor.receivedAmount)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] font-mono text-muted-foreground block font-medium">Pendiente</span>
                    <span className="text-sm font-mono font-black text-primary block mt-0.5 truncate">
                      {formatRD(sponsor.pendingBalance)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-mono font-bold text-muted-foreground">
                    <span>Progreso del aporte</span>
                    <span className="text-foreground">{percentPaid}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden border border-border/70">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${percentPaid}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* In-Kind Contribution if any */}
              {(sponsor.contributionType === 'IN_KIND' || sponsor.contributionType === 'MIXED') && (
                <div className="p-4 rounded-3xl border bg-[#d8b25a]/10 border-[#d8b25a]/25 space-y-2">
                  <div className="flex items-center gap-2 text-[#8a6414] dark:text-[#d8b25a]">
                    <Gift className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                      Aporte en Especie ({sponsor.contributionType === 'MIXED' ? 'Mixto' : 'Exclusivo'})
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {sponsor.inKindDescription || 'No se especificó detalle.'}
                  </p>
                </div>
              )}

              {/* Contact Information */}
              <div className="p-4 rounded-3xl border bg-muted/10 border-border space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground block">
                  Información de Contacto
                </span>
                <div className="space-y-2 text-xs">
                  {sponsor.legalName&&<p className="text-sm break-words">Razón social: {sponsor.legalName}</p>}
                  {sponsor.rnc&&<p className="text-sm">RNC: {sponsor.rnc}</p>}
                  {sponsor.contactName && (
                    <div className="flex items-center gap-2 text-foreground">
                      <User className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold">{sponsor.contactName}</span>
                    </div>
                  )}
                  {sponsor.contactPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-primary shrink-0" />
                      <a
                        href={`tel:${sponsor.contactPhone}`}
                        className="text-foreground hover:text-primary hover:underline font-mono"
                      >
                        {sponsor.contactPhone}
                      </a>
                    </div>
                  )}
                  {sponsor.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary shrink-0" />
                      <a
                        href={`mailto:${sponsor.contactEmail}`}
                        className="text-foreground hover:text-primary hover:underline font-mono"
                      >
                        {sponsor.contactEmail}
                      </a>
                    </div>
                  )}
                  {sponsor.commitmentDate && (
                    <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>
                        Compromiso: {new Date(sponsor.commitmentDate).toLocaleDateString('es-DO', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {sponsor.notes && (
                <div className="p-4 rounded-3xl border bg-muted/10 border-border space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Notas Internas</span>
                  </div>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {sponsor.notes}
                  </p>
                </div>
              )}

              {/* Payment History Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" />
                    <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-foreground">
                      Historial de Pagos ({sponsor.payments?.length || 0})
                    </h3>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuevo Abono</span>
                    </button>
                  )}
                </div>

                {(!sponsor.payments || sponsor.payments.length === 0) ? (
                  <div className="p-6 text-center rounded-2xl border border-dashed border-border bg-muted/5 text-muted-foreground">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-medium">No se han registrado pagos para este patrocinador.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sponsor.payments.map((p) => {
                      const isAnnulled = p.status === 'ANNULLED';
                      return (
                        <div
                          key={p.id}
                          className={`p-3.5 rounded-2xl border transition-colors ${
                            isAnnulled
                              ? 'bg-rose-500/5 border-rose-500/20 opacity-70'
                              : 'bg-card border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-sm font-mono font-black ${
                                    isAnnulled ? 'line-through text-muted-foreground' : 'text-emerald-400'
                                  }`}
                                >
                                  {formatRD(p.amount)}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                                  {getPaymentMethodLabel(p.paymentMethod)}
                                </span>
                                {isAnnulled && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                                    Anulado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 font-mono text-[11px]">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(p.paymentDate).toLocaleDateString('es-DO')}
                                </span>
                                {p.reference && (
                                  <span>Ref: <strong className="text-foreground">{p.reference}</strong></span>
                                )}
                                {p.receiptNumber && (
                                  <span>Recibo: <strong className="text-foreground">{p.receiptNumber}</strong></span>
                                )}
                              </div>
                            </div>

                            {isAdmin && !isAnnulled && (
                              <button
                                type="button"
                                onClick={() => setPaymentToAnnull(p)}
                                className="px-2.5 py-1 rounded-full text-xs font-bold text-rose-400 hover:text-white hover:bg-rose-600 border border-rose-500/30 transition-colors cursor-pointer shrink-0"
                                title="Anular este pago"
                              >
                                Anular
                              </button>
                            )}
                          </div>

                          {p.notes && (
                            <p className="text-xs text-muted-foreground mt-2 italic bg-muted/30 p-2.5 rounded-xl">
                              "{p.notes}"
                            </p>
                          )}

                          {isAnnulled && p.annulledReason && (
                            <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                              <strong>Motivo anulación:</strong> {p.annulledReason}
                              {p.annulledAt && (
                                <span className="block text-[10px] font-mono text-rose-400/80 mt-0.5">
                                  Anulado el {new Date(p.annulledAt).toLocaleString('es-DO')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modales anidados */}
      <RecordSponsorPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        sponsor={sponsor}
        onConfirm={async (sponsorId, data) => {
          await onRegisterPayment(sponsorId, data);
        }}
      />

      <AnnullPaymentModal
        isOpen={Boolean(paymentToAnnull)}
        onClose={() => setPaymentToAnnull(null)}
        payment={paymentToAnnull}
        sponsorName={sponsor.name}
        onConfirm={async (paymentId, reason) => {
          await onAnnullPayment(paymentId, reason);
        }}
      />

      <SponsorFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        sponsorToEdit={sponsor}
        onSave={async (data) => {
          await onEdit(data);
        }}
      />
    </>,
    document.body
  );
};
