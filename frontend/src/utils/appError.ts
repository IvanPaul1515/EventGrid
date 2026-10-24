export type FailureKind = 'offline' | 'network' | 'timeout' | '401' | '403' | '404' | '500' | '503';
export const failureCopy: Record<FailureKind, { title: string; message: string }> = {
  offline: { title: 'Sin conexión', message: 'Necesitas una conexión a Internet para consultar o registrar información del evento.' },
  network: { title: 'No se pudo establecer la conexión', message: 'Comprueba tu conexión e inténtalo nuevamente. No pudimos obtener una respuesta del servidor.' },
  timeout: { title: 'La conexión está tardando demasiado', message: 'No recibimos una respuesta a tiempo. Comprueba tu conexión e inténtalo nuevamente.' },
  '401': { title: 'Tu sesión ha expirado', message: 'Por seguridad, inicia sesión nuevamente para continuar.' },
  '403': { title: 'Acceso restringido', message: 'Tu cuenta no tiene permisos para acceder a esta sección.' },
  '404': { title: 'Página no encontrada', message: 'La dirección que intentas abrir no existe o ya no está disponible.' },
  '500': { title: 'Ocurrió un problema', message: 'No pudimos completar esta operación. Puedes intentarlo nuevamente.' },
  '503': { title: 'Servicio temporalmente no disponible', message: 'No podemos conectarnos con EventGrid en este momento. Comprueba tu conexión e inténtalo nuevamente.' },
};
export function failureKind(error: any): FailureKind {
  if (!navigator.onLine) return 'offline';
  const status = error?.response?.status;
  if ([401, 403, 404].includes(status)) return String(status) as FailureKind;
  if (status === 502 || status === 503 || status === 504) return '503';
  if (status >= 500) return '500';
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'timeout';
  return error?.response ? '500' : 'network';
}
