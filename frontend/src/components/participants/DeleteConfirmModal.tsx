import React from 'react';
import { Registration } from '../../types';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  registration: Registration | null;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  registration,
  isOpen,
  loading,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !registration) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-destructive/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 className="text-base font-black text-center text-foreground">
          ¿Eliminar Inscripción?
        </h3>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Estás a punto de eliminar el ticket{' '}
          <strong className="text-foreground font-mono">{registration.registrationNumber}</strong> perteneciente a{' '}
          <strong className="text-foreground">{registration.participant.fullName}</strong>.
        </p>

        <p className="text-[11px] text-zinc-500 text-center mt-3 p-2.5 rounded-lg bg-background border border-border">
          Esta acción removerá su participación en esta edición y quedará registrada en el historial de auditoría.
        </p>

        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Confirmar Eliminación</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
