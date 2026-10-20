import React from 'react';
import { History, Shield, Clock } from 'lucide-react';

export const AuditPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Historial de Auditoría y Trazabilidad
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Registro inmutable de acciones administrativas: inicios de sesión, modificaciones y cargas de datos.
        </p>
      </div>

      <div className="rounded-2xl bg-card border border-border p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
          <History className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Bitácora de Seguridad Activa en Backend
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Cada acción en los controladores de autenticación, eventos y participantes queda registrada en la tabla <code>audit_logs</code> de PostgreSQL con dirección IP y usuario responsable.
        </p>
      </div>
    </div>
  );
};
