import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Grid, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data.data;
      login(token, user);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al iniciar sesión. Verifique sus credenciales';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Botones de acceso rápido para desarrollo y auditoría inicial
  const handleQuickLogin = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-barcamp-black text-white p-4 relative overflow-hidden">
      {/* Resplandores y gradientes sutiles de fondo BarCamp */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-barcamp-wine/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Encabezado con Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-barcamp-crimson shadow-xl shadow-primary/30 ring-1 ring-primary/50 mb-3 animate-in fade-in zoom-in duration-300">
            <Grid className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            EVENT<span className="text-primary font-black">GRID</span>
          </h1>
          <p className="text-xs text-zinc-300 font-semibold mt-1">
            Plataforma de Gestión de Eventos y Participantes
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5 max-w-sm mx-auto">
            Software independiente y adaptable para la administración de inscripciones, ventas, pagos y control de asistencia.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Edición activa: <strong className="text-zinc-200">BarCamp RD 2026</strong></span>
          </div>
        </div>

        {/* Tarjeta de Inicio de Sesión */}
        <div className="bg-barcamp-dark/95 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-6 text-sm text-zinc-300 font-medium pb-3 border-b border-zinc-800">
            <Lock className="w-4 h-4 text-primary" />
            <span>Acceso al Panel de Control</span>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@barcamp.org.do"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-700/80 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-700/80 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 transition-all duration-150 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Ingresar a la Plataforma</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Cuentas de Acceso Rápido Inicial */}
          <div className="mt-6 pt-5 border-t border-zinc-800">
            <p className="text-[11px] uppercase tracking-wider font-mono text-zinc-500 mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              Credenciales configuradas (Fase 1):
            </p>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@barcamp.org.do', 'BarCamp2026!Admin')}
                className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition-colors text-center"
              >
                <strong className="block text-rose-400 font-semibold">Admin</strong>
                <span className="text-[10px] text-zinc-500">Completo</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('operador@barcamp.org.do', 'BarCamp2026!Op')}
                className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition-colors text-center"
              >
                <strong className="block text-indigo-400 font-semibold">Operador</strong>
                <span className="text-[10px] text-zinc-500">Edición</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('consulta@barcamp.org.do', 'BarCamp2026!View')}
                className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition-colors text-center"
              >
                <strong className="block text-zinc-400 font-semibold">Consulta</strong>
                <span className="text-[10px] text-zinc-500">Lectura</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pie de página */}
        <p className="text-center text-[11px] text-zinc-600 mt-6">
          EventGrid &bull; BarCamp República Dominicana &copy; 2026. PUCMM Campus Santiago.
        </p>
      </div>
    </div>
  );
};
