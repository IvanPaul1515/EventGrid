import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ErrorPanel } from './components/common/ErrorPanel';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';
import { EditionProvider } from './context/EditionContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';
import { AppLoadingScreen } from './components/common/AppLoadingScreen';
import { useMobileViewport } from './hooks/useMobileViewport';

const StaffPage = React.lazy(() => import('./pages/StaffPage').then(m => ({ default: m.StaffPage })));
const RecoveryPage = React.lazy(() => import('./pages/RecoveryPage').then(m => ({ default: m.RecoveryPage })));
const ActivationPage = React.lazy(() => import('./pages/ActivationPage').then(m => ({ default: m.ActivationPage })));

// Lazy loading optimizado por ruta para rendimiento SPA
const LoginPage = React.lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AttendancePage = React.lazy(() => import('./pages/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const ParticipantsPage = React.lazy(() => import('./pages/ParticipantsPage').then((m) => ({ default: m.ParticipantsPage })));
const ImportPage = React.lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const SalesPage = React.lazy(() => import('./pages/SalesPage').then((m) => ({ default: m.SalesPage })));
const SponsorsPage = React.lazy(() => import('./pages/SponsorsPage').then((m) => ({ default: m.SponsorsPage })));
const TshirtInventoryPage = React.lazy(() => import('./pages/TshirtInventoryPage').then((m) => ({ default: m.TshirtInventoryPage })));
const EditionsPage = React.lazy(() => import('./pages/EditionsPage').then((m) => ({ default: m.EditionsPage })));
const SchedulePage = React.lazy(() => import('./pages/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const CommunicationsPage = React.lazy(() => import('./pages/CommunicationsPage').then((m) => ({ default: m.CommunicationsPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const AuditPage = React.lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));

const NotFound = () => { const { isAuthenticated } = useAuth(); return <ErrorPanel kind="404" fullScreen home={isAuthenticated ? '/' : '/login'} />; };

export const App: React.FC = () => {
  useMobileViewport();
  return (
    <ErrorBoundary><AuthProvider>
      <EditionProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Suspense fallback={<AppLoadingScreen message="Cargando módulo..." />}>
                <Routes>
                  {/* Ruta Pública */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/activate" element={<ActivationPage />} />
                  <Route path="/forgot-password" element={<RecoveryPage />} />
                  <Route path="/reset-password" element={<RecoveryPage />} />

                  {/* Rutas Administrativas Protegidas */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<Layout />}>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/attendance" element={<AttendancePage />} />
                      <Route element={<ProtectedRoute allowedRoles={['ADMIN','OPERATOR']} />}><Route path="/reception" element={<AttendancePage quick />} /></Route>
                      <Route path="/participants" element={<ParticipantsPage />} />
                      <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR']} />}>
                        <Route path="/import" element={<ImportPage />} />
                        <Route path="/communications" element={<CommunicationsPage />} />
                      </Route>
                      <Route path="/sales" element={<SalesPage />} />
                      <Route path="/sponsors" element={<SponsorsPage />} />
                      <Route path="/staff" element={<StaffPage />} />
                      <Route path="/inventory" element={<TshirtInventoryPage />} />
                      <Route path="/schedule" element={<SchedulePage />} />
                      <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                        <Route path="/editions" element={<EditionsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/audit" element={<AuditPage />} />
                        <Route path="/activity" element={<AuditPage />} />
                      </Route>
                    </Route>
                  </Route>

                  {/* Fallback */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ThemeProvider>
        </RealtimeProvider>
      </EditionProvider>
    </AuthProvider></ErrorBoundary>
  );
};

export default App;
