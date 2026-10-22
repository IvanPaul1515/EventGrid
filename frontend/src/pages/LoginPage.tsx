import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

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

  const handleQuickLogin = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0707] text-[#f5f1ec] p-4 relative overflow-hidden">
      {/* Resplandores y gradientes atmosféricos de BarCamp 2026 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#ED2917]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-[#B60604]/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Encabezado con Logo Oficial BarCamp 2026 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/barcamp-logo-white.svg"
              alt="Barcamp 2026"
              className="h-14 w-auto object-contain filter drop-shadow-[0_4px_24px_rgba(237,41,23,0.35)]"
            />
          </div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight text-white">
            BARCAMP <span className="text-[#ED2917]">2026</span>
          </h1>
          <p className="text-xs text-[#a8a09a] font-mono tracking-wider mt-1 uppercase">
            Plataforma Administrativa EventGrid
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1a1212] border border-[#2a1d1d] text-[11px] text-[#a8a09a] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Edición activa: <strong className="text-white">PUCMM Santiago</strong></span>
          </div>
        </div>

        {/* Tarjeta de Inicio de Sesión con Glass cálido */}
        <div className="bg-[#110c0c]/90 border border-[#261a1a] rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-6 text-sm text-[#e5dfd8] font-medium pb-3 border-b border-[#261a1a]">
            <Lock className="w-4 h-4 text-primary" />
            <span className="font-display font-bold">Acceso al Panel de Control</span>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-[#a8a09a] uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6b6460]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@barcamp.org.do"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#1a1212] border border-[#2d1e1e] rounded-xl text-sm text-[#f5f1ec] placeholder-[#6b6460] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-[#a8a09a] uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6b6460]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#1a1212] border border-[#2d1e1e] rounded-xl text-sm text-[#f5f1ec] placeholder-[#6b6460] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-full bg-gradient-to-r from-primary to-[#BA1513] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-150 disabled:opacity-50 cursor-pointer"
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
          <div className="mt-6 pt-5 border-t border-[#261a1a]">
            <p className="text-[11px] uppercase tracking-wider font-mono text-[#a8a09a] mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Credenciales rápidas de acceso:
            </p>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@barcamp.org.do', 'BarCamp2026!Admin')}
                className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center"
              >
                <strong className="block text-primary font-bold">Admin</strong>
                <span className="text-[10px] text-[#6b6460]">Completo</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('operador@barcamp.org.do', 'BarCamp2026!Op')}
                className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center"
              >
                <strong className="block text-blue-400 font-bold">Operador</strong>
                <span className="text-[10px] text-[#6b6460]">Edición</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('consulta@barcamp.org.do', 'BarCamp2026!View')}
                className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center"
              >
                <strong className="block text-[#a8a09a] font-bold">Consulta</strong>
                <span className="text-[10px] text-[#6b6460]">Lectura</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pie de página */}
        <p className="text-center text-[11px] text-[#6b6460] font-mono mt-6">
          EventGrid &bull; Plataforma Oficial BarCamp RD &copy; 2026.
        </p>
      </div>
    </div>
  );
};
