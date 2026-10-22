import React, { createContext, useContext, useState, useEffect } from 'react';
import { useEdition } from './EditionContext';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  applyCustomPalette: (primary: string, secondary: string, bg?: string) => void;
  resetDefaultTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Función auxiliar para convertir HEX a HSL de Tailwind
function hexToHSL(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentEvent } = useEdition();
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('barcamp_theme_mode');
    if (saved) return saved === 'dark';
    return true; // Predeterminado en modo oscuro para BarCamp
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
      localStorage.setItem('barcamp_theme_mode', 'dark');
      if (currentEvent?.settings?.backgroundColor && currentEvent.settings.backgroundColor.startsWith('#')) {
        try {
          const bgHsl = hexToHSL(currentEvent.settings.backgroundColor);
          root.style.setProperty('--background', bgHsl);
        } catch (e) {
          console.warn('Error al aplicar fondo:', e);
        }
      }
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
      localStorage.setItem('barcamp_theme_mode', 'light');
      root.style.removeProperty('--background');
    }
  }, [isDark, currentEvent]);

  // Aplicar colores y favicon de la edición activa
  useEffect(() => {
    if (currentEvent?.settings) {
      const { primaryColor, secondaryColor, accentColor, backgroundColor, faviconUrl } = currentEvent.settings;
      applyCustomPalette(primaryColor, secondaryColor, accentColor, backgroundColor);

      if (faviconUrl) {
        const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (favicon) {
          favicon.href = faviconUrl;
        }
      }
    } else {
      resetDefaultTheme();
    }
  }, [currentEvent]);

  const applyCustomPalette = (primary: string, secondary: string, accent?: string, bg?: string) => {
    const root = document.documentElement;
    try {
      if (primary && primary.startsWith('#')) {
        const primaryHsl = hexToHSL(primary);
        root.style.setProperty('--primary', primaryHsl);
        root.style.setProperty('--ring', primaryHsl);
      }
      if (secondary && secondary.startsWith('#')) {
        const secondaryHsl = hexToHSL(secondary);
        root.style.setProperty('--secondary', secondaryHsl);
      }
      if (accent && accent.startsWith('#')) {
        const accentHsl = hexToHSL(accent);
        root.style.setProperty('--accent', accentHsl);
      }
      if (bg && bg.startsWith('#') && isDark) {
        const bgHsl = hexToHSL(bg);
        root.style.setProperty('--background', bgHsl);
      }
    } catch (e) {
      console.warn('Error al aplicar paleta personalizada:', e);
    }
  };

  const resetDefaultTheme = () => {
    const root = document.documentElement;
    root.style.removeProperty('--primary');
    root.style.removeProperty('--secondary');
    root.style.removeProperty('--accent');
    root.style.removeProperty('--background');
    root.style.removeProperty('--ring');
  };

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const setThemeMode = (mode: 'dark' | 'light') => {
    setIsDark(mode === 'dark');
  };

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        toggleTheme,
        setThemeMode,
        applyCustomPalette,
        resetDefaultTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe ser utilizado dentro de un ThemeProvider');
  }
  return context;
};
