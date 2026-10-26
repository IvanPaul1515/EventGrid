import { PrismaClient } from '@prisma/client';

// Only the initial creation contains the tariff. Existing editions and administrator edits are never updated by startup.
export async function seedBarcamp2026(prisma: PrismaClient) {
  return prisma.event.upsert({
    where: { slug: 'barcamp-rd-2026' },
    update: {},
    create: {
      slug: 'barcamp-rd-2026',
      name: 'BarCamp RD 2026',
      year: 2026,
      startDate: new Date('2026-11-07T08:00:00.000Z'),
      endDate: new Date('2026-11-07T18:00:00.000Z'),
      venue: 'PUCMM — Campus Santiago de los Caballeros, República Dominicana',
      description: 'El mayor evento de tecnología, emprendimiento e innovación abierta en el Cibao y el Caribe.',
      status: 'ACTIVE' as any,
      isDefault: true,
      ticketTypes: { create: { name: 'Entrada General', price: 1750, isActive: true } },
    },
  });
}
