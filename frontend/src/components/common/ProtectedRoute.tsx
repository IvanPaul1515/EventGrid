import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { AppLoadingScreen } from './AppLoadingScreen';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <AppLoadingScreen
        message="Verificando sesión..."
        submessage="Validando credenciales de acceso"
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-20 text-center bg-card border border-border rounded-xl">
        <h2 className="text-xl font-bold text-destructive mb-2">Acceso No Autorizado</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tu rol actual (<strong className="font-mono text-foreground">{user.role}</strong>) no dispone de permisos para acceder a esta sección administrativa.
        </p>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
        >
          Regresar
        </button>
      </div>
    );
  }

  return <Outlet />;
};
