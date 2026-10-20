import { prisma } from '../src/config/db.js';

async function main() {
  console.log('🌱 Inicializando Tipos de Entrada y sincronización financiera...');

  const events = await prisma.event.findMany();

  for (const event of events) {
    console.log(`Configurando tipos de entrada para: ${event.name} (${event.year})`);

    // 1. Preventa
    const preventa = await prisma.ticketType.upsert({
      where: {
        eventId_name: {
          eventId: event.id,
          name: 'Preventa',
        },
      },
      update: {
        price: 1750,
      },
      create: {
        eventId: event.id,
        name: 'Preventa',
        price: 1750,
        description: 'Entrada con tarifa reducida por compra anticipada.',
      },
    });

    // 2. Entrada General
    const general = await prisma.ticketType.upsert({
      where: {
        eventId_name: {
          eventId: event.id,
          name: 'Entrada General',
        },
      },
      update: {
        price: 2000,
      },
      create: {
        eventId: event.id,
        name: 'Entrada General',
        price: 2000,
        description: 'Acceso completo al evento, talleres y kit de bienvenida.',
      },
    });

    // 3. Cortesía
    const cortesia = await prisma.ticketType.upsert({
      where: {
        eventId_name: {
          eventId: event.id,
          name: 'Cortesía',
        },
      },
      update: {
        price: 0,
      },
      create: {
        eventId: event.id,
        name: 'Cortesía',
        price: 0,
        description: 'Entrada oficial de cortesía para invitados de honor, ponentes y prensa.',
      },
    });

    // Actualizar registros existentes que no tengan tipo de entrada
    const registrations = await prisma.registration.findMany({
      where: { eventId: event.id },
      include: { participant: true },
    });

    for (const reg of registrations) {
      const isCourtesy = reg.isCourtesy || Number(reg.totalAmount) === 0;
      const targetTicketType = isCourtesy ? cortesia : general;
      const paid = Number(reg.totalAmount) || 0;
      const price = isCourtesy ? 0 : paid > 0 ? paid : 2000;
      const balance = Math.max(0, price - paid);

      await prisma.registration.update({
        where: { id: reg.id },
        data: {
          ticketTypeId: reg.ticketTypeId || targetTicketType.id,
          ticketPrice: reg.ticketPrice && Number(reg.ticketPrice) > 0 ? reg.ticketPrice : price,
          amountPaid: paid,
          balanceDue: balance,
          isCourtesy,
        },
      });
    }
  }

  // Asignar instituciones a algunos participantes existentes para pruebas ricas
  const institutions = [
    'PUCMM Campus Santiago',
    'Instituto Tecnológico de Santo Domingo (INTEC)',
    'Instituto Tecnológico de Las Américas (ITLA)',
    'Banco BHD',
    'Claro Dominicana',
    'Universidad ISA',
    'Kite Consulting Group',
  ];

  const participants = await prisma.participant.findMany({ where: { institution: null } });
  for (let i = 0; i < participants.length; i++) {
    const inst = institutions[i % institutions.length];
    await prisma.participant.update({
      where: { id: participants[i].id },
      data: { institution: inst },
    });
  }

  console.log(`✅ Tipos de entrada y participantes actualizados con éxito.`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
