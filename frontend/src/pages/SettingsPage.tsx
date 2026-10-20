import React, { useState, useEffect, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useTheme } from '../context/ThemeContext';
import { eventsService } from '../services/events.service';
import { TicketType } from '../types';
import {
  Palette,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  Eye,
  Type,
  Calendar,
  Layers,
  Upload,
  Trash2,
  Tag,
  DollarSign,
  Plus,
  Clock,
  Users,
  AlertCircle,
  FileImage,
  ToggleLeft,
  ToggleRight,
  Edit2,
  X,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentEvent, refreshEditions } = useEdition();
  const { applyCustomPalette, resetDefaultTheme } = useTheme();

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<'visual' | 'edition' | 'tickets'>('visual');

  // Identidad Visual y Colores
  const [primaryColor, setPrimaryColor] = useState('#e11d48');
  const [secondaryColor, setSecondaryColor] = useState('#881337');
  const [accentColor, setAccentColor] = useState('#f43f5e');
  const [backgroundColor, setBackgroundColor] = useState('#09090b');
  const [subtitle, setSubtitle] = useState('');
  const [prefix, setPrefix] = useState('BC26-');
  const [currencySymbol, setCurrencySymbol] = useState('RD$');

  // Datos Generales de la Edición
  const [editionName, setEditionName] = useState('');
  const [editionVenue, setEditionVenue] = useState('');
  const [editionStartDate, setEditionStartDate] = useState('');
  const [editionEndDate, setEditionEndDate] = useState('');
  const [editionMaxCapacity, setEditionMaxCapacity] = useState<number | ''>('');
  const [editionDescription, setEditionDescription] = useState('');

  // Logo de la Edición
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tipos de Entradas
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Partial<TicketType> | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);

  // Estados de carga y feedback
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Inicializar estados con el evento activo
  useEffect(() => {
    if (currentEvent) {
      setEditionName(currentEvent.name || '');
      setEditionVenue(currentEvent.venue || '');
      setEditionDescription(currentEvent.description || '');
      setEditionMaxCapacity(currentEvent.maxCapacity ?? '');

      if (currentEvent.startDate) {
        const d = new Date(currentEvent.startDate);
        setEditionStartDate(d.toISOString().slice(0, 16));
      }
      if (currentEvent.endDate) {
        const d = new Date(currentEvent.endDate);
        setEditionEndDate(d.toISOString().slice(0, 16));
      }

      if (currentEvent.settings) {
        setPrimaryColor(currentEvent.settings.primaryColor || '#e11d48');
        setSecondaryColor(currentEvent.settings.secondaryColor || '#881337');
        setAccentColor(currentEvent.settings.accentColor || '#f43f5e');
        setBackgroundColor(currentEvent.settings.backgroundColor || '#09090b');
        setSubtitle(currentEvent.settings.subtitle || 'PUCMM — Santiago de los Caballeros');
        setPrefix(currentEvent.settings.registrationPrefix || 'BC26-');
        setCurrencySymbol(currentEvent.settings.currencySymbol || 'RD$');
        setLogoUrl(currentEvent.settings.logoUrl || null);
      }

      loadTickets();
    }
  }, [currentEvent]);

  const loadTickets = async () => {
    if (!currentEvent) return;
    try {
      setTicketsLoading(true);
      const data = await eventsService.getTicketTypes(currentEvent.id);
      setTicketTypes(data);
    } catch (err) {
      console.error('Error cargando tipos de entradas:', err);
    } finally {
      setTicketsLoading(false);
    }
  };

  // Previsualización en caliente
  const handleColorChange = (newPrimary: string, newSecondary: string, newBg: string) => {
    setPrimaryColor(newPrimary);
    setSecondaryColor(newSecondary);
    setBackgroundColor(newBg);
    applyCustomPalette(newPrimary, newSecondary, newBg);
  };

  const handleResetColors = () => {
    handleColorChange('#e11d48', '#881337', '#09090b');
    resetDefaultTheme();
  };

  // Subir Logo oficial de la edición
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentEvent) return;

    if (file.size > 2 * 1024 * 1024) {
      showNotification('error', 'El logo no debe superar los 2MB');
      return;
    }

    try {
      setLogoUploading(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await eventsService.uploadLogo(currentEvent.id, base64Data, file.name);
          setLogoUrl(res.logoUrl);
          await refreshEditions();
          showNotification('success', 'Logo oficial actualizado exitosamente');
        } catch (err: any) {
          showNotification('error', err.response?.data?.message || 'Error al subir el logo');
        } finally {
          setLogoUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setLogoUploading(false);
      showNotification('error', 'Error al procesar la imagen');
    }
  };

  // Eliminar Logo
  const handleLogoRemove = async () => {
    if (!currentEvent || !logoUrl) return;
    try {
      setLogoUploading(true);
      await eventsService.removeLogo(currentEvent.id);
      setLogoUrl(null);
      await refreshEditions();
      showNotification('success', 'Logo oficial removido');
    } catch (err) {
      showNotification('error', 'No se pudo eliminar el logo');
    } finally {
      setLogoUploading(false);
    }
  };

  // Guardar Identidad Visual
  const handleSaveVisual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent) return;
    try {
      setSaving(true);
      await eventsService.updateSettings(currentEvent.id, {
        primaryColor,
        secondaryColor,
        accentColor,
        backgroundColor,
        subtitle,
        registrationPrefix: prefix,
        currencySymbol,
        themeMode: 'dark',
      });
      await refreshEditions();
      showNotification('success', 'Identidad visual y ajustes guardados');
    } catch (err) {
      showNotification('error', 'Error al guardar configuración visual');
    } finally {
      setSaving(false);
    }
  };

  // Guardar Datos Generales de la Edición
  const handleSaveEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent) return;
    try {
      setSaving(true);
      await eventsService.update(currentEvent.id, {
        name: editionName,
        venue: editionVenue,
        description: editionDescription,
        startDate: editionStartDate ? new Date(editionStartDate).toISOString() : undefined,
        endDate: editionEndDate ? new Date(editionEndDate).toISOString() : undefined,
        maxCapacity: editionMaxCapacity === '' ? null : Number(editionMaxCapacity),
      });
      await refreshEditions();
      showNotification('success', 'Información de la edición actualizada');
    } catch (err) {
      showNotification('error', 'Error al actualizar información del evento');
    } finally {
      setSaving(false);
    }
  };

  // Guardar o Actualizar Tipo de Entrada
  const handleSaveTicketType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent || !editingTicket) return;
    try {
      setTicketSaving(true);
      const payload: Partial<TicketType> = {
        name: editingTicket.name,
        price: Number(editingTicket.price ?? 0),
        description: editingTicket.description || undefined,
        totalCapacity: editingTicket.totalCapacity ? Number(editingTicket.totalCapacity) : null,
        presaleStartDate: editingTicket.presaleStartDate ? new Date(editingTicket.presaleStartDate).toISOString() : null,
        presaleEndDate: editingTicket.presaleEndDate ? new Date(editingTicket.presaleEndDate).toISOString() : null,
        isActive: editingTicket.isActive !== false,
      };

      if (editingTicket.id) {
        await eventsService.updateTicketType(currentEvent.id, editingTicket.id, payload);
        showNotification('success', 'Entrada actualizada exitosamente');
      } else {
        await eventsService.createTicketType(currentEvent.id, payload);
        showNotification('success', 'Nuevo tipo de entrada creado');
      }

      setIsTicketModalOpen(false);
      setEditingTicket(null);
      await loadTickets();
      await refreshEditions();
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || 'Error al guardar tipo de entrada');
    } finally {
      setTicketSaving(false);
    }
  };

  // Alternar estado activo de tipo de entrada
  const handleToggleTicketActive = async (ticket: TicketType) => {
    if (!currentEvent) return;
    try {
      await eventsService.updateTicketType(currentEvent.id, ticket.id, {
        isActive: !ticket.isActive,
      });
      await loadTickets();
      showNotification(
        'success',
        `Entrada "${ticket.name}" ${!ticket.isActive ? 'activada' : 'desactivada'}`
      );
    } catch (err) {
      showNotification('error', 'No se pudo actualizar el estado de la entrada');
    }
  };

  // Paletas predefinidas oficiales de BarCamp
  const presets = [
    { name: 'BarCamp 2026 (Oficial)', primary: '#e11d48', secondary: '#881337', bg: '#09090b' },
    { name: 'Carmesí Profundo', primary: '#be123c', secondary: '#4c0519', bg: '#09090b' },
    { name: 'Cibao Tech Naranja', primary: '#ea580c', secondary: '#7c2d12', bg: '#0c0a09' },
    { name: 'Índigo Hacker', primary: '#6366f1', secondary: '#312e81', bg: '#09090b' },
    { name: 'Verde PUCMM Campus', primary: '#10b981', secondary: '#064e3b', bg: '#09090b' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Notificación flotante */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              {currentEvent?.name || 'Edición Activa'}
            </span>
            <span className="text-xs text-muted-foreground">• Módulo de Configuración Integral</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Configuración y Personalización
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Administre la identidad visual, logos, capacidad, fechas y tarifas de entradas de <strong>{currentEvent?.name}</strong>.
          </p>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border">
          <button
            onClick={() => setActiveTab('visual')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'visual'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Identidad & Logos</span>
          </button>
          <button
            onClick={() => setActiveTab('edition')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'edition'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Edición & Fechas</span>
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'tickets'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Entradas & Precios</span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: IDENTIDAD VISUAL Y LOGOS */}
      {activeTab === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Sección de Gestión de Logo Oficial */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileImage className="w-3.5 h-3.5 text-primary" />
                Logo Oficial del Evento
              </h3>
              <p className="text-xs text-muted-foreground">
                El logo cargado se mostrará en el encabezado, credenciales, barra lateral y reportes oficiales.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-background border border-border">
                {/* Previsualización del Logo */}
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-border bg-zinc-900/60 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo Edición" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center p-2">
                      <FileImage className="w-7 h-7 text-muted-foreground mx-auto mb-1 opacity-50" />
                      <span className="text-[10px] text-muted-foreground font-mono">Sin logo</span>
                    </div>
                  )}
                </div>

                {/* Acciones de Carga */}
                <div className="space-y-2 flex-1 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{logoUploading ? 'Subiendo...' : 'Subir Nuevo Logo'}</span>
                    </button>

                    {logoUrl && (
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={handleLogoRemove}
                        className="px-3.5 py-2 rounded-xl bg-card hover:bg-rose-500/10 border border-border hover:border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar Logo</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Formatos admitidos: PNG, JPG, WEBP, SVG. Tamaño máximo recomendado: 2MB con fondo transparente.
                  </p>
                </div>
              </div>
            </div>

            {/* Paletas Rápidas */}
            <div className="p-5 rounded-2xl bg-card border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Paletas Recomendadas para Eventos
                </h3>
                <button
                  type="button"
                  onClick={handleResetColors}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Restablecer
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleColorChange(preset.primary, preset.secondary, preset.bg)}
                    className="p-2.5 rounded-xl border border-border bg-background hover:border-primary/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-4 h-4 rounded-full border border-black/20" style={{ backgroundColor: preset.primary }} />
                      <span className="w-4 h-4 rounded-full border border-black/20" style={{ backgroundColor: preset.secondary }} />
                    </div>
                    <span className="text-xs font-medium text-foreground block truncate group-hover:text-primary">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ajuste Fino Hexadecimal */}
            <form onSubmit={handleSaveVisual} className="p-5 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-primary" />
                Valores Hexadecimales y Variables de Edición
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Color Primario</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => handleColorChange(e.target.value, secondaryColor, backgroundColor)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => handleColorChange(e.target.value, secondaryColor, backgroundColor)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Color Secundario (Burdeos)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => handleColorChange(primaryColor, e.target.value, backgroundColor)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => handleColorChange(primaryColor, e.target.value, backgroundColor)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Color de Énfasis (Acentos)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Prefijo de Ticket</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="BC26-"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Símbolo de Moneda</label>
                  <input
                    type="text"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    placeholder="RD$"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Subtítulo Institucional</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Guardar Ajustes Visuales'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Columna Lateral: Previsualización en Tiempo Real */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-card border border-border sticky top-24">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-primary" />
                Previsualización en Vivo
              </h3>

              <div className="rounded-xl border border-border bg-background p-4 space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />
                    ) : (
                      <span className="text-xs font-black tracking-tight" style={{ color: primaryColor }}>
                        BARCAMP RD
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {prefix}0001
                  </span>
                </div>

                <div
                  className="p-3.5 rounded-lg text-white text-xs font-medium space-y-1 shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                  }}
                >
                  <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">Credencial Oficial</span>
                  <div className="font-bold text-sm">Participante BarCamp</div>
                  <span className="block text-[11px] opacity-90">
                    {subtitle || 'PUCMM Santiago'} • {currencySymbol} 2,000.00
                  </span>
                </div>

                <button
                  type="button"
                  className="w-full py-2 rounded-lg text-white text-xs font-bold shadow-md transition-transform active:scale-95"
                  style={{ backgroundColor: primaryColor }}
                >
                  Botón Primario de Acción
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground mt-3">
                Los cambios visuales se aplicarán instantáneamente al panel administrativo para la edición activa.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: EDICIÓN Y FECHAS */}
      {activeTab === 'edition' && (
        <form onSubmit={handleSaveEdition} className="p-6 rounded-2xl bg-card border border-border space-y-5 max-w-3xl">
          <div>
            <h3 className="text-sm font-bold text-foreground">Información General de la Edición</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defina las fechas, lugar oficial y capacidad máxima del evento.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">Nombre de la Edición</label>
              <input
                type="text"
                required
                value={editionName}
                onChange={(e) => setEditionName(e.target.value)}
                placeholder="BarCamp RD 2026"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">Lugar / Sede Oficial</label>
              <input
                type="text"
                required
                value={editionVenue}
                onChange={(e) => setEditionVenue(e.target.value)}
                placeholder="PUCMM — Campus Santiago de los Caballeros, RD"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Fecha y Hora de Inicio</label>
              <input
                type="datetime-local"
                value={editionStartDate}
                onChange={(e) => setEditionStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Fecha y Hora de Finalización</label>
              <input
                type="datetime-local"
                value={editionEndDate}
                onChange={(e) => setEditionEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Capacidad Máxima del Evento (Aforo)
              </label>
              <input
                type="number"
                min="0"
                value={editionMaxCapacity}
                onChange={(e) => setEditionMaxCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 1000 (Dejar vacío para ilimitado)"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Límite total de registros permitidos para esta edición.
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">Descripción / Objetivos</label>
              <textarea
                rows={3}
                value={editionDescription}
                onChange={(e) => setEditionDescription(e.target.value)}
                placeholder="Edición anual de desconferencia tecnológica en PUCMM Santiago..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs resize-none"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Información de Edición'}</span>
            </button>
          </div>
        </form>
      )}

      {/* PESTAÑA 3: TIPOS DE ENTRADAS Y TARIFAS */}
      {activeTab === 'tickets' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Tarifas y Tipos de Entrada</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure preventa, venta general, cortesías y capacidades. Los precios se preservan históricamente en cada venta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingTicket({
                  name: '',
                  price: 0,
                  description: '',
                  isActive: true,
                  totalCapacity: null,
                  presaleStartDate: null,
                  presaleEndDate: null,
                });
                setIsTicketModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tarifa de Entrada</span>
            </button>
          </div>

          {/* Listado de Entradas */}
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {ticketsLoading ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                Cargando tipos de entrada...
              </div>
            ) : ticketTypes.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Tag className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                <p className="text-xs font-bold text-foreground">No hay tipos de entrada configurados</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {ticketTypes.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-sm text-foreground">{ticket.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            ticket.isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {ticket.isActive ? 'Activa para Venta' : 'Inactiva'}
                        </span>
                        {Number(ticket.price) === 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Cortesía
                          </span>
                        )}
                      </div>

                      {ticket.description && (
                        <p className="text-xs text-muted-foreground">{ticket.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono pt-1">
                        {ticket.presaleStartDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Preventa: {new Date(ticket.presaleStartDate).toLocaleDateString('es-DO')} al{' '}
                            {ticket.presaleEndDate
                              ? new Date(ticket.presaleEndDate).toLocaleDateString('es-DO')
                              : 'fin'}
                          </span>
                        )}
                        {ticket.totalCapacity && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            Cupo máximo: {ticket.totalCapacity} personas
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="text-right">
                        <span className="font-mono text-base font-black text-foreground block">
                          RD$ {Number(ticket.price).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Precio Oficial</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleTicketActive(ticket)}
                          className="p-2 rounded-lg bg-background hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title={ticket.isActive ? 'Desactivar entrada' : 'Activar entrada'}
                        >
                          {ticket.isActive ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-zinc-500" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTicket({
                              ...ticket,
                              presaleStartDate: ticket.presaleStartDate
                                ? new Date(ticket.presaleStartDate).toISOString().slice(0, 16) as any
                                : null,
                              presaleEndDate: ticket.presaleEndDate
                                ? new Date(ticket.presaleEndDate).toISOString().slice(0, 16) as any
                                : null,
                            });
                            setIsTicketModalOpen(true);
                          }}
                          className="p-2 rounded-lg bg-background hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Editar tarifa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR TIPO DE ENTRADA */}
      {isTicketModalOpen && editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                <span>{editingTicket.id ? 'Editar Tarifa de Entrada' : 'Nueva Tarifa de Entrada'}</span>
              </h3>
              <button
                onClick={() => setIsTicketModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTicketType} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre de la Entrada</label>
                <input
                  type="text"
                  required
                  value={editingTicket.name || ''}
                  onChange={(e) => setEditingTicket({ ...editingTicket, name: e.target.value })}
                  placeholder="Ej. Preventa, General, Estudiante..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Precio en RD$</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editingTicket.price ?? 0}
                  onChange={(e) => setEditingTicket({ ...editingTicket, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Descripción</label>
                <input
                  type="text"
                  value={editingTicket.description || ''}
                  onChange={(e) => setEditingTicket({ ...editingTicket, description: e.target.value })}
                  placeholder="Acceso general a conferencias y coffee break..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Inicio Preventa</label>
                  <input
                    type="datetime-local"
                    value={(editingTicket.presaleStartDate as any) || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, presaleStartDate: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Fin Preventa</label>
                  <input
                    type="datetime-local"
                    value={(editingTicket.presaleEndDate as any) || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, presaleEndDate: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Capacidad Máxima (Cupo)</label>
                <input
                  type="number"
                  min="1"
                  value={editingTicket.totalCapacity ?? ''}
                  onChange={(e) =>
                    setEditingTicket({
                      ...editingTicket,
                      totalCapacity: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Dejar vacío para ilimitado"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ticketActive"
                  checked={editingTicket.isActive !== false}
                  onChange={(e) => setEditingTicket({ ...editingTicket, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                />
                <label htmlFor="ticketActive" className="text-xs font-semibold text-foreground cursor-pointer">
                  Habilitar venta de este tipo de entrada
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsTicketModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ticketSaving}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{ticketSaving ? 'Guardando...' : 'Guardar Entrada'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};