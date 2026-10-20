import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando inicialización de datos para BarCamp RD...');

  // 1. Crear usuarios iniciales con contraseñas seguras hasheadas
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'BarCamp2026!Admin';
  const operatorPassword = process.env.OPERATOR_INITIAL_PASSWORD || 'BarCamp2026!Op';
  const viewerPassword = process.env.VIEWER_INITIAL_PASSWORD || 'BarCamp2026!View';

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const operatorHash = await bcrypt.hash(operatorPassword, 10);
  const viewerHash = await bcrypt.hash(viewerPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@barcamp.org.do' },
    update: {},
    create: {
      email: 'admin@barcamp.org.do',
      passwordHash: adminHash,
      fullName: 'Administrador BarCamp RD',
      role: 'ADMIN' as any,
      isActive: true,
    },
  });

  const operatorUser = await prisma.user.upsert({
    where: { email: 'operador@barcamp.org.do' },
    update: {},
    create: {
      email: 'operador@barcamp.org.do',
      passwordHash: operatorHash,
      fullName: 'Operador de Registro BarCamp',
      role: 'OPERATOR' as any,
      isActive: true,
    },
  });

  const viewerUser = await prisma.user.upsert({
    where: { email: 'consulta@barcamp.org.do' },
    update: {},
    create: {
      email: 'consulta@barcamp.org.do',
      passwordHash: viewerHash,
      fullName: 'Auditor de Consulta BarCamp',
      role: 'VIEWER' as any,
      isActive: true,
    },
  });

  console.log('✅ Usuarios del sistema verificados:');
  console.log(`   - Administrador: ${adminUser.email}`);
  console.log(`   - Operador:      ${operatorUser.email}`);
  console.log(`   - Consulta:      ${viewerUser.email}`);

  // 2. Edición BarCamp RD 2026 (Activa)
  const event2026 = await prisma.event.upsert({
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
    },
  });

  // Configuración visual BarCamp 2026
  await prisma.eventSettings.upsert({
    where: { eventId: event2026.id },
    update: {},
    create: {
      eventId: event2026.id,
      primaryColor: '#e11d48',
      secondaryColor: '#881337',
      backgroundColor: '#09090b',
      themeMode: 'dark',
      currencyCode: 'DOP',
      currencySymbol: 'RD$',
      subtitle: 'PUCMM — Santiago de los Caballeros, República Dominicana',
      registrationPrefix: 'BC26-',
    },
  });

  // Métodos de pago oficiales para 2026
  const paymentMethods2026 = [
    { name: 'Efectivo', code: 'CASH' },
    { name: 'Transferencia Banco Popular', code: 'POPULAR' },
    { name: 'Transferencia Banco BHD', code: 'BHD' },
    { name: 'Tarjeta de Crédito / Débito', code: 'CARD' },
    { name: 'Cortesía / Beca Estudiantil', code: 'COURTESY' },
    { name: 'Patrocinio Organizacional', code: 'SPONSOR' },
  ];

  for (const pm of paymentMethods2026) {
    await prisma.paymentMethod.upsert({
      where: {
        eventId_name: {
          eventId: event2026.id,
          name: pm.name,
        },
      },
      update: {},
      create: {
        eventId: event2026.id,
        name: pm.name,
        code: pm.code,
      },
    });
  }

  // Responsables de venta iniciales para 2026
  const responsibles2026 = [
    { name: 'Comité Organizador BarCamp', role: 'Coordinación General' },
    { name: 'Mesa de Registro PUCMM', role: 'Mesa Presencial' },
    { name: 'Comisión Estudiantil IEEE/ACM', role: 'Facultad de Ingeniería' },
  ];

  for (const resp of responsibles2026) {
    await prisma.salesResponsible.upsert({
      where: {
        eventId_name: {
          eventId: event2026.id,
          name: resp.name,
        },
      },
      update: {},
      create: {
        eventId: event2026.id,
        name: resp.name,
        role: resp.role,
      },
    });
  }

  // 3. Edición BarCamp RD 2025 (Finalizada)
  const event2025 = await prisma.event.upsert({
    where: { slug: 'barcamp-rd-2025' },
    update: {},
    create: {
      slug: 'barcamp-rd-2025',
      name: 'BarCamp RD 2025',
      year: 2025,
      startDate: new Date('2025-11-08T08:00:00.000Z'),
      endDate: new Date('2025-11-08T18:00:00.000Z'),
      venue: 'PUCMM — Campus Santiago de los Caballeros, RD',
      description: 'Edición conmemorativa de los 10 años de conferencias comunitarias BarCamp en República Dominicana.',
      status: 'COMPLETED' as any,
      isDefault: false,
    },
  });

  await prisma.eventSettings.upsert({
    where: { eventId: event2025.id },
    update: {},
    create: {
      eventId: event2025.id,
      primaryColor: '#c2410c', // Naranja/Óxido tech de 2025
      secondaryColor: '#7c2d12',
      backgroundColor: '#0c0a09',
      themeMode: 'dark',
      currencyCode: 'DOP',
      currencySymbol: 'RD$',
      subtitle: 'PUCMM — Santiago de los Caballeros',
      registrationPrefix: 'BC25-',
    },
  });

  // 4. Edición BarCamp RD 2024 (Archivada)
  const event2024 = await prisma.event.upsert({
    where: { slug: 'barcamp-rd-2024' },
    update: {},
    create: {
      slug: 'barcamp-rd-2024',
      name: 'BarCamp RD 2024',
      year: 2024,
      startDate: new Date('2024-11-09T08:00:00.000Z'),
      endDate: new Date('2024-11-09T18:00:00.000Z'),
      venue: 'PUCMM — Campus Santiago de los Caballeros, RD',
      description: 'Edición histórica de retorno a las aulas presenciales en PUCMM Santiago.',
      status: 'ARCHIVED' as any,
      isDefault: false,
    },
  });

  await prisma.eventSettings.upsert({
    where: { eventId: event2024.id },
    update: {},
    create: {
      eventId: event2024.id,
      primaryColor: '#b91c1c',
      secondaryColor: '#450a0a',
      backgroundColor: '#0a0a0a',
      themeMode: 'dark',
      currencyCode: 'DOP',
      currencySymbol: 'RD$',
      subtitle: 'PUCMM Santiago',
      registrationPrefix: 'BC24-',
    },
  });

  console.log('✅ Ediciones iniciales configuradas:');
  console.log(`   - ${event2026.name} [ACTIVO] (Predeterminada)`);
  console.log(`   - ${event2025.name} [FINALIZADO]`);
  console.log(`   - ${event2024.name} [ARCHIVADO]`);
  console.log('🏁 Inicialización completada con éxito.');
}

main()
  .catch((e) => {
    console.error('❌ Error durante seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
