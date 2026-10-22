import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  User,
  AlertCircle,
  ShieldAlert,
  Database,
  ArrowRight,
} from 'lucide-react';
import { participantsService } from '../../services/participants.service';
import { useEdition } from '../../context/EditionContext';

interface DeleteExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  defaultTab?: 'imported' | 'purge';
}

export const DeleteExcelModal: React.FC<DeleteExcelModalProps> = ({
  isOpen,
  onClose,
  onDeleted,
  defaultTab = 'imported',
}) => {
  const { currentEvent } = useEdition();
  const [activeTab, setActiveTab] = useState<'imported' | 'purge'>(defaultTab);

  // Datos y preview
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');

  // Estados de ejecución
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Seguridad de vaciado de edición
  const [confirmationPhrase, setConfirmationPhrase] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setFeedback(null);
      setConfirmationPhrase('');
      setSelectedBatchId('ALL');
      loadPreview(defaultTab === 'purge' ? 'ALL_EDITION' : 'EXCEL_IMPORT');
    }
  }, [isOpen, defaultTab, currentEvent?.id]);

  const loadPreview = async (scope: 'EXCEL_IMPORT' | 'ALL_EDITION' | 'BATCH', batchId?: string) => {
    if (!currentEvent) return;
    try {
      setLoading(true);
      const bId = batchId && batchId !== 'ALL' ? batchId : undefined;
      const data = await participantsService.getDeletionPreview(scope, bId);
      setPreview(data);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al obtener resumen de registros',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: 'imported' | 'purge') => {
    setActiveTab(tab);
    setFeedback(null);
    setConfirmationPhrase('');
    loadPreview(tab === 'purge' ? 'ALL_EDITION' : selectedBatchId === 'ALL' ? 'EXCEL_IMPORT' : 'BATCH', selectedBatchId);
  };

  const handleBatchSelect = (batchId: string) => {
    setSelectedBatchId(batchId);
    setFeedback(null);
    loadPreview(batchId === 'ALL' ? 'EXCEL_IMPORT' : 'BATCH', batchId);
  };

  const handleDeleteImported = async () => {
    if (!currentEvent || deleting) return;
    try {
      setDeleting(true);
      setFeedback(null);
      const batchId = selectedBatchId === 'ALL' ? undefined : selectedBatchId;
      const res = await participantsService.deleteImported(batchId);
      setFeedback({
        type: 'success',
        message: res.message,
      });

      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      if (onDeleted) onDeleted();
      await loadPreview('EXCEL_IMPORT');
      setSelectedBatchId('ALL');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al eliminar participantes importados',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handlePurgeEdition = async () => {
    if (!currentEvent || deleting) return;
    if (confirmationPhrase.trim().toUpperCase() !== 'ELIMINAR PARTICIPANTES') {
      setFeedback({
        type: 'error',
        message: 'Debe escribir exactamente: ELIMINAR PARTICIPANTES para confirmar.',
      });
      return;
    }

    try {
      setDeleting(true);
      setFeedback(null);
      const res = await participantsService.purgeEdition(confirmationPhrase);
      setFeedback({
        type: 'success',
        message: res.message,
      });

      window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));
      if (onDeleted) onDeleted();
      setConfirmationPhrase('');
      await loadPreview('ALL_EDITION');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al vaciar los participantes de la edición',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  const isPurgePhraseValid = confirmationPhrase.trim().toUpperCase() === 'ELIMINAR PARTICIPANTES';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Mantenimiento y Eliminación de Participantes
              </h3>
              <p className="text-xs text-muted-foreground">
                Edición: <strong className="text-foreground">{currentEvent?.name || 'Edición Activa'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Selección de Acción */}
        <div className="flex border-b border-border bg-muted/15 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => handleTabChange('imported')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'imported'
                ? 'border-primary text-primary bg-card shadow-sm'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Eliminar importados desde Excel</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('purge')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'purge'
                ? 'border-rose-500 text-rose-400 bg-card shadow-sm'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Vaciar todos los participantes de la edición</span>
          </button>
        </div>

        {/* Alerta de Feedback */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium leading-relaxed">{feedback.message}</span>
          </div>
        )}

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          {activeTab === 'imported' ? (
            /* TAB 1: ELIMINAR PARTICIPANTES IMPORTADOS */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1 text-xs">
                <p className="font-semibold text-foreground">
                  Eliminación selectiva de registros importados
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Esta acción elimina de forma permanente únicamente las inscripciones originadas desde hojas de cálculo de Excel. Los participantes registrados manualmente y las ventas en taquilla se preservarán intactos.
                </p>
              </div>

              {/* Selector de Lote / Todas */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                  Seleccionar qué registros eliminar:
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => handleBatchSelect(e.target.value)}
                  disabled={loading || deleting}
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="ALL">
                    ✦ Todos los participantes importados desde Excel ({preview?.importedRegistrations ?? '...'} registros)
                  </option>
                  {preview?.batches?.map((batch: any) => (
                    <option key={batch.id} value={batch.id}>
                      Archivo: {batch.fileName} ({batch.importedRows} filas • {new Date(batch.createdAt).toLocaleDateString('es-DO')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Resumen de Impacto Previo a Confirmar */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-background border border-border text-center">
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Registros a Eliminar
                  </span>
                  <span className="text-lg font-black text-rose-400">
                    {loading ? '...' : preview?.targetCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Check-ins Afectados
                  </span>
                  <span className="text-lg font-black text-amber-400">
                    {loading ? '...' : preview?.targetAttendanceCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Registros Manuales Preservados
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {loading ? '...' : preview?.manualRegistrations ?? 0}
                  </span>
                </div>
              </div>

              {/* Lista Detallada de Archivos en Historial */}
              {preview?.batches && preview.batches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-mono uppercase text-muted-foreground block font-bold">
                    Archivos de importación disponibles en esta edición:
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {preview.batches.map((b: any) => (
                      <div
                        key={b.id}
                        onClick={() => handleBatchSelect(b.id)}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                          selectedBatchId === b.id
                            ? 'bg-primary/10 border-primary text-foreground'
                            : 'bg-muted/20 border-border hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold font-mono text-foreground">{b.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Subido el {new Date(b.createdAt).toLocaleString('es-DO')} • {b.importedRows} filas
                          </p>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted border border-border">
                          {b.registrationsCount} inscripciones
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advertencia de Impacto */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-1">
                  <p className="font-bold">Impacto operativo de la eliminación:</p>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Al confirmar, estos participantes dejarán de aparecer en listas, búsquedas, control de asistencia, dashboard y comunicaciones. Sus entradas y códigos QR quedarán inmediatamente invalidados para el acceso físico.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: VACIAR EDICIÓN COMPLETA */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Operación Crítica y Destructiva</span>
                </div>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  Esta acción vaciará <strong className="text-white">TODOS</strong> los participantes inscritos en{' '}
                  <strong className="text-white font-mono">{currentEvent?.name}</strong>, incluyendo registros manuales, ventas en taquilla e importaciones.
                </p>
              </div>

              {/* Métricas de Impacto Total */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-background border border-border text-center">
                <div className="p-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">Total a Eliminar</span>
                  <span className="text-base font-black text-rose-400">{preview?.totalRegistrations ?? 0}</span>
                </div>
                <div className="p-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">Importados</span>
                  <span className="text-base font-black text-foreground">{preview?.importedRegistrations ?? 0}</span>
                </div>
                <div className="p-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">Manuales</span>
                  <span className="text-base font-black text-foreground">{preview?.manualRegistrations ?? 0}</span>
                </div>
                <div className="p-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">Pagos / Abonos</span>
                  <span className="text-base font-black text-amber-400">{preview?.targetPaymentsCount ?? 0}</span>
                </div>
              </div>

              {/* Salvaguarda: Respaldo Automático */}
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-start gap-2.5">
                <Database className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <div className="space-y-1">
                  <p className="font-bold text-blue-200">Respaldo Automático Recuperable:</p>
                  <p className="text-[11px] text-blue-100/90 leading-relaxed">
                    Antes de proceder con la eliminación, el sistema creará automáticamente un archivo de respaldo íntegro en formato JSON en el servidor con todas las inscripciones, participantes, pagos e historiales de esta edición.
                  </p>
                </div>
              </div>

              {/* Campo de Confirmación con Frase Obligatoria */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-foreground">
                  Para autorizar el vaciado, escribe la frase de confirmación exacta:
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black px-2.5 py-1.5 rounded-lg bg-zinc-800 text-rose-400 border border-zinc-700 select-all">
                    ELIMINAR PARTICIPANTES
                  </span>
                  <span className="text-xs text-muted-foreground">← Escribe esta frase debajo</span>
                </div>
                <input
                  type="text"
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  placeholder="Escribe: ELIMINAR PARTICIPANTES"
                  disabled={deleting}
                  className="w-full px-3.5 py-2.5 bg-background border border-rose-500/50 rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Pie de Acciones */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {activeTab === 'imported' ? (
            <button
              type="button"
              onClick={handleDeleteImported}
              disabled={deleting || loading || (preview?.targetCount ?? 0) === 0}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-rose-950/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {deleting
                  ? 'Eliminando participantes...'
                  : `Eliminar ${preview?.targetCount ?? 0} participantes importados`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePurgeEdition}
              disabled={deleting || !isPurgePhraseValid || (preview?.totalRegistrations ?? 0) === 0}
              className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-rose-950/40 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>
                {deleting
                  ? 'Generando respaldo y vaciando...'
                  : `Vaciar todos los ${preview?.totalRegistrations ?? 0} participantes`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
