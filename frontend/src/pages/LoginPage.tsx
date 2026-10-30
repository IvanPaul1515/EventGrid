import React, { useState, useEffect, useRef } from 'react';
import { DemoScannerButtons } from '../components/DemoScannerButtons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { failureKind, failureCopy } from '../utils/appError';
import { api } from '../services/api';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [scannerMode,setScannerMode]=useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitting = useRef(false);
  const [demoAccess, setDemoAccess] = useState(false);
  const [demoError, setDemoError] = useState(false);
  const loadDemoAccess = async () => {
    try { const res = await api.get('/auth/demo-access'); setDemoAccess(res.data.enabled === true); setDemoError(false); }
    catch { setDemoError(true); }
  };
  useEffect(() => { void loadDemoAccess(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return; // Prevenir doble envío accidental
    setError(null);
    submitting.current = true;
    setLoading(true);

    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,scannerMode
      });
      const { token, user } = res.data.data;
      login(token, user);
      navigate(user.scannerOnly?'/reception':'/', { replace: true });
    } catch (err: any) {
      // Manejo de errores de autenticación seguro: no revelar si el correo existe o no
      const status = err.response?.status;
      if (status === 401 || status === 400) {
        setError('Credenciales inválidas. Verifique su usuario o correo y contraseña.');
      } else if (status === 429) {
        setError('Demasiados intentos fallidos. Por seguridad, espere unos minutos antes de intentar nuevamente.');
      } else if (!err.response) {
        setError(failureCopy[failureKind(err)].message);
      } else {
        setError(failureCopy[failureKind(err)].message);
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleQuickAccess = async (role: 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'SCANNER_1' | 'SCANNER_2') => {
    if (submitting.current || !demoAccess) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/demo-login', { role });
      login(res.data.data.token, res.data.data.user);
      navigate('/', { replace: true });
    } catch {
      setError('No fue posible iniciar el acceso de demostración.');
    } finally { submitting.current = false; setLoading(false); }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground p-4 sm:p-6 pb-safe-content pt-[max(1rem,env(safe-area-inset-top))] relative overflow-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Resplandores y gradientes atmosféricos de BarCamp 2026 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[320px] sm:w-[600px] h-[250px] sm:h-[350px] bg-primary/10 rounded-full blur-[100px] sm:blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-primary/15 rounded-full blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10 my-auto">
        {/* Encabezado con Logo Oficial BarCamp 2026 */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
            <img
              src="/barcamp-logo-white.svg"
              alt="Barcamp RD 2026"
              className="h-12 sm:h-14 w-auto object-contain filter on-dark-only"
            />
            <img src="/barcamp-logo-black.svg" alt="Barcamp RD 2026" className="h-12 sm:h-14 w-auto object-contain on-light-only" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-foreground">
            BARCAMP <span className="text-primary">2026</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono tracking-wider mt-1 uppercase">
            Plataforma Administrativa EventGrid
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-[11px] text-muted-foreground font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gestión de Eventos y Accesos</span>
          </div>
        </div>

        {/* Tarjeta de Inicio de Sesión con Glass cálido */}
        <div className="bg-card/95 border border-border rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-5 sm:mb-6 text-sm text-foreground font-medium pb-3 border-b border-border">
            <Lock className="w-4 h-4 text-primary" />
            <span className="font-display font-bold">{scannerMode?'Acceso de escáner QR':'Acceso al Panel de Control'}</span>
          </div>

          {error && (
            <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-destructive text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <button type="button" className="text-sm text-primary mb-4" disabled={loading} onClick={()=>{setScannerMode(v=>!v);setError(null);}}>{scannerMode?'Volver al acceso general':'Entrar como escáner'}</button>
          {scannerMode&&<p className="text-xs text-muted-foreground mb-4">Usa una cuenta restringida de escáner. La cámara y la vinculación requieren acceso autorizado.</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Correo o nombre de usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email" type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Usuario o correo"
                  required
                  disabled={loading}
                  autoComplete="username"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary transition-all font-mono disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password" type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary transition-all font-mono disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
              className="w-full mt-3 py-3 px-4 rounded-full bg-gradient-to-r from-primary to-primary hover:from-primary/90 hover:to-primary/90 text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
              <a href="/forgot-password" className="block mt-3 text-center text-xs text-muted-foreground hover:text-primary">¿Olvidaste tu contraseña?</a>

          {/* Accesos habilitados explícitamente por el servidor de demostración. */}
          {demoError && <p role="alert" className="mt-4 text-xs text-muted-foreground">No pudimos consultar los accesos de demostración. <button type="button" className="underline" onClick={() => { void loadDemoAccess(); }}>Reintentar conexión</button></p>}
          {demoAccess && (
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Accesos de demostración:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => handleQuickAccess('ADMIN')}
                  className="px-2 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground hover:text-foreground transition-colors text-center cursor-pointer"
                  disabled={loading}
                  title="Ingresar como Administrador"
                >
                  <strong className="block text-primary font-bold">Administrador</strong>
                  <span className="text-[9px] text-muted-foreground">admin@...</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAccess('OPERATOR')}
                  className="px-2 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground hover:text-foreground transition-colors text-center cursor-pointer"
                  disabled={loading}
                  title="Ingresar como Operador"
                >
                  <strong className="block text-primary font-bold">Operador</strong>
                  <span className="text-[9px] text-muted-foreground">operador@...</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAccess('VIEWER')}
                  className="px-2 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground hover:text-foreground transition-colors text-center cursor-pointer"
                  disabled={loading}
                  title="Ingresar como Consulta"
                >
                  <strong className="block text-muted-foreground font-bold">Consulta</strong>
                  <span className="text-[9px] text-muted-foreground">consulta@...</span>
                </button>
                <DemoScannerButtons loading={loading} onSelect={handleQuickAccess} />
              </div>
            </div>
          )}
        </div>

        {/* Pie de página */}
        <p className="text-center text-[11px] text-muted-foreground font-mono mt-6">
          © {new Date().getFullYear()} EventGrid. Todos los derechos reservados.<br />
          <span className="block mt-1 text-[10px]">Desarrollado por Iván Marcelino</span>
        </p>
      </div>
    </div>
  );
};
