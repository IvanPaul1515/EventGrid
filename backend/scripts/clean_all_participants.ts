import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanAll() {
  console.log('🧹 Iniciando vaciado total de participantes y datos de prueba...');

  // 1. Eliminar pagos
  const deletedPayments = await prisma.payment.deleteMany({});
  console.log(`- Pagos eliminados: ${deletedPayments.count}`);

  // 2. Eliminar bitácoras de asistencia
  const deletedAttendance = await prisma.attendanceLog.deleteMany({});
  console.log(`- Registros de asistencia eliminados: ${deletedAttendance.count}`);

  // 3. Eliminar inscripciones
  const deletedRegistrations = await prisma.registration.deleteMany({});
  console.log(`- Inscripciones eliminadas: ${deletedRegistrations.count}`);

  // 4. Eliminar errores de importación y lotes de importación
  const deletedErrors = await prisma.importError.deleteMany({});
  const deletedBatches = await prisma.importBatch.deleteMany({});
  console.log(`- Lotes de Excel eliminados: ${deletedBatches.count} (Errores: ${deletedErrors.count})`);

  // 5. Eliminar participantes
  const deletedParticipants = await prisma.participant.deleteMany({});
  console.log(`- Participantes eliminados: ${deletedParticipants.count}`);

  // 6. Eliminar logs de correo de prueba
  const deletedEmails = await prisma.emailLog.deleteMany({});
  console.log(`- Logs de correos eliminados: ${deletedEmails.count}`);

  // 7. Asegurar que el modo demo esté completamente apagado en todas las ediciones
  const updatedSettings = await prisma.eventSettings.updateMany({
    data: {
      demoModeEnabled: false,
    },
  });
  console.log(`- Modo demo desactivado en ediciones: ${updatedSettings.count}`);

  // 8. Verificación de integridad: usuarios y ediciones deben permanecer
  const usersCount = await prisma.user.count();
  const eventsCount = await prisma.event.count();
  const remainingParticipants = await prisma.participant.count();
  const remainingRegistrations = await prisma.registration.count();
  const remainingPayments = await prisma.payment.count();

  console.log('\n📊 Estado final de la base de datos:');
  console.log(`- Usuarios del sistema (intactos): ${usersCount}`);
  console.log(`- Ediciones de eventos (intactas): ${eventsCount}`);
  console.log(`- Participantes: ${remainingParticipants}`);
  console.log(`- Inscripciones: ${remainingRegistrations}`);
  console.log(`- Pagos: ${remainingPayments}`);

  if (remainingParticipants === 0 && remainingRegistrations === 0 && remainingPayments === 0) {
    console.log('\n✅ Base de datos completamente limpia y lista para archivos reales.');
  } else {
    console.warn('\n⚠️ Advertencia: Aún quedan registros pendientes.');
  }
}

cleanAll()
  .catch((err) => {
    console.error('Error al vaciar los datos:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
