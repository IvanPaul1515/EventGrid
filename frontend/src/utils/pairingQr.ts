export function pairingCredential(value: string, eventId: string) {
  const match=value.trim().match(/^eventgrid-pair:v1:([a-f0-9-]{36}):([a-f0-9]{64})$/i);
  if(!match)throw new Error('Este QR no es una invitación de vinculación de EventGrid.');
  if(match[1]!==eventId)throw new Error('La invitación pertenece a otra edición.');
  return value.trim();
}

export function scannerDeviceLabel() {
  const agent=navigator.userAgent;
  return /Android/i.test(agent)?'Teléfono Android':/iPhone|iPad/i.test(agent)?'Dispositivo iOS':'Escáner web';
}
