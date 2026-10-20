import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedParticipants() {
  console.log('🌱 Sembrando participantes iniciales para BarCamp RD 2026, 2025 y 2024...');

  const e2026 = await prisma.event.findUnique({ where: { slug: 'barcamp-rd-2026' }, include: { paymentMethods: true, salesResponsibles: true } });
  const e2025 = await prisma.event.findUnique({ where: { slug: 'barcamp-rd-2025' }, include: { paymentMethods: true, salesResponsibles: true } });
  const e2024 = await prisma.event.findUnique({ where: { slug: 'barcamp-rd-2024' }, include: { paymentMethods: true, salesResponsibles: true } });

  if (!e2026 || !e2025 || !e2024) {
    console.error('Ediciones no encontradas. Ejecute primero el seed principal.');
    return;
  }

  const cash26 = e2026.paymentMethods.find(m => m.name.includes('Efectivo'))?.id;
  const pop26 = e2026.paymentMethods.find(m => m.name.includes('Popular'))?.id;
  const bhd26 = e2026.paymentMethods.find(m => m.name.includes('BHD'))?.id;
  const card26 = e2026.paymentMethods.find(m => m.name.includes('Tarjeta'))?.id;
  const court26 = e2026.paymentMethods.find(m => m.name.includes('Cortesía'))?.id;
  const resp26 = e2026.salesResponsibles[0]?.id;

  const demoPeople = [
    {
      firstName: 'Marcos',
      lastName: 'Taveras Gómez',
      documentId: '031-0198274-1',
      email: 'm.taveras@pucmm.edu.do',
      phone: '809-580-1962',
      alternatePhone: '829-445-1029',
      amount: 500.0,
      pm: pop26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Estudiante Telemática PUCMM. Taller de Ciberseguridad.',
      also2025: true,
      also2024: true,
    },
    {
      firstName: 'Laura',
      lastName: 'Batista Fernández',
      documentId: '402-2891047-3',
      email: 'laura.batista@techcibao.org',
      phone: '809-724-5511',
      alternatePhone: null,
      amount: 500.0,
      pm: card26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Líder de comunidad Women In Tech Santiago.',
      also2025: true,
      also2024: false,
    },
    {
      firstName: 'Carlos',
      lastName: 'Espinal Rodríguez',
      documentId: '031-1827364-5',
      email: 'cespinal@solucionesrd.com',
      phone: '849-200-4820',
      alternatePhone: '809-582-9011',
      amount: 500.0,
      pm: bhd26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Desarrollador backend. Charla propuesta sobre microservicios.',
      also2025: false,
      also2024: true,
    },
    {
      firstName: 'Yomaira',
      lastName: 'Cruz Almonte',
      documentId: '037-0091823-9',
      email: 'yomaira.cruz@gmail.com',
      phone: '809-241-0099',
      alternatePhone: null,
      amount: 0.0,
      pm: court26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Beca de excelencia académica PUCMM.',
      also2025: false,
      also2024: false,
    },
    {
      firstName: 'Jean',
      lastName: 'Delance Morán',
      documentId: '031-2983741-2',
      email: 'jean.delance@codecamp.do',
      phone: '829-887-3211',
      alternatePhone: null,
      amount: 500.0,
      pm: cash26,
      status: 'PENDING_VERIFICATION',
      isVerified: false,
      notes: 'Pendiente entrega de recibo físico en mesa PUCMM.',
      also2025: true,
      also2024: false,
    },
    {
      firstName: 'Ingrid',
      lastName: 'Santos Minaya',
      documentId: '031-0982341-8',
      email: 'isantos@innovacioncibao.com',
      phone: '809-583-4412',
      alternatePhone: null,
      amount: 500.0,
      pm: pop26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Mentora de startups PUCMM Emprende.',
      also2025: true,
      also2024: true,
    },
    {
      firstName: 'Rafael',
      lastName: 'Mercado Guzmán',
      documentId: '402-1928374-6',
      email: 'rafael.mercado@devsantiago.do',
      phone: '849-332-1982',
      alternatePhone: '809-581-2200',
      amount: 500.0,
      pm: card26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Co-organizador meetup local Node.js.',
      also2025: false,
      also2024: true,
    },
    {
      firstName: 'Gabriela',
      lastName: 'Peña Salcedo',
      documentId: '031-3829102-4',
      email: 'gaby.pena@disenord.com',
      phone: '829-912-8876',
      alternatePhone: null,
      amount: 500.0,
      pm: bhd26,
      status: 'CONFIRMED',
      isVerified: true,
      notes: 'Diseñadora UI/UX y ponente invitada.',
      also2025: true,
      also2024: false,
    },
  ];

  async function registerSafe(eventId: string, participantId: string, prefix: string, num: number, data: any) {
    const existing = await prisma.registration.findUnique({
      where: {
        eventId_participantId: {
          eventId,
          participantId,
        },
      },
    });

    if (existing) return;

    let candidateNum = num;
    let regNumber = `${prefix}${String(candidateNum).padStart(4, '0')}`;
    while (await prisma.registration.findUnique({ where: { eventId_registrationNumber: { eventId, registrationNumber: regNumber } } })) {
      candidateNum++;
      regNumber = `${prefix}${String(candidateNum).padStart(4, '0')}`;
    }

    await prisma.registration.create({
      data: {
        eventId,
        participantId,
        registrationNumber: regNumber,
        source: 'MANUAL',
        totalAmount: data.amount,
        isVerified: data.isVerified,
        paymentMethodId: data.pm || null,
        salesResponsibleId: data.resp || null,
        status: data.status,
        notes: data.notes,
        saleTimestamp: data.date || new Date(),
      },
    });
  }

  let index = 1;
  for (const item of demoPeople) {
    const fullName = `${item.firstName} ${item.lastName}`;

    let participant = await prisma.participant.findFirst({
      where: { email: item.email },
    });

    if (!participant) {
      participant = await prisma.participant.create({
        data: {
          firstName: item.firstName,
          lastName: item.lastName,
          fullName,
          documentId: item.documentId,
          email: item.email,
          phone: item.phone,
          alternatePhone: item.alternatePhone,
        },
      });
    }

    // Registrar en 2026
    await registerSafe(e2026.id, participant.id, 'BC26-', index, {
      amount: item.amount,
      isVerified: item.isVerified,
      pm: item.pm,
      resp: resp26,
      status: item.status,
      notes: item.notes,
    });

    // Registrar en 2025 si aplica
    if (item.also2025) {
      await registerSafe(e2025.id, participant.id, 'BC25-', index, {
        amount: 400.0,
        isVerified: true,
        pm: null,
        resp: null,
        status: 'ATTENDED',
        notes: 'Participó en BarCamp RD 2025 PUCMM',
        date: new Date('2025-11-08T09:30:00.000Z'),
      });
    }

    // Registrar en 2024 si aplica
    if (item.also2024) {
      await registerSafe(e2024.id, participant.id, 'BC24-', index, {
        amount: 350.0,
        isVerified: true,
        pm: null,
        resp: null,
        status: 'ATTENDED',
        notes: 'Participó en BarCamp RD 2024 PUCMM',
        date: new Date('2024-11-09T10:00:00.000Z'),
      });
    }

    index++;
  }

  console.log('✅ 8 Participantes iniciales y su historial multiedición sembrados con éxito.');
}

seedParticipants()
  .catch((e) => {
    console.error('Error al sembrar participantes:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
