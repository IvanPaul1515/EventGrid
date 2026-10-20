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
} from 'lucide-react';
import { importService, ImportBatchItem } from '../../services/import.service';
import { useEdition } from '../../context/EditionContext';

interface DeleteExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export const DeleteExcelModal: React.FC<DeleteExcelModalProps> = ({
  isOpen,
  onClose,
  onDeleted,
}) => {
  const { currentEvent } = useEdition();
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [batchToConfirm, setBatchToConfirm] = useState<ImportBatchItem | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBatches();
      setFeedback(null);
      setBatchToConfirm(null);
      setConfirmAllOpen(false);
    }
  }, [isOpen, currentEvent?.id]);

  const loadBatches = async () => {
    try {
      setLoading(true);
      const data = await importService.getBatches();
      setBatches(data);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al cargar los lotes de importación',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (batch: ImportBatchItem) => {
    try {
      setDeletingId(batch.id);
      setFeedback(null);
      const res = await importService.deleteBatch(batch.id);
      setFeedback({
        type: 'success',
        message: `El archivo '${batch.fileName}' y sus ${res.deletedRegistrationsCount} registros fueron eliminados exitosamente.`,
      });
      setBatchToConfirm(null);
      await loadBatches();
      if (onDeleted) onDeleted();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al eliminar el lote de Excel',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true);
      setFeedback(null);
      const res = await importService.deleteAllImported();
      setFeedback({
        type: 'success',
        message: `Se eliminaron ${res.deletedBatchesCount} lote(s) y ${res.deletedRegistrationsCount} inscripciones importadas.`,
      });
      setConfirmAllOpen(false);
      await loadBatches();
      if (onDeleted) onDeleted();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al eliminar todas las importaciones',
      });
    } finally {
      setDeletingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Borrar Datos de Excel Importados
              </h3>
              <p className="text-xs text-muted-foreground">
                {currentEvent?.name || 'Edición Activa'}
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

        {/* Notificación de feedback */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Contenido principal */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Selecciona el archivo Excel que deseas eliminar. Al borrar un archivo, se eliminarán sus inscripciones asociadas y los participantes huérfanos.
            </p>
            <button
              onClick={loadBatches}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
              title="Actualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span>Cargando lotes importados...</span>
            </div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center rounded-xl bg-background border border-border text-muted-foreground text-xs space-y-2">
              <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No hay archivos Excel importados</p>
              <p className="text-[11px]">
                Actualmente no existen lotes de importación registrados para esta edición.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-4 rounded-xl border border-border bg-background/50 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {batch.fileName}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {batch.importedRows} registros
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(batch.createdAt).toLocaleString('es-DO', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {batch.importedByUser?.fullName || 'Usuario'}
                      </span>
                      {batch.errorRows > 0 && (
                        <span className="text-rose-400 font-semibold">
                          {batch.errorRows} con errores
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setBatchToConfirm(batch)}
                    disabled={deletingId === batch.id}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingId === batch.id ? 'Borrando...' : 'Borrar este Excel'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Sub-modal confirmación de borrado individual */}
          {batchToConfirm && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    ¿Confirmar eliminación de este archivo Excel?
                  </h4>
                  <p className="text-xs text-rose-200/90 leading-relaxed">
                    Se eliminará permanentemente el lote{' '}
                    <strong className="font-mono text-white">"{batchToConfirm.fileName}"</strong>{' '}
                    y todas sus <strong className="text-white">{batchToConfirm.importedRows} inscripciones</strong> asociadas. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBatchToConfirm(null)}
                  className="px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBatch(batchToConfirm)}
                  disabled={Boolean(deletingId)}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingId ? 'Borrando...' : 'Sí, eliminar archivo y registros'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Sub-modal confirmación de borrado global */}
          {confirmAllOpen && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    ¿Confirmar eliminación de TODAS las importaciones?
                  </h4>
                  <p className="text-xs text-rose-200/90 leading-relaxed">
                    Esta acción eliminará todos los lotes de Excel registrados ({batches.length}) y todas las inscripciones importadas para{' '}
                    <strong className="text-white">{currentEvent?.name}</strong>. Las inscripciones registradas manualmente se conservarán.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmAllOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingAll ? 'Borrando todo...' : 'Sí, borrar todas las importaciones'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div className="px-6 py-3.5 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          {batches.length > 1 && !confirmAllOpen && (
            <button
              onClick={() => setConfirmAllOpen(true)}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Borrar todas las importaciones de esta edición</span>
            </button>
          )}
          <div className="ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
