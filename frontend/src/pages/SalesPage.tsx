import React from 'react';
import { useEdition } from '../context/EditionContext';
import { BadgeDollarSign, CreditCard, UserCheck, AlertTriangle } from 'lucide-react';

export const SalesPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const currency = currentEvent?.settings?.currencySymbol || 'RD$';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Ventas y Conciliación de Pagos
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Análisis financiero y control de cobros para <strong>{currentEvent?.name}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Total Recaudado</span>
          <div className="mt-2 text-2xl font-black text-foreground">{currency} 0.00</div>
          <p className="text-[11px] text-muted-foreground mt-1">Calculado en moneda nacional</p>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Pagos Verificados</span>
          <div className="mt-2 text-2xl font-black text-emerald-500">0</div>
          <p className="text-[11px] text-muted-foreground mt-1">Registros con confirmación bancaria</p>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Pendientes de Conciliación</span>
          <div className="mt-2 text-2xl font-black text-amber-500">0</div>
          <p className="text-[11px] text-muted-foreground mt-1">Verificación manual pendiente</p>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-10 text-center space-y-2">
        <BadgeDollarSign className="w-10 h-10 text-primary mx-auto opacity-80" />
        <h3 className="text-sm font-bold text-foreground">Módulo de Conciliación Configurado</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Los métodos de pago (Efectivo, Popular, BHD, Tarjeta) y los responsables de venta están catalogados por edición. En la Fase 4 se desplegarán los gráficos financieros detallados.
        </p>
      </div>
    </div>
  );
};
