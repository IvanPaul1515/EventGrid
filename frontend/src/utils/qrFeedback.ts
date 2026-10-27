export function qrFeedback(status: string) {
  switch (status) {
    case 'REVOKED': return { title: 'Entrada revocada', message: 'Esta entrada ya no está autorizada para acceder al evento. Consulta con el personal de recepción.' };
    case 'CANCELLED': return { title: 'Entrada cancelada', message: 'Esta inscripción fue cancelada y no permite registrar asistencia.' };
    case 'ALREADY_CHECKED_IN': return { title: 'Asistencia ya registrada', message: 'Esta entrada ya fue utilizada. No se registró una nueva asistencia.' };
    case 'EDITION_MISMATCH': return { title: 'Entrada de otra edición', message: 'Esta entrada no corresponde a la edición activa.' };
    case 'BUSY': return { title: 'La estación está atendiendo a otro participante', message: 'Espera a que la computadora termine la operación. La ficha abierta permanece intacta.' };
    case 'NETWORK': return { title: 'No se pudo verificar la entrada', message: 'Comprueba la conexión e inténtalo nuevamente. No se ha confirmado asistencia.' };
    default: return { title: 'Entrada no válida', message: 'No pudimos verificar este código QR. Comprueba que corresponde a una entrada oficial del evento.' };
  }
}
