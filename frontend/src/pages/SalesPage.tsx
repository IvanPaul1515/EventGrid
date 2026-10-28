import {PurchaseChronology} from '../components/sales/PurchaseChronology';
import {ReceiptReader} from '../components/sales/ReceiptReader';
import type {ReceiptDraft} from '../utils/receiptOcr';
import {Link} from 'react-router-dom';
import { FinancialOperationsPanel } from '../components/sales/FinancialOperationsPanel';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { MobileSearchInput } from '../components/common/MobileSearchInput';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { eventsService } from '../services/events.service';
import { participantsService } from '../services/participants.service';
import { FinancialSummary, TicketType, PaymentMethod } from '../types';
import { OnsiteSaleModal } from '../components/sales/OnsiteSaleModal';
import { api } from '../services/api';
import {
  BadgeDollarSign,
  CreditCard,
  UserCheck,
  AlertCircle,
  Download,
  RefreshCw,
  ShoppingBag,
  Tag,
  TrendingUp,
  Wallet,
  Landmark,
  Receipt,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpDown,
  Search,
} from 'lucide-react';

export const SalesPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();

  const [readingReceipt,setReadingReceipt]=useState(false),[receiptDraft,setReceiptDraft]=useState<ReceiptDraft>();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isOnsiteSaleOpen, setIsOnsiteSaleOpen] = useState(false);
  const [selectedMethodFilter, setSelectedMethodFilter] = useState('');
  const [searchTx, setSearchTx] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const currency = summary?.currencySymbol || currentEvent?.settings?.currencySymbol || 'RD$';

  const readVersion = useRef(0);
  const loadFinancialData = useCallback(async (silent = false) => {
    if (!currentEvent) return;
    const version = ++readVersion.current;
    try {
      if (!silent) setLoading(true);
      const [finSummary, eventDetails] = await Promise.all([
        eventsService.getFinancialSummary(currentEvent.id),
        api.get(`/events/${currentEvent.id}`).then((res) => res.data.data),
      ]);
      if (version !== readVersion.current) return;
      setSummary(finSummary);
      setTicketTypes(eventDetails?.ticketTypes || []);
      setPaymentMethods(eventDetails?.paymentMethods || []);
    } catch (err: any) {
      console.error('Error cargando conciliación financiera:', err);
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, [currentEvent]);

  useRealtimeRefresh('sales', () => loadFinancialData(true));

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  // Escuchar eventos de sincronización del sistema
  useEffect(() => {
    const handleSync = () => {
      loadFinancialData();
    };
    window.addEventListener('eventgrid:data-refresh', handleSync);
    return () => {
      window.removeEventListener('eventgrid:data-refresh', handleSync);
    };
  }, [loadFinancialData]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      setExportLoading(true);
      await participantsService.export({}, format);
      setNotification({
        type: 'success',
        message: `Reporte de ventas descargado en formato ${format.toUpperCase()}`,
      });
      setTimeout(() => setNotification(null), 4000);
    } catch {
      setNotification({
        type: 'error',
        message: 'Error al exportar los datos contables',
      });
    } finally {
      setExportLoading(false);
    }
  };

  const filteredTransactions = (summary?.recentTransactions || []).filter((tx) => {
    const matchesMethod = selectedMethodFilter ? tx.method === selectedMethodFilter : true;
    const term = searchTx.toLowerCase().trim();
    const matchesSearch = term
      ? tx.participantName.toLowerCase().includes(term) ||
        tx.ticketNumber.toLowerCase().includes(term) ||
        tx.method.toLowerCase().includes(term) ||
        tx.reference.toLowerCase().includes(term)
      : true;
    return matchesMethod && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <details><summary className="cursor-pointer font-semibold">Consultar orden de compras</summary><PurchaseChronology key={currentEvent?.id}/></details>
      {/* Cabecera del Módulo de Ventas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Módulo Financiero y Conciliación • Fase 4</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Ventas y Conciliación Financiera
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Libro contable, arqueo de caja y conciliación de cobros para <strong>{currentEvent?.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {hasRole(['ADMIN','OPERATOR'])&&<button className="btn-secondary" onClick={()=>setReadingReceipt(true)}>Leer comprobante</button>}
          {hasRole(['ADMIN','OPERATOR'])&&<Link className="btn-secondary" to="/import?destination=PURCHASES">Importar Excel de compras</Link>}
          <button
            type="button"
            onClick={() => { void loadFinancialData(); }}
            disabled={loading}
            className="p-2.5 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Refrescar balance contable"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={exportLoading}
            className="px-3.5 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Exportar conciliación a Excel"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>

          {hasRole(['ADMIN', 'OPERATOR']) && (
            <button
              type="button"
              onClick={() => setIsOnsiteSaleOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Nueva Venta Presencial</span>
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {summary?.reconciliation && <div className="card p-4 text-sm space-y-2">
        <p className="font-semibold">Procedencia de los pagos acreditados</p>
        <p>Universidad / plataforma externa: {currency} {summary.reconciliation.externalPayments.toFixed(2)} · Caja EventGrid: {currency} {summary.reconciliation.onsitePayments.toFixed(2)} · Histórico sin atribuir: {currency} {summary.reconciliation.legacyUnattributed.toFixed(2)}</p>
        <p>Devoluciones confirmadas: {currency} {summary.reconciliation.refunded.toFixed(2)} · Neto acreditado: {currency} {summary.reconciliation.netAccredited.toFixed(2)}</p>
        <p className="text-muted-foreground">{summary.reconciliation.netDefinition}</p>
      </div>}
      {currentEvent && hasRole(['ADMIN']) && <FinancialOperationsPanel key={currentEvent.id} eventId={currentEvent.id} tickets={ticketTypes} onChange={() => void loadFinancialData(true)} />}
      {/* Tarjetas KPI Financieras Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Total Recaudado / Ingresos Brutos */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Neto acreditado
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
            {currency} {Number(summary?.totalRevenue || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Cobros confirmados:</span>
            <strong className="text-foreground">{summary?.verifiedPaymentsCount || 0} pagos</strong>
          </div>
        </div>

        {/* KPI 2: Por Cobrar / Balances Pendientes */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Por Cobrar / Pendiente
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-tight">
            {currency} {Number(summary?.totalPending || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Venta proyectada:</span>
            <strong className="text-foreground">{currency} {Number(summary?.totalExpected || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {/* KPI 3: Cortesías Oficiales Autorizadas */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cortesías Autorizadas
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-300 font-mono tracking-tight">
            {summary?.courtesyCount || 0} <span className="text-xs text-muted-foreground font-sans font-normal">boletos</span>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Exentas de cobro:</span>
            <strong className="text-foreground font-mono">RD$ 0.00</strong>
          </div>
        </div>
      </div>

      {/* Desglose Gráfico: Métodos de Pago y Tipos de Entrada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna 1: Distribución por Método de Pago */}
        <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recaudación por Método de Pago
              </h3>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {summary?.byMethod.length || 0} métodos
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Cargando desglose...</div>
          ) : !summary?.byMethod || summary.byMethod.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No hay pagos registrados todavía en esta edición.
            </div>
          ) : (
            <div className="space-y-3.5">
              {summary.byMethod.map((m) => {
                const total = summary.reconciliation?.confirmedPayments || summary.totalRevenue || 1;
                const percentage = Math.min(100, Math.round((m.totalAmount / total) * 100));
                return (
                  <div key={m.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                        {m.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px] font-mono">
                          {m.count} {m.count === 1 ? 'pago' : 'pagos'}
                        </span>
                        <strong className="text-foreground font-mono">
                          {currency} {Number(m.totalAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-barcamp-crimson rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna 2: Distribución por Tipo de Entrada */}
        <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recaudación por Tipo de Entrada
              </h3>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {summary?.byTicketType.length || 0} tipos
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Cargando tipos de entrada...</div>
          ) : !summary?.byTicketType || summary.byTicketType.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No hay boletos vendidos en esta edición.
            </div>
          ) : (
            <div className="space-y-3.5">
              {summary.byTicketType.map((t) => {
                const total = summary.reconciliation?.confirmedPayments || summary.totalRevenue || 1;
                const percentage = Math.min(100, Math.round((t.totalRevenue / total) * 100));
                return (
                  <div key={t.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        {t.name}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({currency} {Number(t.price).toFixed(0)})
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px] font-mono">
                          {t.count} boletos
                        </span>
                        <strong className="text-foreground font-mono">
                          {currency} {Number(t.totalRevenue).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Historial Detallado de Transacciones Financieras */}
      <div className="rounded-2xl bg-card border border-border shadow-sm space-y-4 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Libro de Transacciones y Pagos Recientes
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detalle cronológico de abonos, pagos en taquilla y registros monetarios.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <MobileSearchInput
                type="text"
                value={searchTx}
                onChange={(e) => setSearchTx(e.target.value)}
                placeholder="Buscar participante, ticket..."
                className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <select
              value={selectedMethodFilter}
              onChange={(e) => setSelectedMethodFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los métodos</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.name}>{pm.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* VISTA ADAPTATIVA EN TARJETAS PARA CELULARES (< md) */}
        <div className="md:hidden divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Cargando libro contable...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">No se encontraron transacciones.</div>
          ) : (
            filteredTransactions.map((tx) => (
              <div key={tx.id} className="py-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {tx.ticketNumber}
                  </span>
                  <span className="font-mono font-black text-sm text-emerald-400">
                    {currency} {Number(tx.amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">{tx.participantName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-muted font-medium text-foreground">
                    {tx.method}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{new Date(tx.timestamp).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span>Operador: <strong className="text-foreground">{tx.operator}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* TABLA DE ESCRITORIO (>= md) */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="p-3 font-bold">Fecha / Hora</th>
                <th className="p-3 font-bold">No. Ticket</th>
                <th className="p-3 font-bold">Participante</th>
                <th className="p-3 font-bold">Método</th>
                <th className="p-3 font-bold">Concepto / Ref.</th>
                <th className="p-3 font-bold">Operador</th>
                <th className="p-3 font-bold text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Cargando transacciones...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No se encontraron transacciones financieras con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                      {new Date(tx.timestamp).toLocaleString('es-DO', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 whitespace-nowrap font-mono font-bold text-foreground">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-white text-[11px]">
                        {tx.ticketNumber}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap font-bold text-foreground">
                      {tx.participantName}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-foreground">
                        {tx.method}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground text-[11px] truncate max-w-[150px]">
                      {tx.reference}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground text-[11px]">
                      {tx.operator}
                    </td>
                    <td className="p-3 whitespace-nowrap font-mono font-bold text-emerald-400 text-right text-xs">
                      {currency} {Number(tx.amount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Nueva Venta Presencial */}
      {readingReceipt&&<ReceiptReader onClose={()=>setReadingReceipt(false)} onUse={draft=>{setReceiptDraft(draft);setReadingReceipt(false);setIsOnsiteSaleOpen(true);}}/>}
      <OnsiteSaleModal
        receiptDraft={receiptDraft}
        isOpen={isOnsiteSaleOpen}
        onClose={() => setIsOnsiteSaleOpen(false)}
        ticketTypes={ticketTypes}
        paymentMethods={paymentMethods}
        onSaleSuccess={async () => {
          await loadFinancialData();
          window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
          setNotification({
            type: 'success',
            message: 'Venta presencial completada e integrada al libro contable',
          });
        }}
      />
    </div>
  );
};
