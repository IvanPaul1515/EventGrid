export interface FormattedEmailStatus {
  code: string;
  label: string;
  description: string;
  badgeClass: string;
}

export function formatEmailStatus(rawStatus?: string | null): FormattedEmailStatus {
  const s = (rawStatus || '').toUpperCase().trim();
  switch (s) {
    case 'ACCEPTED_BY_SMTP':
    case 'SENT':
      return {
        code: 'ACCEPTED_BY_SMTP',
        label: 'Aceptado por el proveedor',
        description: 'El proveedor aceptó el mensaje para su procesamiento. La entrega al destinatario todavía no está confirmada.',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
      };
    case 'DELIVERED':
      return {
        code: 'DELIVERED',
        label: 'Entregado',
        description: 'El proveedor confirmó entrega al servidor destinatario. No garantiza lectura ni llegada a la bandeja principal.',
        badgeClass: 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-600/40',
      };
    case 'SIMULATED':
      return {
        code: 'SIMULATED',
        label: 'Simulado',
        description: 'Envío simulado en entorno seguro sin llamadas externas ni consumo de cuota.',
        badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30',
      };
    case 'PENDING':
      return {
        code: 'PENDING',
        label: 'Pendiente',
        description: 'Pendiente de una operación expresamente autorizada. No se reanuda automáticamente.',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
      };
    case 'PROCESSING':
      return {
        code: 'PROCESSING',
        label: 'Procesando',
        description: 'En proceso de conexión y transmisión al servidor SMTP.',
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
      };
    case 'REJECTED':
      return {
        code: 'REJECTED',
        label: 'Rechazado',
        description: 'Rechazado por el servidor SMTP o buzón inexistente/bloqueado.',
        badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30',
      };
    case 'DEFERRED':
      return { code: s, label: 'Aplazado', description: 'El proveedor aplazó el procesamiento. No se reenvía automáticamente desde EventGrid.', badgeClass: 'text-amber-500 border border-border' };
    case 'BLOCKED':
      return { code: s, label: 'Bloqueado', description: 'El proveedor bloqueó el mensaje. Revise el motivo antes de autorizar otra operación.', badgeClass: 'text-rose-500 border border-border' };
    case 'FAILED':
      return {
        code: 'FAILED',
        label: 'Fallido',
        description: 'Ocurrió un error en el intento de envío.',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
      };
    case 'UNKNOWN_DELIVERY_STATUS':
      return {
        code: 'UNKNOWN_DELIVERY_STATUS',
        label: 'Estado desconocido',
        description: 'Hubo un intento previo pero se perdió la confirmación. El mensaje podría haber sido entregado.',
        badgeClass: 'bg-amber-600/20 text-amber-700 dark:text-amber-300 border border-amber-600/40',
      };
    case 'CANCELLED':
      return {
        code: 'CANCELLED',
        label: 'Cancelado',
        description: 'Envío cancelado antes de procesarse.',
        badgeClass: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30',
      };
    default:
      return {
        code: s || 'UNKNOWN',
        label: s || 'Desconocido',
        description: 'Estado no identificado.',
        badgeClass: 'bg-muted text-muted-foreground border border-border',
      };
  }
}

export function formatTemplateName(code?: string | null): string {
  if (!code) return 'Comunicación General';
  switch (code) {
    case 'DIGITAL_TICKET':
      return 'Entrada Digital';
    case 'INSCRIPTION_CONFIRMATION':
      return 'Confirmación de Registro';
    case 'EVENT_REMINDER':
      return 'Recordatorio del Evento';
    case 'PAYMENT_CONFIRMATION':
      return 'Confirmación de Pago';
    case 'PENDING_BALANCE':
      return 'Balance Pendiente';
    case 'INSCRIPTION_CANCELLED':
      return 'Inscripción Cancelada';
    case 'KEYNOTE_ANNOUNCEMENT':
      return 'Anuncio de Keynote';
    case 'SCHEDULE_UPDATE':
      return 'Actualización de Cronograma';
    case 'GENERAL_ANNOUNCEMENT':
      return 'Anuncio General';
    case 'TEST_CONNECTION':
      return 'Prueba de Conexión';
    default:
      return code.replace(/_/g, ' ');
  }
}
