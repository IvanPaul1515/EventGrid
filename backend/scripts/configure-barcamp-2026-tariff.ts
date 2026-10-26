// Explicit one-time configuration for an existing local database; never called by server startup.
import { prisma } from '../src/config/db.js';
import { officialTicket } from '../src/modules/participants/registrationPolicy.js';

async function main() {
  const result = await prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { slug: 'barcamp-rd-2026' }, include: { ticketTypes: true } });
    if (!event) throw new Error('No se encontró la edición barcamp-rd-2026. No se modificó ninguna edición.');
    const before = await tx.registration.findMany({ where: { eventId: event.id }, select: { id: true, ticketPrice: true, amountPaid: true, totalAmount: true, balanceDue: true } });
    const current = officialTicket(event.ticketTypes,event.defaultTicketTypeId);
    if (current && Number(current.price) !== 1750) throw new Error('Existe una tarifa configurada manualmente. Se conserva sin cambios.');
    if (!current && event.ticketTypes.length) throw new Error('Existe una tarifa o ambigüedad sin predeterminada explícita. Se conserva sin cambios; seleccione la oficial desde Configuración.');
    const tariff = current
      ? current
      : await tx.ticketType.create({ data: { eventId: event.id, name: 'Entrada General', price: 1750, isActive: true } });
    if (!event.defaultTicketTypeId) await tx.event.update({where:{id:event.id},data:{defaultTicketTypeId:tariff.id}});
    const after = await tx.registration.findMany({ where: { eventId: event.id }, select: { id: true, ticketPrice: true, amountPaid: true, totalAmount: true, balanceDue: true } });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Los importes históricos cambiaron; se cancela la transacción.');
    return { edition: event.name, price: Number(tariff.price), historicalRegistrationsPreserved: before.length };
  });
  console.log(JSON.stringify(result));
}
main().catch((error) => { console.error(error instanceof Error && error.message.startsWith('Existe una tarifa') ? error.message : 'No se pudo configurar la tarifa local; revise la edición y la conexión.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
