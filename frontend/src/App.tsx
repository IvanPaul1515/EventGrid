import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { EditionProvider } from './context/EditionContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { ImportPage } from './pages/ImportPage';
import { SalesPage } from './pages/SalesPage';
import { EditionsPage } from './pages/EditionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { AttendancePage } from './pages/AttendancePage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <EditionProvider>
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
                  <Route path="/editions" element={<EditionsPage />} />
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
      </EditionProvider>
    </AuthProvider>
  );
};

export default App;
