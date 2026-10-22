import { resolveImageUrl } from '../../utils/imageUrl';
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useTheme } from '../../context/ThemeContext';
import { useRealtime } from '../../context/RealtimeContext';
import {
  Calendar,
  ChevronDown,
  Moon,
  Sun,
  LogOut,
  Layers,
  Sparkles,
  Menu,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const { user, logout } = useAuth();
  const { events, currentEvent, switchEdition } = useEdition();
  const { isDark, toggleTheme } = useTheme();
  const { isConnected } = useRealtime();
  const [editionDropdownOpen, setEditionDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Activo</span>;
      case 'PLANNING':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Planificación</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">Finalizado</span>;
      case 'ARCHIVED':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-muted text-muted-foreground border border-border">Archivado</span>;
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-primary/15 text-primary border border-primary/30">ADMIN</span>;
      case 'OPERATOR':
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">OPERADOR</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-muted text-muted-foreground border border-border">CONSULTA</span>;
    }
  };

  return (
    <header className="mobile-header h-[calc(4rem+env(safe-area-inset-top,0px))] shrink-0 border-b border-border bg-card/85 backdrop-blur-md sticky top-0 z-40 px-2.5 sm:px-6 flex items-center justify-between transition-colors pt-safe">
      {/* EventGrid Brand + Selector de Edición BarCamp */}
      <div className="flex items-center gap-1.5 sm:gap-4 min-w-0">
        {/* Botón Hamburger para Móviles */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
            title="Abrir menú de navegación"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        )}

        {/* Logo Barcamp en Barra Superior */}
        <div className="hidden sm:flex items-center gap-2 pr-3 border-r border-border shrink-0">
          <img
            src="/barcamp-logo-nav.svg"
            alt="BarCamp 2026"
            className="h-6 w-auto on-dark-only object-contain"
          />
          <img
            src="/barcamp-logo-nav-on-light.svg"
            alt="BarCamp 2026"
            className="h-6 w-auto on-light-only object-contain"
          />
        </div>

        {/* Selector de Edición Activa (BarCamp RD) */}
        <div className="relative min-w-0">
          <button
            onClick={() => setEditionDropdownOpen(!editionDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-background hover:bg-muted/70 border border-border text-foreground transition-all duration-150 group shadow-sm cursor-pointer max-w-full sm:max-w-none"
            title="Cambiar edición del evento"
          >
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="font-display font-bold text-xs sm:text-sm tracking-tight whitespace-normal text-left break-words sm:whitespace-nowrap">
              {currentEvent ? `${currentEvent.name}${currentEvent.name.includes(String(currentEvent.year)) ? '' : ` · ${currentEvent.year}`}` : 'Seleccionar Edición'}
            </span>
            {currentEvent && <span className="hidden sm:inline-flex">{getStatusBadge(currentEvent.status)}</span>}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform shrink-0" />
          </button>

          {/* Menú Desplegable de Ediciones */}
          {editionDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setEditionDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-[min(18rem,calc(100vw-4rem))] sm:w-72 rounded-2xl bg-card border border-border shadow-2xl py-2 z-50 divide-y divide-border animate-in zoom-in-95 duration-150">
                <div className="px-3.5 py-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-wider">
                    Ediciones del Evento
                  </p>
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {events.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => {
                        switchEdition(ev.id);
                        setEditionDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-muted/70 transition-colors cursor-pointer ${
                        currentEvent?.id === ev.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-display font-bold text-xs">
                          <Calendar className="w-3.5 h-3.5 opacity-70 text-primary" />
                          {ev.name}{!ev.name.includes(String(ev.year)) && ` · ${ev.year}`}
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[170px]">
                          {ev.venue}
                        </span>
                      </div>
                      {getStatusBadge(ev.status)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Lugar e Indicador de Sede */}
        <div className="hidden lg:flex items-center text-xs text-muted-foreground gap-1.5 pl-2 border-l border-border">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          <span>{currentEvent?.venue || 'PUCMM, Santiago'}</span>
        </div>
      </div>

      {/* Indicador Global de Modo Demo */}
      {currentEvent?.settings?.demoModeEnabled && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-500 text-xs font-black tracking-wider animate-pulse">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>MODO DEMOSTRACIÓN ACTIVO</span>
        </div>
      )}

      {/* Indicador de Sincronización en Tiempo Real */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold shadow-sm"
            title="Sincronizado en tiempo real (SSE)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline font-mono text-[11px]">En vivo</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold"
            title="Reconectando sincronización en tiempo real..."
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="hidden sm:inline font-mono text-[11px]">Sincronizando</span>
          </div>
        )}
      </div>

      {/* Controles de la Derecha: Tema, Rol y Perfil */}
      <div className="flex items-center gap-3">
        {/* Conmutador Modo Oscuro / Claro */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={isDark ? 'Cambiar a modo claro (Papel BarCamp)' : 'Cambiar a modo oscuro (Negro BarCamp)'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-primary" />}
        </button>

        {/* Rol y Menú de Usuario */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background hover:bg-muted border border-border transition-colors group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-[#BA1513] flex items-center justify-center text-white font-bold text-xs shadow-sm">
              {user?.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-foreground leading-tight">
                {user?.fullName}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono leading-tight mt-0.5">
                {user?.email}
              </span>
            </div>
            {user && <span className="hidden sm:inline-flex">{getRoleBadge(user.role)}</span>}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-card border border-border shadow-2xl py-2 z-50 divide-y divide-border animate-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{user?.email}</p>
                  <div className="mt-2">{user && getRoleBadge(user.role)}</div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-primary hover:bg-primary/10 flex items-center gap-2 transition-colors font-medium cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
