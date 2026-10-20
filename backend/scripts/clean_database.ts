import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESERVED_EVENT_SLUGS = [
  'barcamp-rd-2026',
  'barcamp-rd-2025',
  'barcamp-rd-2024',
];

async function cleanData() {
  console.log('🧹 Limpiando datos operativos y de prueba en EventGrid...');

  // 1. Eliminar pagos
  const deletedPayments = await prisma.payment.deleteMany({});
  console.log(`- Pagos eliminados: ${deletedPayments.count}`);

  // 2. Eliminar logs de asistencia
  const deletedAttendanceLogs = await prisma.attendanceLog.deleteMany({});
  console.log(`- Registros de asistencia eliminados: ${deletedAttendanceLogs.count}`);

  // 3. Eliminar logs de correo
  const deletedEmailLogs = await prisma.emailLog.deleteMany({});
  console.log(`- Historial de correos eliminado: ${deletedEmailLogs.count}`);

  // 4. Eliminar inscripciones
  const deletedRegistrations = await prisma.registration.deleteMany({});
  console.log(`- Inscripciones eliminadas: ${deletedRegistrations.count}`);

  // 5. Eliminar participantes
  const deletedParticipants = await prisma.participant.deleteMany({});
  console.log(`- Participantes eliminados: ${deletedParticipants.count}`);

  // 6. Eliminar lotes de importación
  const deletedBatches = await prisma.importBatch.deleteMany({});
  console.log(`- Lotes de importación eliminados: ${deletedBatches.count}`);

  // 7. Eliminar ediciones de prueba creadas durante tests
  const testEvents = await prisma.event.findMany({
    where: {
      slug: {
        notIn: PRESERVED_EVENT_SLUGS,
      },
    },
  });

  for (const ev of testEvents) {
    await prisma.ticketType.deleteMany({ where: { eventId: ev.id } });
    await prisma.paymentMethod.deleteMany({ where: { eventId: ev.id } });
    await prisma.salesResponsible.deleteMany({ where: { eventId: ev.id } });
    await prisma.emailTemplate.deleteMany({ where: { eventId: ev.id } });
    await prisma.emailConfig.deleteMany({ where: { eventId: ev.id } });
    await prisma.eventSettings.deleteMany({ where: { eventId: ev.id } });
    await prisma.event.delete({ where: { id: ev.id } });
  }
  console.log(`- Ediciones de prueba eliminadas: ${testEvents.length}`);

  // 8. Asegurar que el modo demo esté DESACTIVADO en todas las ediciones
  const updatedSettings = await prisma.eventSettings.updateMany({
    data: { demoModeEnabled: false },
  });
  console.log(`- Modo demo desactivado en configuraciones de eventos: ${updatedSettings.count}`);

  // 9. Verificar estado final
  const [totalRegs, totalParts, totalEvents, totalUsers] = await Promise.all([
    prisma.registration.count(),
    prisma.participant.count(),
    prisma.event.count(),
    prisma.user.count(),
  ]);

  console.log('✅ Base de datos limpia y lista:');
  console.log(`   - Inscripciones: ${totalRegs}`);
  console.log(`   - Participantes: ${totalParts}`);
  console.log(`   - Ediciones preservadas: ${totalEvents}`);
  console.log(`   - Usuarios del sistema: ${totalUsers}`);
}

cleanData()
  .catch((e) => {
    console.error('Error al limpiar base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
