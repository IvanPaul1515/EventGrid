import React, { useState, useEffect, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useTheme } from '../context/ThemeContext';
import { eventsService } from '../services/events.service';
import { demoService } from '../services/demo.service';
import { TicketType, DemoStatus } from '../types';
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
  FlaskConical,
  Database,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Shirt,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentEvent, refreshEditions } = useEdition();
  const { applyCustomPalette, resetDefaultTheme } = useTheme();

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<'visual' | 'edition' | 'tickets' | 'reception' | 'demo'>('visual');

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

  // Recepción y Tallas de Camisetas
  const [tshirtEnabled, setTshirtEnabled] = useState(false);
  const [tshirtSizes, setTshirtSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  const [tshirtNewSize, setTshirtNewSize] = useState('');
  const [savingReception, setSavingReception] = useState(false);

  // Estados de Entorno de Demostración
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const [generatingDemo, setGeneratingDemo] = useState(false);
  const [demoCountToGenerate, setDemoCountToGenerate] = useState(25);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [demoFeedback, setDemoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
        setTshirtEnabled(Boolean(currentEvent.settings.tshirtSizesEnabled));
        if (currentEvent.settings.tshirtSizes) {
          try {
            const parsed = typeof currentEvent.settings.tshirtSizes === 'string'
              ? JSON.parse(currentEvent.settings.tshirtSizes)
              : currentEvent.settings.tshirtSizes;
            if (Array.isArray(parsed) && parsed.length > 0) {
              setTshirtSizes(parsed);
            }
          } catch {
            // Keep default
          }
        }
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

  const loadDemoStatus = async () => {
    if (!currentEvent) return;
    try {
      setLoadingDemo(true);
      const data = await demoService.getStatus(currentEvent.id);
      setDemoStatus(data);
    } catch (err: any) {
      console.error('Error cargando estado demo:', err);
    } finally {
      setLoadingDemo(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'demo' && currentEvent) {
      loadDemoStatus();
    }
  }, [activeTab, currentEvent]);

  const handleToggleDemo = async () => {
    if (!currentEvent) return;
    try {
      setTogglingDemo(true);
      const targetState = !(demoStatus?.demoModeEnabled ?? false);
      const res = await demoService.toggle(currentEvent.id, targetState);
      setDemoFeedback({ type: 'success', message: res.message });
      await refreshEditions();
      await loadDemoStatus();
    } catch (err: any) {
      setDemoFeedback({
        type: 'error',
        message: err?.response?.data?.message || 'Error al modificar modo demo',
      });
    } finally {
      setTogglingDemo(false);
    }
  };

  const handleGenerateDemo = async () => {
    if (!currentEvent) return;
    try {
      setGeneratingDemo(true);
      setDemoFeedback(null);
      const res = await demoService.generate(currentEvent.id, demoCountToGenerate);
      setDemoFeedback({ type: 'success', message: res.message });
      await loadDemoStatus();
    } catch (err: any) {
      setDemoFeedback({
        type: 'error',
        message: err?.response?.data?.message || 'Error al generar participantes de demostración',
      });
    } finally {
      setGeneratingDemo(false);
    }
  };

  const handleResetDemo = async () => {
    if (!currentEvent) return;
    if (resetConfirmationInput.trim() !== 'ELIMINAR-DEMO') {
      alert('Debe escribir exactamente ELIMINAR-DEMO para autorizar el restablecimiento.');
      return;
    }
    try {
      setResettingDemo(true);
      const res = await demoService.reset(currentEvent.id, resetConfirmationInput.trim());
      setDemoFeedback({ type: 'success', message: res.message });
      setShowResetModal(false);
      setResetConfirmationInput('');
      await loadDemoStatus();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al restablecer datos de demostración');
    } finally {
      setResettingDemo(false);
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
        showNotification(
          'success',
          `Tarifa "${editingTicket.name}" actualizada a RD$ ${Number(editingTicket.price).toFixed(2)} y reflejada en los participantes.`
        );
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

  // Guardar configuración de Recepción / T-shirts
  const handleSaveReception = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent) return;
    try {
      setSavingReception(true);
      await eventsService.updateSettings(currentEvent.id, {
        tshirtSizesEnabled: tshirtEnabled,
        tshirtSizes: tshirtSizes,
      });
      await refreshEditions();
      showNotification('success', 'Configuración de recepción y camisetas guardada exitosamente');
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || 'Error al guardar configuración de recepción');
    } finally {
      setSavingReception(false);
    }
  };

  const handleAddTshirtSize = () => {
    const trimmed = tshirtNewSize.trim().toUpperCase();
    if (!trimmed) return;
    if (tshirtSizes.includes(trimmed)) {
      showNotification('error', 'Esa talla ya está en la lista');
      return;
    }
    setTshirtSizes([...tshirtSizes, trimmed]);
    setTshirtNewSize('');
  };

  const handleRemoveTshirtSize = (sizeToRemove: string) => {
    setTshirtSizes(tshirtSizes.filter((s) => s !== sizeToRemove));
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
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-card border border-border w-full sm:w-auto">
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
          <button
            onClick={() => setActiveTab('reception')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'reception'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            <span>Recepción & T-Shirts</span>
          </button>
          <button
            onClick={() => setActiveTab('demo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'demo'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Entorno Demo</span>
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

      {/* PESTAÑA: RECEPCIÓN Y TALLAS DE CAMISETAS */}
      {activeTab === 'reception' && (
        <div className="space-y-6 max-w-4xl">
          <form onSubmit={handleSaveReception} className="space-y-6">
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Shirt className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-bold text-foreground">
                      Control de Tallas de Camiseta (T-Shirts)
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Habilite la captura de tallas durante la recepción física o escaneo QR de la entrada.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setTshirtEnabled(!tshirtEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    tshirtEnabled ? 'bg-primary' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      tshirtEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Estado del Módulo
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        tshirtEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {tshirtEnabled ? 'Activado en Check-in' : 'Desactivado'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tshirtEnabled
                      ? 'Al registrar asistencia (manual o por escaneo QR), el operador podrá seleccionar o cambiar la talla de camiseta del participante.'
                      : 'No se solicitará la talla de camiseta al momento de realizar el check-in físico de los participantes.'}
                  </p>
                </div>

                {tshirtEnabled && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                        Tallas Disponibles para esta Edición
                      </label>
                      <p className="text-xs text-muted-foreground mb-3">
                        Haga clic en la '✕' para eliminar una talla o agregue una nueva usando el campo inferior.
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {tshirtSizes.map((size) => (
                          <span
                            key={size}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-xs"
                          >
                            <span>{size}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTshirtSize(size)}
                              className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary transition-colors cursor-pointer"
                              title={`Eliminar talla ${size}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 max-w-sm">
                        <input
                          type="text"
                          placeholder="Nueva talla (ej: 4XL, S-Dama)"
                          value={tshirtNewSize}
                          onChange={(e) => setTshirtNewSize(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTshirtSize();
                            }
                          }}
                          className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                        />
                        <button
                          type="button"
                          onClick={handleAddTshirtSize}
                          className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-bold transition-colors cursor-pointer"
                        >
                          + Agregar
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setTshirtSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'])}
                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
                      >
                        Restablecer a tallas estándar (XS a XXXL)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="submit"
                  disabled={savingReception}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingReception ? 'Guardando...' : 'Guardar Ajustes de Recepción'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* PESTAÑA 4: ENTORNO DE DEMOSTRACIÓN */}
      {activeTab === 'demo' && (
        <div className="space-y-6 max-w-4xl">
          {demoFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                demoFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              {demoFeedback.type === 'success' ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{demoFeedback.message}</span>
            </div>
          )}

          {/* Tarjeta de Control Principal */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-foreground">
                    Modo Demostración Administrable
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Controle el entorno de pruebas para validar check-in, ventas presenciales, cortesías y códigos QR sin mezclar con registros oficiales.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    (demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {(demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                    ? 'MODO DEMO ACTIVADO'
                    : 'MODO DEMO DESACTIVADO'}
                </span>

                <button
                  type="button"
                  onClick={handleToggleDemo}
                  disabled={togglingDemo || loadingDemo}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                    (demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${togglingDemo ? 'animate-spin' : ''}`} />
                  <span>
                    {togglingDemo
                      ? 'Actualizando...'
                      : (demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                      ? 'Desactivar Modo Demo'
                      : 'Activar Modo Demo'}
                  </span>
                </button>
              </div>
            </div>

            {/* Comportamiento según el estado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div
                className={`p-4 rounded-xl border ${
                  !(demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border opacity-70'
                }`}
              >
                <h4 className="font-bold text-foreground flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Modo Demo Desactivado (Producción)
                </h4>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Muestra únicamente participantes e inscripciones reales.</li>
                  <li>Oculta automáticamente registros de prueba en todas las consultas y exportaciones.</li>
                  <li>Si la base de datos está vacía, muestra contadores en cero.</li>
                </ul>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  (demoStatus?.demoModeEnabled ?? currentEvent?.settings?.demoModeEnabled)
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-muted/30 border-border opacity-70'
                }`}
              >
                <h4 className="font-bold text-amber-500 flex items-center gap-1.5 mb-1.5">
                  <FlaskConical className="w-4 h-4 text-amber-500" />
                  Modo Demo Activado (Entorno de Pruebas)
                </h4>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Permite evaluar recepción, lecturas QR, emisión de entradas y balance.</li>
                  <li>Genera participantes con variedad de pagos, cortesías y asistencias.</li>
                  <li>Identifica visualmente los registros como datos de demostración.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Conteo de Registros en Base de Datos */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Auditoría y Conteo de Registros Actuales
              </h3>
              <button
                type="button"
                onClick={loadDemoStatus}
                disabled={loadingDemo}
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDemo ? 'animate-spin' : ''}`} />
                <span>Actualizar conteo</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-background border border-amber-500/20">
                <p className="text-[10px] font-bold uppercase text-amber-500">Inscripciones Demo</p>
                <p className="text-2xl font-black text-foreground mt-1">
                  {demoStatus?.counts?.demoRegistrations ?? demoStatus?.demoCount ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">En la edición activa</p>
              </div>

              <div className="p-4 rounded-xl bg-background border border-amber-500/20">
                <p className="text-[10px] font-bold uppercase text-amber-500">Personas Demo</p>
                <p className="text-2xl font-black text-foreground mt-1">
                  {demoStatus?.counts?.demoParticipants ?? demoStatus?.demoCount ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Participantes ficticios</p>
              </div>

              <div className="p-4 rounded-xl bg-background border border-emerald-500/20">
                <p className="text-[10px] font-bold uppercase text-emerald-500">Inscripciones Reales</p>
                <p className="text-2xl font-black text-foreground mt-1">
                  {demoStatus?.counts?.realRegistrations ?? demoStatus?.realCount ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Registros oficiales</p>
              </div>

              <div className="p-4 rounded-xl bg-background border border-emerald-500/20">
                <p className="text-[10px] font-bold uppercase text-emerald-500">Personas Reales</p>
                <p className="text-2xl font-black text-foreground mt-1">
                  {demoStatus?.counts?.realParticipants ?? demoStatus?.realCount ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Participantes legítimos</p>
              </div>
            </div>
          </div>

          {/* Generador de Participantes Ficticios */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Generador Inteligente de Datos de Demostración
            </h3>
            <p className="text-xs text-muted-foreground">
              Crea participantes ficticios con nombres dominicanos, cédulas válidas, instituciones representativas y escenarios variados (entradas pagadas, cortesías con justificación, abonos parciales, pendientes y registros con entrada ya marcada).
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Cantidad:</span>
                <select
                  value={demoCountToGenerate}
                  onChange={(e) => setDemoCountToGenerate(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={5}>5 participantes</option>
                  <option value={10}>10 participantes</option>
                  <option value={25}>25 participantes</option>
                  <option value={50}>50 participantes</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleGenerateDemo}
                disabled={generatingDemo}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {generatingDemo
                    ? 'Generando participantes ficticios...'
                    : `Generar ${demoCountToGenerate} Participantes Demo`}
                </span>
              </button>
            </div>
          </div>

          {/* Restablecimiento / Limpieza de Datos Demo */}
          <div className="p-6 rounded-2xl bg-destructive/5 border border-destructive/20 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Restablecer Datos de Demostración
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Elimina exclusivamente las inscripciones y personas marcadas como demo para dejar la plataforma limpia antes del evento oficial. No afectará configuraciones de precios ni participantes reales.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setResetConfirmationInput('');
                  setShowResetModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs shadow-md shadow-destructive/25 transition-all cursor-pointer shrink-0"
              >
                Restablecer Demo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Obligatoria de Restablecimiento */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-destructive/40 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-sm">Confirmación de Restablecimiento</h4>
                <p className="text-xs text-muted-foreground">Acción administrativa de limpieza</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Esta operación eliminará de forma irreversible todas las inscripciones y registros de demostración generados en <strong>{currentEvent?.name}</strong>. Los datos reales y las importaciones oficiales permanecerán intactos.
            </p>

            <div className="p-3 rounded-xl bg-background border border-border">
              <label className="block text-[11px] font-bold uppercase text-foreground mb-1.5">
                Para autorizar, escriba exactamente: <span className="font-mono text-destructive">ELIMINAR-DEMO</span>
              </label>
              <input
                type="text"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                placeholder="ELIMINAR-DEMO"
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                disabled={resettingDemo || resetConfirmationInput.trim() !== 'ELIMINAR-DEMO'}
                className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40"
              >
                {resettingDemo ? 'Eliminando datos demo...' : 'Confirmar y Limpiar Demo'}
              </button>
            </div>
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