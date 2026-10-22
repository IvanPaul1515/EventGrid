import { createPortal } from 'react-dom';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useState, useEffect } from 'react';
import { X, Building2, DollarSign, Gift, Loader2 } from 'lucide-react';
import { Sponsor, SponsorType, ContributionType } from '../../types';
import { CreateSponsorData, UpdateSponsorData } from '../../services/sponsors.service';

interface SponsorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  sponsorToEdit?: Sponsor | null;
  onSave: (data: CreateSponsorData | UpdateSponsorData) => Promise<void>;
}

export const SponsorFormModal: React.FC<SponsorFormModalProps> = ({
  isOpen,
  onClose,
  sponsorToEdit,
  onSave,
}) => {

  const isEditing = Boolean(sponsorToEdit);

  const [name, setName] = useState('');
  const [type, setType] = useState<SponsorType>('SPONSOR');
  const [category, setCategory] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [contributionType, setContributionType] = useState<ContributionType>('MONETARY');
  const [committedAmount, setCommittedAmount] = useState<number | string>(0);
  const [inKindDescription, setInKindDescription] = useState('');
  const [commitmentDate, setCommitmentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sponsorToEdit) {
      setName(sponsorToEdit.name || '');
      setType(sponsorToEdit.type || 'SPONSOR');
      setCategory(sponsorToEdit.category || '');
      setContactName(sponsorToEdit.contactName || '');
      setContactPhone(sponsorToEdit.contactPhone || '');
      setContactEmail(sponsorToEdit.contactEmail || '');
      setLogoUrl(sponsorToEdit.logoUrl || '');
      setContributionType(sponsorToEdit.contributionType || 'MONETARY');
      setCommittedAmount(sponsorToEdit.committedAmount || 0);
      setInKindDescription(sponsorToEdit.inKindDescription || '');
      setCommitmentDate(
        sponsorToEdit.commitmentDate
          ? new Date(sponsorToEdit.commitmentDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
      setNotes(sponsorToEdit.notes || '');
    } else {
      setName('');
      setType('SPONSOR');
      setCategory('');
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setLogoUrl('');
      setContributionType('MONETARY');
      setCommittedAmount(0);
      setInKindDescription('');
      setCommitmentDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
    setError(null);
  }, [sponsorToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('El nombre del patrocinador o colaborador es obligatorio');
      return;
    }

    const numCommitted = typeof committedAmount === 'string' ? parseFloat(committedAmount) : committedAmount;
    if (contributionType !== 'IN_KIND' && (isNaN(numCommitted) || numCommitted < 0)) {
      setError('El monto comprometido debe ser un valor válido igual o mayor que cero');
      return;
    }

    if ((contributionType === 'IN_KIND' || contributionType === 'MIXED') && !inKindDescription.trim()) {
      setError('Debe especificar la descripción del aporte en especie');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const payload: CreateSponsorData = {
        name: name.trim(),
        type,
        category: category.trim() || null,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        logoUrl: logoUrl.trim() || null,
        contributionType,
        committedAmount: contributionType === 'IN_KIND' ? 0 : (numCommitted || 0),
        inKindDescription: (contributionType === 'IN_KIND' || contributionType === 'MIXED') ? inKindDescription.trim() : null,
        commitmentDate: new Date(commitmentDate),
        notes: notes.trim() || null,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar el patrocinador');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="mobile-safe-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <Building2 className="w-5 h-5 shrink-0" />
            <span>{isEditing ? 'Editar Patrocinador / Colaborador' : 'Registrar Nuevo Patrocinador o Colaborador'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Tipo y Nombre */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Tipo de Aliado <span className="text-rose-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SponsorType)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground cursor-pointer font-medium"
                disabled={loading}
              >
                <option value="SPONSOR">Patrocinador</option>
                <option value="COLLABORATOR">Colaborador</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Nombre de la Empresa o Entidad <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. AvatharTech, La Fabril, Grupo Bonanza..."
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground font-semibold"
                disabled={loading}
              />
            </div>
          </div>

          {/* Categoría / Nivel y Logo URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Nivel / Categoría
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej. Platino, Oro, Plata, Bebidas, Alimentos..."
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                URL del Logotipo (Opcional)
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          {/* Datos de Contacto */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
            <span className="text-xs font-bold text-foreground block">Datos del Contacto Directo</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre Contacto</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:border-primary outline-none text-foreground"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="809-555-1234"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:border-primary outline-none text-foreground"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:border-primary outline-none text-foreground"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Tipo de Aporte y Monto Comprometido */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Tipo de Aporte <span className="text-rose-500">*</span>
              </label>
              <select
                value={contributionType}
                onChange={(e) => setContributionType(e.target.value as ContributionType)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground cursor-pointer font-medium"
                disabled={loading}
              >
                <option value="MONETARY">Monetario (RD$)</option>
                <option value="IN_KIND">En Especie (Bienes / Servicios)</option>
                <option value="MIXED">Mixto (Monetario + Especie)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Monto Comprometido (RD$) {contributionType !== 'IN_KIND' && <span className="text-rose-500">*</span>}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">RD$</span>
                <CurrencyInput
                  step="0.01"
                  min="0"
                  disabled={contributionType === 'IN_KIND' || loading}
                  value={contributionType === 'IN_KIND' ? 0 : committedAmount}
                  onValueChange={setCommittedAmount}
                  placeholder="0.00"
                  className="w-full pl-12 pr-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none font-bold text-foreground disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Fecha de Compromiso
              </label>
              <input
                type="date"
                value={commitmentDate}
                onChange={(e) => setCommitmentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          {/* Detalle en Especie */}
          {(contributionType === 'IN_KIND' || contributionType === 'MIXED') && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <Gift className="w-4 h-4" />
                <span>Descripción del Aporte en Especie *</span>
              </div>
              <textarea
                required
                rows={2}
                value={inKindDescription}
                onChange={(e) => setInKindDescription(e.target.value)}
                placeholder="Ej. 100 camisetas impresas, catering para ponentes, sonido e iluminación para el salón principal..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-border focus:border-amber-500 outline-none text-foreground resize-none"
                disabled={loading}
              />
            </div>
          )}

          {/* Notas Internas */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Notas Internas y Observaciones
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Acuerdos especiales, condiciones de facturación, entrega de comprobantes fiscales..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground resize-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEditing ? 'Guardar Cambios' : 'Registrar Patrocinador'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
};
