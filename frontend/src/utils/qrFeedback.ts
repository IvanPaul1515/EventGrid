export function qrFeedback(status: string) {
  switch (status) {
    case 'REVOKED': return { title: 'Entrada revocada', message: 'Esta entrada ya no está autorizada para acceder al evento. Consulta con el personal de recepción.' };
    case 'CANCELLED': return { title: 'Entrada cancelada', message: 'Esta inscripción fue cancelada y no permite registrar asistencia.' };
    case 'ALREADY_CHECKED_IN': return { title: 'Asistencia ya registrada', message: 'Esta entrada ya fue utilizada. No se registró una nueva asistencia.' };
    case 'EDITION_MISMATCH': return { title: 'Entrada de otra edición', message: 'Esta entrada no corresponde a la edición activa.' };
    case 'BUSY': return { title: 'La estación está atendiendo a otro participante', message: 'Espera a que la computadora termine la operación. La ficha abierta permanece intacta.' };
    case 'VALID': return { title: 'Entrada válida', message: 'Puedes continuar con la recepción.' };
    case 'QUEUED': return { title: 'Esta entrada ya está en la cola', message: 'No se duplicó la entrada ni se modificó su talla.' };
    case 'PAIRING_CODE': return { title: 'QR de vinculación', message: 'Este QR conecta dispositivos. Utiliza Escanear QR de vinculación; no es una entrada de participante.' };
    case 'NETWORK': return { title: 'No se pudo conectar. Intenta nuevamente', message: 'Comprueba la conexión. No se ha confirmado asistencia.' };
    case 'SCANNER_UNLINKED': return { title: 'Tu escáner ya no está vinculado', message: 'Solicita una nueva invitación a la PC de recepción.' };
    case 'SESSION_EXPIRED': return { title: 'Tu sesión ha expirado', message: 'Inicia sesión nuevamente para continuar.' };
    case 'ACCESS_DENIED': return { title: 'Acceso restringido', message: 'Comprueba los permisos y la edición asignada a tu cuenta.' };
    case 'SERVER_ERROR': return { title: 'Servicio temporalmente no disponible', message: 'Intenta nuevamente cuando se restablezca el servicio.' };
    case 'INVALID_CODE': return { title: 'Entrada no válida', message: 'Comprueba que corresponde a una entrada oficial del evento.' };
    default: return { title: 'No se pudo completar la validación', message: 'Intenta nuevamente o consulta con recepción. No se ha confirmado asistencia.' };
  }
}

export function qrFailureStatus(error: {response?:{status?:number;data?:{details?:{code?:string}}}}) {
  const status=error.response?.status,code=error.response?.data?.details?.code;
  if(code==='SCANNER_UNLINKED')return 'SCANNER_UNLINKED';
  if(status===401)return 'SESSION_EXPIRED';
  if(status===403)return 'ACCESS_DENIED';
  if(status&&status>=500)return 'SERVER_ERROR';
  if(!status)return 'NETWORK';
  return 'REQUEST_ERROR';
}
