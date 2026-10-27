import { BadRequestError } from '../../utils/errors.js';

export async function queueTshirts(db: any, eventId: string, registration: any) {
  const settings = await db.eventSettings.findUnique({ where: { eventId } });
  const enabled = Boolean(settings?.tshirtSizesEnabled && registration.ticketType?.includesTshirt !== false);
  const inventory = enabled ? await db.tshirtInventory.findMany({ where: { eventId, isActive: true }, orderBy: { size: 'asc' } }) : [];
  return {
    enabled, delivered: registration.tshirtDelivered,
    sizes: inventory.map((item: any) => ({ size: item.size, available: Math.max(0, item.initialQuantity - item.deliveredQuantity - item.staffReservedQuantity) })),
  };
}

export function validateQueueSize(shirts: Awaited<ReturnType<typeof queueTshirts>>, size?: string | null) {
  if (size && (!shirts.enabled || !shirts.sizes.some((item: { size: string }) => item.size === size))) {
    throw new BadRequestError('La talla seleccionada no está configurada para esta entrada.');
  }
  if (shirts.enabled && !shirts.delivered && !size) throw new BadRequestError('Selecciona una talla antes de enviar a recepción.');
}

export function queueBlockReason(registration: any, pendingCourtesy: boolean,requirePayment=true) {
  if (registration.status === 'CANCELLED') return 'Entrada cancelada.';
  if (registration.attended) return 'La asistencia ya fue confirmada.';
  if (pendingCourtesy) return 'Cortesía pendiente de autorización.';
  if (registration.source === 'EXCEL_IMPORT' && !registration.isCourtesy && Number(registration.ticketPrice) <= 0) return 'Tarifa externa pendiente de conciliación.';
  if (requirePayment&&!registration.isCourtesy && Number(registration.balanceDue) > 0) return 'Pago pendiente. Revisa la ficha completa antes de confirmar.';
  return null;
}
