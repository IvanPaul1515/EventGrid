import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { EditionProvider } from './context/EditionContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { ImportPage } from './pages/ImportPage';
import { SalesPage } from './pages/SalesPage';
import { SponsorsPage } from './pages/SponsorsPage';
import { EditionsPage } from './pages/EditionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { AttendancePage } from './pages/AttendancePage';
import { CommunicationsPage } from './pages/CommunicationsPage';
import { TshirtInventoryPage } from './pages/TshirtInventoryPage';
import { SchedulePage } from './pages/SchedulePage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <EditionProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <BrowserRouter>
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
            </BrowserRouter>
          </ThemeProvider>
        </RealtimeProvider>
      </EditionProvider>
    </AuthProvider>
  );
};

export default App;
