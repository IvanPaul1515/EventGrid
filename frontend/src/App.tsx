import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { EditionProvider } from './context/EditionContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';
import { AppLoadingScreen } from './components/common/AppLoadingScreen';
import { useMobileViewport } from './hooks/useMobileViewport';

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

export const App: React.FC = () => {
  useMobileViewport();
  return (
    <AuthProvider>
      <EditionProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Suspense fallback={<AppLoadingScreen message="Cargando módulo..." />}>
                <Routes>
                  {/* Ruta Pública */}
                  <Route path="/login" element={<LoginPage />} />

                  {/* Rutas Administrativas Protegidas */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<Layout />}>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/attendance" element={<AttendancePage />} />
                      <Route path="/participants" element={<ParticipantsPage />} />
                      <Route path="/import" element={<ImportPage />} />
                      <Route path="/sales" element={<SalesPage />} />
                      <Route path="/sponsors" element={<SponsorsPage />} />
                      <Route path="/inventory" element={<TshirtInventoryPage />} />
                      <Route path="/editions" element={<EditionsPage />} />
                      <Route path="/schedule" element={<SchedulePage />} />
                      <Route path="/communications" element={<CommunicationsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/audit" element={<AuditPage />} />
                      <Route path="/activity" element={<AuditPage />} />
                    </Route>
                  </Route>

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ThemeProvider>
        </RealtimeProvider>
      </EditionProvider>
    </AuthProvider>
  );
};

export default App;
