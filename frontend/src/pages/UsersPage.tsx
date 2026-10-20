import React from 'react';
import { UserCog, Shield, Plus, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const UsersPage: React.FC = () => {
  const { user } = useAuth();

  const mockUsers = [
    { email: 'admin@barcamp.org.do', name: 'Administrador BarCamp RD', role: 'ADMIN', status: 'Activo' },
    { email: 'operador@barcamp.org.do', name: 'Operador de Registro', role: 'OPERATOR', status: 'Activo' },
    { email: 'consulta@barcamp.org.do', name: 'Auditor de Consulta', role: 'VIEWER', status: 'Activo' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Control de Usuarios y Permisos (RBAC)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Administración de cuentas con acceso al panel administrativo de BarCamp RD.
          </p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-colors">
          <Plus className="w-4 h-4" />
          <span>Crear Usuario</span>
        </button>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Cuentas del Sistema
          </span>
          <span className="text-xs text-muted-foreground">3 usuarios registrados</span>
        </div>

        <div className="divide-y divide-border">
          {mockUsers.map((u) => (
            <div key={u.email} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">{u.name}</h4>
                  <p className="text-[11px] text-muted-foreground">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                  u.role === 'ADMIN'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : u.role === 'OPERATOR'
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {u.role}
                </span>
                <span className="text-xs text-emerald-400 font-medium">● {u.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
