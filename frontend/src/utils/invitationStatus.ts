export const invitationLabel = (status?: string) => ({
  PENDING: 'Invitación pendiente', PROCESSING: 'En procesamiento', ACCEPTED_BY_PROVIDER: 'Enviada al proveedor',
  DELIVERED: 'Entregada al servidor receptor', DEFERRED: 'Entrega aplazada', REJECTED: 'Rechazada',
  FAILED: 'Fallida', UNKNOWN_DELIVERY_STATUS: 'Resultado de envío sin confirmar', EXPIRED: 'Enlace vencido',
  ACCEPTED: 'Cuenta activada', ACTIVATED: 'Cuenta activada', INVALID_USER: 'Cuenta o correo no válido',
}[status || 'PENDING'] || 'Invitación pendiente');
export const roleLabel = (role: string) => role === 'ADMIN' ? 'Administrador' : role === 'OPERATOR' ? 'Operador' : 'Consulta';
