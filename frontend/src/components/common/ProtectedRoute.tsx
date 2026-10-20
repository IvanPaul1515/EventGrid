import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-barcamp-black text-white gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-zinc-400">Verificando sesión BarCamp RD...</p>
      </div>
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
