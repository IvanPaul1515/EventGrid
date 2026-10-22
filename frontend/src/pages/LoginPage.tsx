import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isDev = import.meta.env.DEV;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevenir doble envío accidental
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password
      });
      const { token, user } = res.data.data;
      login(token, user);
      navigate('/', { replace: true });
    } catch (err: any) {
      // Manejo de errores de autenticación seguro: no revelar si el correo existe o no
      const status = err.response?.status;
      if (status === 401 || status === 400) {
        setError('Credenciales inválidas. Verifique su correo electrónico y contraseña.');
      } else if (status === 429) {
        setError('Demasiados intentos fallidos. Por seguridad, espere unos minutos antes de intentar nuevamente.');
      } else if (!err.response) {
        setError('No fue posible conectar con el servidor. Verifique su conexión de red.');
      } else {
        setError('Error al procesar el inicio de sesión. Por favor intente más tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  // En entorno local de desarrollo, permite rellenar únicamente el correo (nunca la contraseña)
  const handleQuickEmailFill = (roleEmail: string) => {
    setEmail(roleEmail);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0707] text-[#f5f1ec] p-4 sm:p-6 relative overflow-hidden selection:bg-[#ED2917] selection:text-white">
      {/* Resplandores y gradientes atmosféricos de BarCamp 2026 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[320px] sm:w-[600px] h-[250px] sm:h-[350px] bg-[#ED2917]/10 rounded-full blur-[100px] sm:blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-[#B60604]/15 rounded-full blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10 my-auto">
        {/* Encabezado con Logo Oficial BarCamp 2026 */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
            <img
              src="/barcamp-logo-white.svg"
              alt="Barcamp RD 2026"
              className="h-12 sm:h-14 w-auto object-contain filter drop-shadow-[0_4px_24px_rgba(237,41,23,0.35)]"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-white">
            BARCAMP <span className="text-[#ED2917]">2026</span>
          </h1>
          <p className="text-xs text-[#a8a09a] font-mono tracking-wider mt-1 uppercase">
            Plataforma Administrativa EventGrid
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1a1212] border border-[#2a1d1d] text-[11px] text-[#a8a09a] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sistema Oficial &bull; <strong className="text-white">República Dominicana</strong></span>
          </div>
        </div>

        {/* Tarjeta de Inicio de Sesión con Glass cálido */}
        <div className="bg-[#110c0c]/95 border border-[#261a1a] rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-5 sm:mb-6 text-sm text-[#e5dfd8] font-medium pb-3 border-b border-[#261a1a]">
            <Lock className="w-4 h-4 text-[#ED2917]" />
            <span className="font-display font-bold">Acceso al Panel de Control</span>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#ED2917] mt-0.5" />
              <span className="leading-relaxed">{error}</span>
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
                  placeholder="usuario@barcamp.org.do"
                  required
                  disabled={loading}
                  autoComplete="username"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#1a1212] border border-[#2d1e1e] rounded-xl text-sm text-[#f5f1ec] placeholder-[#6b6460] focus:outline-none focus:ring-1 focus:ring-[#ED2917] focus:border-[#ED2917] transition-all font-mono disabled:opacity-50"
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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-[#1a1212] border border-[#2d1e1e] rounded-xl text-sm text-[#f5f1ec] placeholder-[#6b6460] focus:outline-none focus:ring-1 focus:ring-[#ED2917] focus:border-[#ED2917] transition-all font-mono disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6b6460] hover:text-[#f5f1ec] transition-colors cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-3 px-4 rounded-full bg-gradient-to-r from-[#ED2917] to-[#BA1513] hover:from-[#f03b2a] hover:to-[#cb1917] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#ED2917]/25 hover:shadow-[#ED2917]/40 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Validando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la Plataforma</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Accesos rápidos sólo en entorno local aislado de desarrollo, autocompletando únicamente el email */}
          {isDev && (
            <div className="mt-6 pt-5 border-t border-[#261a1a]">
              <p className="text-[10px] uppercase tracking-wider font-mono text-[#a8a09a] mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ED2917]" />
                Completar correo de prueba (dev local):
              </p>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => handleQuickEmailFill('admin@barcamp.org.do')}
                  className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center cursor-pointer"
                  title="Autocompletar correo de Administrador"
                >
                  <strong className="block text-[#ED2917] font-bold">Admin</strong>
                  <span className="text-[9px] text-[#6b6460]">admin@...</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickEmailFill('operador@barcamp.org.do')}
                  className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center cursor-pointer"
                  title="Autocompletar correo de Operador"
                >
                  <strong className="block text-blue-400 font-bold">Operador</strong>
                  <span className="text-[9px] text-[#6b6460]">operador@...</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickEmailFill('consulta@barcamp.org.do')}
                  className="px-2 py-1.5 rounded-xl bg-[#1a1212] hover:bg-[#251919] border border-[#2d1e1e] text-[#e5dfd8] hover:text-white transition-colors text-center cursor-pointer"
                  title="Autocompletar correo de Consulta"
                >
                  <strong className="block text-[#a8a09a] font-bold">Consulta</strong>
                  <span className="text-[9px] text-[#6b6460]">consulta@...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pie de página */}
        <p className="text-center text-[11px] text-[#6b6460] font-mono mt-6">
          EventGrid &bull; Plataforma Oficial BarCamp RD &copy; 2026.
        </p>
      </div>
    </div>
  );
};
