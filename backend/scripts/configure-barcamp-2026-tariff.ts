// Explicit one-time configuration for an existing local database; never called by server startup.
import { prisma } from '../src/config/db.js';
import { officialTicket } from '../src/modules/participants/registrationPolicy.js';

async function main() {
  const result = await prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { slug: 'barcamp-rd-2026' }, include: { ticketTypes: true } });
    if (!event) throw new Error('No se encontró la edición barcamp-rd-2026. No se modificó ninguna edición.');
    const before = await tx.registration.findMany({ where: { eventId: event.id }, select: { id: true, ticketPrice: true, amountPaid: true, totalAmount: true, balanceDue: true } });
    const current = officialTicket(event.ticketTypes);
    const tariff = current
      ? await tx.ticketType.update({ where: { id: current.id }, data: { price: 1750 } })
      : await tx.ticketType.create({ data: { eventId: event.id, name: 'Entrada General', price: 1750, isActive: true } });
    const after = await tx.registration.findMany({ where: { eventId: event.id }, select: { id: true, ticketPrice: true, amountPaid: true, totalAmount: true, balanceDue: true } });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Los importes históricos cambiaron; se cancela la transacción.');
    return { edition: event.name, price: Number(tariff.price), historicalRegistrationsPreserved: before.length };
  });
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error('No se pudo configurar la tarifa local; revise la edición y la conexión.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
