export function uncertainMailFailure(error: any) {
  if (['EAUTH','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETLS','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error?.code)) return false;
  if (['CONN','AUTH','EHLO','STARTTLS'].includes(error?.command)) return false;
  if (error?.responseCode >= 400 && error?.responseCode < 600) return false;
  return true; // Without a definitive rejection, never assume a safe automatic retry.
}
export function mailFailureMessage(error: any) {
  if (error?.responseCode === 429) return 'Límite del proveedor alcanzado. Revise su cuota antes de autorizar otro envío.';
  if (error?.code === 'EAUTH' || [401,403].includes(error?.responseCode)) return 'El proveedor rechazó la autenticación. El administrador debe revisar las credenciales.';
  if (['ENOTFOUND','EAI_AGAIN'].includes(error?.code)) return 'No se pudo resolver el servidor de correo. Revise DNS y el host configurado.';
  if (['ETLS','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error?.code)) return 'No se pudo establecer una conexión TLS válida. Revise certificados; no desactive su verificación.';
  if (error?.code === 'ECONNREFUSED') return 'El servidor de correo rechazó la conexión. Revise host, puerto y restricciones de red.';
  if (error?.responseCode === 400) return 'El proveedor rechazó la solicitud. Revise remitente y destinatario.';
  if (error?.code === 'ETIMEDOUT' && error?.command === 'CONN') return 'La conexión con el proveedor agotó el tiempo. Revise puerto y conectividad.';
  return uncertainMailFailure(error) ? 'No se confirmó el resultado del envío. Puede haber sido aceptado; no se reintentará automáticamente.' : 'El proveedor rechazó el envío. Revise el historial antes de autorizar otro intento.';
}
