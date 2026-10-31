export const invitationLabel = (status?: string) => ({
  PENDING: 'Pendiente de envío', QUEUED:'En cola',PROCESSING: 'Procesando', ACCEPTED_BY_PROVIDER: 'Aceptada por el servicio de envío',
  DELIVERED: 'Entregada al servidor receptor', DEFERRED: 'Entrega aplazada', REJECTED: 'Rechazada',
  FAILED: 'Fallida', UNKNOWN_DELIVERY_STATUS: 'Resultado desconocido', EXPIRED: 'Invitación vencida',
  ACCEPTED: 'Cuenta activada', ACTIVATED: 'Cuenta activada', INVALID_USER: 'Cuenta o correo no válido',
}[status || 'PENDING'] || 'Pendiente de envío');
export const roleLabel = (role: string) => role === 'ADMIN' ? 'Administrador' : role === 'OPERATOR' ? 'Operador' : 'Consulta';
