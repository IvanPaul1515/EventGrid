import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Iniciando migración de datos para Alpha 1.1...');

  // 1. Migrar status = 'ATTENDED' a 'CONFIRMED'
  const attendedUpdated = await prisma.$executeRawUnsafe(`
    UPDATE registrations 
    SET status = 'CONFIRMED', attended = 1 
    WHERE status = 'ATTENDED'
  `);
  console.log(`✅ Registros con status 'ATTENDED' migrados a 'CONFIRMED': ${attendedUpdated}`);

  // 2. Establecer default paymentStatus si la columna ya existe o actualizar valores
  try {
    const courtesyUpdated = await prisma.$executeRawUnsafe(`
      UPDATE registrations 
      SET paymentStatus = 'COURTESY' 
      WHERE isCourtesy = 1
    `);
    console.log(`✅ Registros de cortesía actualizados a paymentStatus 'COURTESY': ${courtesyUpdated}`);

    const paidUpdated = await prisma.$executeRawUnsafe(`
      UPDATE registrations 
      SET paymentStatus = 'PAID' 
      WHERE isCourtesy = 0 AND balanceDue <= 0 AND amountPaid > 0
    `);
    console.log(`✅ Registros pagados actualizados a paymentStatus 'PAID': ${paidUpdated}`);

    const partialUpdated = await prisma.$executeRawUnsafe(`
      UPDATE registrations 
      SET paymentStatus = 'PARTIAL' 
      WHERE isCourtesy = 0 AND balanceDue > 0 AND amountPaid > 0
    `);
    console.log(`✅ Registros parciales actualizados a paymentStatus 'PARTIAL': ${partialUpdated}`);

    const pendingUpdated = await prisma.$executeRawUnsafe(`
      UPDATE registrations 
      SET paymentStatus = 'PENDING' 
      WHERE isCourtesy = 0 AND amountPaid = 0
    `);
    console.log(`✅ Registros pendientes actualizados a paymentStatus 'PENDING': ${pendingUpdated}`);
  } catch (err) {
    console.log('ℹ️ paymentStatus columna aún no migrada por schema push, se actualizará tras db push');
  }

  console.log('🎉 Migración previa completada.');
}

main()
  .catch((e) => {
    console.error('❌ Error en migración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
