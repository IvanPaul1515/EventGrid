import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });
process.env.DATABASE_URL = 'file:./dev.db';

import { prisma } from '../src/config/db.js';
import { ImportService } from '../src/modules/import/import.service.js';
import { QrService } from '../src/modules/qr/qr.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import * as XLSX from 'xlsx';

async function runE2eFlow() {
  console.log('🚀 Iniciando Prueba de Integración End-to-End para EventGrid Alpha 1.2...\n');

  // 1. Obtener evento activo y usuario administrador
  const event = await prisma.event.findFirst({
    where: { isDefault: true },
    include: { settings: true, ticketTypes: true },
  });
  if (!event) throw new Error('No se encontró ningún evento predeterminado en la base de datos');

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });
  if (!admin) throw new Error('No se encontró ningún usuario administrador en la base de datos');

  console.log(`✓ Contexto verificado: Evento "${event.name}" (${event.year}), Administrador: ${admin.fullName}`);

  // Limpieza inicial previa para asegurar idempotencia en pruebas sintéticas
  await prisma.registration.deleteMany({
    where: {
      eventId: event.id,
      participant: { email: { in: ['alejandro.gomez.test@example.com', 'maria.rodriguez.test@example.com'] } },
    },
  });
  await prisma.participant.deleteMany({
    where: {
      email: { in: ['alejandro.gomez.test@example.com', 'maria.rodriguez.test@example.com'] },
    },
  });

  // 2. Generar archivo Excel sintético multih-oja en memoria con casos borde
  const wb = XLSX.utils.book_new();

  // Hoja 1: Participantes
  const participantData = [
    {
      'Nombre Completo': 'Dr. Alejandro Gómez Sánchez',
      'Cédula': '001-1234567-8',
      'Correo Electrónico': 'alejandro.gomez.test@example.com',
      'Teléfono': '809-555-1234',
      'Institución': 'Universidad Autónoma',
      'Tipo de Entrada': 'General',
      'Forma de Pago': 'Transferencia Bancaria',
      'Monto': 'RD$ 1,500.00',
      'Asistió': 'NO',
    },
    {
      'Nombre Completo': 'Ing. María Elena Rodríguez',
      'Cédula': '40209876543', // sin guiones
      'Correo Electrónico': 'maria.rodriguez.test@example.com',
      'Teléfono': '8295559876', // sin guiones
      'Institución': 'Tech Solutions RD',
      'Tipo de Entrada': 'Cortesía',
      'Forma de Pago': 'Cortesía Organizador',
      'Monto': 'RD$ 0.00',
      'Asistió': 'NO',
    },
  ];

  const wsParticipants = XLSX.utils.json_to_sheet(participantData);
  XLSX.utils.book_append_sheet(wb, wsParticipants, 'Participantes');

  // Hoja 2: Metadatos o información adicional (para verificar detección de hojas)
  const wsInfo = XLSX.utils.json_to_sheet([
    { 'Propiedad': 'Versión', 'Valor': 'Alpha 1.2' },
    { 'Propiedad': 'GeneradoPor', 'Valor': 'Synthetic E2E Test' },
  ]);
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Información General');

  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const base64Data = excelBuffer.toString('base64');
  console.log(`✓ Archivo Excel sintético generado en memoria (${excelBuffer.length} bytes, 2 hojas)`);

  // 3. Paso 1 y 2: Analizar archivo
  const analyzeResult = ImportService.analyzeFile(base64Data, 'test_synthetic.xlsx', 'Participantes');
  console.log(`✓ Análisis de archivo exitoso:`);
  console.log(`   - Hojas detectadas: ${analyzeResult.sheets.join(', ')}`);
  console.log(`   - Columnas detectadas: ${analyzeResult.columns.join(', ')}`);
  console.log(`   - Mapeo automático de columnas:`, analyzeResult.autoMapping);

  if (!analyzeResult.autoMapping['Nombre Completo']) {
    throw new Error('Fallo: "Nombre Completo" no fue reconocido automáticamente');
  }
  if (!analyzeResult.autoMapping['Cédula']) {
    throw new Error('Fallo: "Cédula" no fue reconocido automáticamente');
  }

  // 4. Paso 4: Validar filas
  const validation = await ImportService.validateRows(event.id, analyzeResult.rows, analyzeResult.autoMapping);
  console.log(`✓ Validación de filas: ${validation.validRows} válidas, ${validation.errorRows} errores, ${validation.duplicateRows} duplicados`);
  if (validation.validRows !== 2 || validation.errorRows > 0) {
    throw new Error(`Fallo en validación: ${JSON.stringify(validation.rowsSummary)}`);
  }

  // Verificar normalización de cédula con ceros iniciales
  const row1 = validation.rowsSummary[0].normalized;
  console.log(`   - Fila 1 normalizada: ${row1.firstName} ${row1.lastName}, Doc: ${row1.documentId}, Tel: ${row1.phone}, Monto: ${row1.totalAmount}`);
  if (row1.documentId !== '001-1234567-8') {
    throw new Error(`Fallo: La cédula perdió ceros o formato: ${row1.documentId}`);
  }
  if (row1.phone !== '809-555-1234') {
    throw new Error(`Fallo: El teléfono no fue formateado correctamente: ${row1.phone}`);
  }

  const row2 = validation.rowsSummary[1].normalized;
  console.log(`   - Fila 2 normalizada: ${row2.firstName} ${row2.lastName}, Doc: ${row2.documentId}, Tel: ${row2.phone}, Cortesía: ${row2.isCourtesy}`);
  if (row2.documentId !== '402-0987654-3') {
    throw new Error(`Fallo: Cédula sin guiones no fue formateada: ${row2.documentId}`);
  }
  if (row2.phone !== '829-555-9876') {
    throw new Error(`Fallo: Teléfono sin guiones no fue formateado: ${row2.phone}`);
  }
  if (!row2.isCourtesy) {
    throw new Error(`Fallo: Cortesía no fue detectada en fila 2`);
  }

  // 5. Paso 6: Ejecutar importación en base de datos
  const execution = await ImportService.executeImport(
    event.id,
    admin.id,
    'test_synthetic.xlsx',
    excelBuffer.length,
    analyzeResult.rows,
    analyzeResult.autoMapping,
    'SKIP'
  );
  console.log(`✓ Importación ejecutada con éxito: ${execution.importedRows} importados, ${execution.errorRows} errores`);

  // 6. Verificar que se crearon los registros en Prisma con códigos QR únicos
  const reg1 = await prisma.registration.findFirst({
    where: { eventId: event.id, participant: { email: 'alejandro.gomez.test@example.com' } },
    include: { participant: true, ticketType: true, event: { include: { settings: true } } },
  });
  if (!reg1) throw new Error('No se encontró la inscripción de Alejandro en la base de datos');
  console.log(`✓ Inscripción 1 creada: Ticket ${reg1.registrationNumber}, QR Token: ${reg1.qrCode}`);

  if (!reg1.qrCode || !reg1.qrCode.startsWith('eg_qr_')) {
    throw new Error(`Fallo: La inscripción importada NO recibió un token QR seguro (qrCode: ${reg1.qrCode})`);
  }
  if (!reg1.qrGeneratedAt) {
    throw new Error('Fallo: qrGeneratedAt no fue registrado');
  }

  const reg2 = await prisma.registration.findFirst({
    where: { eventId: event.id, participant: { email: 'maria.rodriguez.test@example.com' } },
    include: { participant: true, ticketType: true },
  });
  if (!reg2) throw new Error('No se encontró la inscripción de María en la base de datos');
  console.log(`✓ Inscripción 2 creada: Ticket ${reg2.registrationNumber}, QR Token: ${reg2.qrCode}`);
  if (!reg2.qrCode || !reg2.qrCode.startsWith('eg_qr_')) {
    throw new Error(`Fallo: La inscripción 2 NO recibió un token QR seguro`);
  }

  // 7. Prueba de Búsqueda Flexible
  console.log('\n--- Probando Búsqueda Inteligente ---');
  // a) Buscar por cédula sin guiones: "00112345678"
  const searchByDoc = await AttendanceService.searchAndList(event.id, { search: '00112345678' });
  console.log(`✓ Búsqueda por cédula sin guiones ("00112345678"): encontró ${searchByDoc.data.length} participante(s)`);
  if (searchByDoc.data.length === 0 || searchByDoc.data[0].id !== reg1.id) {
    throw new Error('Fallo: La búsqueda por cédula sin guiones no encontró a Alejandro');
  }

  // b) Buscar por teléfono sin guiones: "8095551234"
  const searchByPhone = await AttendanceService.searchAndList(event.id, { search: '8095551234' });
  console.log(`✓ Búsqueda por teléfono sin guiones ("8095551234"): encontró ${searchByPhone.data.length} participante(s)`);
  if (searchByPhone.data.length === 0 || searchByPhone.data[0].id !== reg1.id) {
    throw new Error('Fallo: La búsqueda por teléfono sin guiones no encontró a Alejandro');
  }

  // c) Buscar por número de ticket: reg1.registrationNumber
  const searchByTicket = await AttendanceService.searchAndList(event.id, { search: reg1.registrationNumber });
  console.log(`✓ Búsqueda por número de ticket ("${reg1.registrationNumber}"): encontró ${searchByTicket.data.length} participante(s)`);
  if (searchByTicket.data.length === 0 || searchByTicket.data[0].id !== reg1.id) {
    throw new Error('Fallo: La búsqueda por número de ticket no encontró a Alejandro');
  }

  // 8. Prueba de Generación de Entrada Digital y Código QR
  console.log('\n--- Probando Generación de Entrada Digital ---');
  const ticketData = await QrService.getTicketQr(reg1.id);
  console.log(`✓ Entrada digital generada exitosamente:`);
  console.log(`   - Evento: ${ticketData.event.name} (${ticketData.event.year})`);
  console.log(`   - Participante: ${ticketData.participant.fullName} (Doc: ${ticketData.participant.documentId})`);
  console.log(`   - No. Registro: ${ticketData.registration.registrationNumber}`);
  console.log(`   - Token QR: ${ticketData.token}`);
  console.log(`   - Data URL longitud: ${ticketData.qrDataUrl.length} caracteres`);

  if (!ticketData.qrDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Fallo: qrDataUrl no es una imagen PNG en base64 válida');
  }
  if (ticketData.participant.fullName !== 'Dr. Alejandro Gómez Sánchez') {
    throw new Error('Fallo: El nombre del participante no coincide');
  }

  // 9. Prueba de Escaneo y Validación QR (Regla: NUNCA marca asistencia automáticamente)
  console.log('\n--- Probando Escaneo y Validación QR ---');
  // a) Escaneo con token directo
  const scanDirect = await QrService.validateAndScan(reg1.qrCode!, event.id);
  console.log(`✓ Escaneo con token directo: estado = ${scanDirect.status}, canCheckIn = ${scanDirect.canCheckIn}`);
  if (scanDirect.status !== 'VALID' || !scanDirect.canCheckIn) {
    throw new Error(`Fallo: La entrada debería ser VALID pero es ${scanDirect.status}`);
  }

  // Verificar que la asistencia sigue en FALSE
  const regCheckBefore = await prisma.registration.findUnique({ where: { id: reg1.id } });
  if (regCheckBefore?.attended) {
    throw new Error('VIOLACIÓN DE SEGURIDAD: El escaneo marcó asistencia automáticamente');
  }
  console.log('✓ Protección confirmada: El escaneo NO marcó asistencia automáticamente.');

  // b) Escaneo con URL completa capturada por el lector
  const scanUrl = await QrService.validateAndScan(`https://eventgrid.app/t/${reg1.qrCode}`, event.id);
  console.log(`✓ Escaneo con URL completa: estado = ${scanUrl.status}, canCheckIn = ${scanUrl.canCheckIn}`);
  if (scanUrl.status !== 'VALID') {
    throw new Error('Fallo: El escáner no interpretó la URL completa');
  }

  // c) Escaneo por número de registro
  const scanRegNum = await QrService.validateAndScan(reg1.registrationNumber, event.id);
  console.log(`✓ Escaneo por No. Registro: estado = ${scanRegNum.status}`);
  if (scanRegNum.status !== 'VALID') {
    throw new Error('Fallo: La validación por número de registro no funcionó');
  }

  // 10. Confirmación Manual de Asistencia (Check-in Operador)
  console.log('\n--- Confirmando Asistencia Manualmente ---');
  const checkInResult = await AttendanceService.checkIn(event.id, reg1.id, admin.id);
  console.log(`✓ Asistencia confirmada: attended = ${checkInResult.registration.attended}, attendedAt = ${checkInResult.registration.attendedAt}`);
  if (!checkInResult.registration.attended || !checkInResult.registration.attendedAt) {
    throw new Error('Fallo: No se registró la asistencia tras pulsar confirmar');
  }

  // 11. Segundo Escaneo (Prevención de Entradas Duplicadas)
  console.log('\n--- Probando Detección de Entrada Ya Utilizada ---');
  const scanAlreadyAttended = await QrService.validateAndScan(reg1.qrCode!, event.id);
  console.log(`✓ Segundo escaneo: estado = ${scanAlreadyAttended.status}, canCheckIn = ${scanAlreadyAttended.canCheckIn}`);
  console.log(`   Mensaje: "${scanAlreadyAttended.message}"`);
  if (scanAlreadyAttended.status !== 'ALREADY_CHECKED_IN' || scanAlreadyAttended.canCheckIn !== false) {
    throw new Error(`Fallo: Debería ser ALREADY_CHECKED_IN pero es ${scanAlreadyAttended.status}`);
  }

  // 12. Revocación y Regeneración de QR
  console.log('\n--- Probando Revocación y Regeneración de QR ---');
  const oldQrToken = reg1.qrCode!;
  const revokeResult = await QrService.revokeAndRegenerate(reg1.id, admin.id, 'Prueba de extravío de credencial');
  console.log(`✓ QR Revocado. Nuevo token: ${revokeResult.newQrToken}`);

  // Probar escaneo con el token viejo -> Debe ser INVALID_CODE
  const scanOld = await QrService.validateAndScan(oldQrToken, event.id);
  console.log(`✓ Escaneo con token anterior: estado = ${scanOld.status}`);
  if (scanOld.status !== 'INVALID_CODE') {
    throw new Error(`Fallo: El código anterior debería ser inválido pero es ${scanOld.status}`);
  }

  // Probar escaneo con el token nuevo -> Debe ser ALREADY_CHECKED_IN (mantiene el historial del participante)
  const scanNew = await QrService.validateAndScan(revokeResult.newQrToken, event.id);
  console.log(`✓ Escaneo con token nuevo: estado = ${scanNew.status}`);
  if (scanNew.status !== 'ALREADY_CHECKED_IN') {
    throw new Error(`Fallo: El nuevo token debería reflejar que el participante ya asistió`);
  }

  // 13. Limpieza de datos sintéticos de prueba
  console.log('\n--- Limpiando registros de prueba sintéticos ---');
  await prisma.registration.deleteMany({
    where: {
      eventId: event.id,
      participant: { email: { in: ['alejandro.gomez.test@example.com', 'maria.rodriguez.test@example.com'] } },
    },
  });
  await prisma.participant.deleteMany({
    where: {
      email: { in: ['alejandro.gomez.test@example.com', 'maria.rodriguez.test@example.com'] },
    },
  });
  await prisma.importBatch.delete({
    where: { id: execution.batchId },
  });
  console.log('✓ Registros de prueba sintéticos eliminados limpiamente.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN E2E PASARON SATISFACTORIAMENTE (100% ÉXITO)! 🎉');
}

runE2eFlow()
  .catch((err) => {
    console.error('\n❌ ERROR EN LA PRUEBA E2E:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
