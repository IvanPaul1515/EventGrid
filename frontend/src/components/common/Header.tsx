import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useTheme } from '../../context/ThemeContext';
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
  const [editionDropdownOpen, setEditionDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Activo</span>;
      case 'PLANNING':
        return <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">Planificación</span>;
      case 'COMPLETED':
        return <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Finalizado</span>;
      case 'ARCHIVED':
        return <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">Archivado</span>;
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">ADMINISTRADOR</span>;
      case 'OPERATOR':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">OPERADOR</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">CONSULTA</span>;
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card/85 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 flex items-center justify-between transition-colors">
      {/* EventGrid Brand + Selector de Edición BarCamp */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Botón Hamburger para Móviles */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        )}

        {/* Identificador de Software EventGrid */}
        <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-border">
          <span className="font-mono text-xs font-black tracking-widest text-foreground uppercase bg-zinc-800/80 px-2 py-1 rounded-md border border-border">
            EVENT<span className="text-primary">GRID</span>
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">
            v1.0
          </span>
        </div>

        {/* Selector de Edición Activa (BarCamp RD) */}
        <div className="relative">
          <button
            onClick={() => setEditionDropdownOpen(!editionDropdownOpen)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-background hover:bg-muted border border-border text-foreground transition-all duration-150 group shadow-sm cursor-pointer"
            title="Cambiar edición del evento"
          >
            {currentEvent?.settings?.logoUrl ? (
              <img
                src={currentEvent.settings.logoUrl}
                alt={currentEvent.name}
                className="w-5 h-5 rounded object-contain shrink-0"
              />
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                <Layers className="w-4 h-4 text-primary" />
              </>
            )}
            <span className="font-bold text-sm tracking-tight">
              {currentEvent ? currentEvent.name : 'Seleccionar Edición'}
            </span>
            {currentEvent && getStatusBadge(currentEvent.status)}
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-transform" />
          </button>

          {/* Menú Desplegable de Ediciones */}
          {editionDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setEditionDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-72 rounded-xl bg-card border border-border shadow-2xl py-2 z-50 divide-y divide-border">
                <div className="px-3.5 py-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-wider">
                    Eventos y Ediciones Registradas
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
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2 font-medium">
                          <Calendar className="w-3.5 h-3.5 opacity-70" />
                          {ev.name}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-[170px]">
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

        {/* Lugar e Indicador de PUCMM */}
        <div className="hidden lg:flex items-center text-xs text-muted-foreground gap-1.5 pl-2 border-l border-border">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          <span>PUCMM — Santiago de los Caballeros</span>
        </div>
      </div>

      {/* Indicador Global de Modo Demo */}
      {currentEvent?.settings?.demoModeEnabled && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-500 text-xs font-black tracking-wider animate-pulse">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>MODO DEMOSTRACIÓN ACTIVO</span>
        </div>
      )}

      {/* Controles de la Derecha: Tema, Rol y Perfil */}
      <div className="flex items-center gap-3">
        {/* Conmutador Modo Oscuro / Claro */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
        </button>

        {/* Rol y Menú de Usuario */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-background hover:bg-muted border border-border transition-colors group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-barcamp-burgundy flex items-center justify-center text-white font-bold text-xs shadow-sm">
              {user?.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-foreground leading-tight">
                {user?.fullName}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                {user?.email}
              </span>
            </div>
            {user && getRoleBadge(user.role)}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-border shadow-2xl py-2 z-50 divide-y divide-border">
                <div className="px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  <div className="mt-2">{user && getRoleBadge(user.role)}</div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10 flex items-center gap-2 transition-colors font-medium cursor-pointer"
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
