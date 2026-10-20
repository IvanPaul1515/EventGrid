import React, { useState, useEffect } from 'react';
import { useEdition } from '../context/EditionContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import {
  Palette,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  Eye,
  Type,
  Coins,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentEvent, refreshEditions } = useEdition();
  const { applyCustomPalette, resetDefaultTheme } = useTheme();

  const [primaryColor, setPrimaryColor] = useState('#e11d48');
  const [secondaryColor, setSecondaryColor] = useState('#881337');
  const [backgroundColor, setBackgroundColor] = useState('#09090b');
  const [subtitle, setSubtitle] = useState('');
  const [prefix, setPrefix] = useState('BC26-');
  const [currencySymbol, setCurrencySymbol] = useState('RD$');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (currentEvent?.settings) {
      setPrimaryColor(currentEvent.settings.primaryColor || '#e11d48');
      setSecondaryColor(currentEvent.settings.secondaryColor || '#881337');
      setBackgroundColor(currentEvent.settings.backgroundColor || '#09090b');
      setSubtitle(currentEvent.settings.subtitle || 'PUCMM — Santiago de los Caballeros');
      setPrefix(currentEvent.settings.registrationPrefix || 'BC26-');
      setCurrencySymbol(currentEvent.settings.currencySymbol || 'RD$');
    }
  }, [currentEvent]);

  // Previsualización en vivo en caliente
  const handleColorChange = (newPrimary: string, newSecondary: string, newBg: string) => {
    setPrimaryColor(newPrimary);
    setSecondaryColor(newSecondary);
    setBackgroundColor(newBg);
    applyCustomPalette(newPrimary, newSecondary, newBg);
  };

  const handleReset = () => {
    handleColorChange('#e11d48', '#881337', '#09090b');
    resetDefaultTheme();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent) return;
    setLoading(true);
    setSavedSuccess(false);

    try {
      await api.put(`/events/${currentEvent.id}/settings`, {
        primaryColor,
        secondaryColor,
        backgroundColor,
        subtitle,
        registrationPrefix: prefix,
        currencySymbol,
        themeMode: 'dark',
      });
      setSavedSuccess(true);
      await refreshEditions();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error al guardar ajustes:', err);
    } finally {
      setLoading(false);
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Personalización Visual de Edición
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Ajusta los colores, identidad y variables visuales para <strong>{currentEvent?.name}</strong> sin reprogramar.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer Fábrica</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>¡Guardado!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de Configuración de Colores */}
        <div className="lg:col-span-2 space-y-5">
          {/* Paletas Rápidas */}
          <div className="p-5 rounded-2xl bg-card border border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Paletas Recomendadas BarCamp
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleColorChange(preset.primary, preset.secondary, preset.bg)}
                  className="p-2.5 rounded-xl border border-border bg-background hover:border-zinc-500 text-left transition-all group"
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

          {/* Ajuste Fino de Colores */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-primary" />
              Valores Hexadecimales Personalizados
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Color Primario (Botones, Destacados)
                </label>
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
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Color Secundario (Gradientes, Tonalidad Burdeos)
                </label>
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
            </div>
          </div>

          {/* Textos y Parámetros de la Edición */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Type className="w-3.5 h-3.5 text-primary" />
              Parámetros de Tickets y Moneda
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          </div>
        </div>

        {/* Columna de Previsualización en Vivo */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-card border border-border sticky top-24">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Previsualización en Tiempo Real
            </h3>

            <div className="rounded-xl border border-border bg-background p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-bold" style={{ color: primaryColor }}>
                  BARCAMP RD
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {prefix}0001
                </span>
              </div>

              <div
                className="p-3 rounded-lg text-white text-xs font-medium"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                }}
              >
                Badge / Credencial de Asistente
                <span className="block text-[11px] opacity-90 mt-0.5">
                  PUCMM Santiago • {currencySymbol} 500.00
                </span>
              </div>

              <button
                type="button"
                className="w-full py-2 rounded-lg text-white text-xs font-bold shadow-md transition-transform active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                Botón Principal de Acción
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">
              Al guardar, estos colores se aplicarán instantáneamente a todo el panel administrativo de BarCamp para la edición activa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
