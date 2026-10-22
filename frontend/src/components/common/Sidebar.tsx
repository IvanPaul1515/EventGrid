import { resolveImageUrl } from '../../utils/imageUrl';
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useEdition } from '../../context/EditionContext';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FileSpreadsheet,
  BadgeDollarSign,
  CalendarDays,
  Clock,
  Palette,
  Settings,
  UserCog,
  History,
  ChevronLeft,
  ChevronRight,
  Flame,
  Grid,
  Mail,
  Shirt,
  Handshake,
  X,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/attendance',
      label: 'Control de asistencia',
      icon: UserCheck,
      badge: 'Check-in',
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/participants',
      label: 'Participantes',
      icon: Users,
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/import',
      label: 'Importar Excel',
      icon: FileSpreadsheet,
      badge: 'Excel',
      roles: ['ADMIN', 'OPERATOR'],
    },
    {
      to: '/sales',
      label: 'Ventas y Pagos',
      icon: BadgeDollarSign,
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/sponsors',
      label: 'Patrocinadores',
      icon: Handshake,
      badge: 'Aportes',
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/inventory',
      label: 'Inventario T-shirts',
      icon: Shirt,
      badge: 'Stock',
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/editions',
      label: 'Ediciones',
      icon: CalendarDays,
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/schedule',
      label: 'Cronograma',
      icon: Clock,
      badge: 'Agenda',
      roles: ['ADMIN', 'OPERATOR', 'VIEWER'],
    },
    {
      to: '/communications',
      label: 'Comunicaciones',
      icon: Mail,
      badge: 'Correos',
      roles: ['ADMIN', 'OPERATOR'],
    },
    {
      to: '/settings',
      label: 'Administración',
      icon: Settings,
      roles: ['ADMIN'],
    },
    {
      to: '/users',
      label: 'Usuarios',
      icon: UserCog,
      roles: ['ADMIN'],
    },
    {
      to: '/audit',
      label: 'Historial',
      icon: History,
      roles: ['ADMIN'],
    },
  ];

  return (
    <>
      {/* Backdrop para dispositivos móviles */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileOpen && setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed md:relative inset-y-0 left-0 bg-card border-r border-border flex flex-col justify-between transition-all duration-300 z-50 select-none ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${collapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Cabecera Sidebar: Logo Oficial BarCamp 2026 */}
        <div>
          <div className="h-16 flex items-center px-4 border-b border-border justify-between bg-card/40">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-9 flex items-center justify-center shrink-0">
                {currentEvent?.settings?.logoUrl ? (
                  <img
                    src={resolveImageUrl(currentEvent.settings.logoUrl)}
                    alt={currentEvent.name}
                    className="h-8 w-auto object-contain"
                  />
                ) : (
                  <>
                    <img
                      src="/barcamp-logo-white.svg"
                      alt="BarCamp RD"
                      className="h-7 w-auto on-dark-only object-contain"
                    />
                    <img
                      src="/barcamp-logo-black.svg"
                      alt="BarCamp RD"
                      className="h-7 w-auto on-light-only object-contain"
                    />
                  </>
                )}
              </div>
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="font-display font-black text-sm tracking-tight text-foreground flex items-center gap-1">
                    BARCAMP <span className="text-primary font-black">2026</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
                    EventGrid Admin
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden md:flex p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              {setMobileOpen && (
                <button
                  onClick={() => setMobileOpen(false)}
                  className="md:hidden p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de Navegación */}
          <nav className="p-3 space-y-1">
            {navItems
              .filter((item) => hasRole(item.roles as any))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    viewTransition
                    end={item.to === '/'}
                    onClick={() => {
                      if (setMobileOpen) setMobileOpen(false);
                    }}
                    className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-gradient-to-r from-primary to-[#BA1513] text-white shadow-md shadow-primary/25 font-bold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                  {!collapsed && (
                    <div className="flex items-center justify-between w-full">
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[9px] uppercase font-mono font-bold tracking-wider rounded-md bg-primary-foreground/20 text-white">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Pie del Sidebar: Tarjeta de Edición Activa con estética BarCamp */}
        {!collapsed && currentEvent && (
          <div className="p-3.5 m-3 rounded-2xl bg-muted/40 border border-border shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
                Edición en Gestión
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-xs font-bold font-display text-foreground truncate">{currentEvent.name}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {currentEvent.venue}
            </p>
            <div className="mt-2.5 pt-2 border-t border-border/70 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>Prefijo: <strong className="text-foreground">{currentEvent.settings?.registrationPrefix || 'BC-'}</strong></span>
              <span>Moneda: <strong className="text-foreground">{currentEvent.settings?.currencyCode || 'DOP'}</strong></span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
