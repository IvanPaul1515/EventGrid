// Preparation only: never calls Google, signs a Save URL, emails, or writes data.
// Supply a synthetic isDemo registration from an isolated development database.
import fs from 'node:fs';
import { prisma } from '../src/config/db.js';
import { WalletService } from '../src/modules/wallet/wallet.service.js';

try {
  if (process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.WALLET_DEMO_PREPARE !== 'true') throw new Error('Use únicamente una copia de desarrollo aislada con WALLET_DEMO_PREPARE=true.');
  const [registrationId, output] = process.argv.slice(2);
  if (!registrationId || !output || !/^\d+$/.test(process.env.GOOGLE_WALLET_ISSUER_ID || '')) throw new Error('Indique inscripción demo, archivo nuevo e ID oficial del emisor de pruebas.');
  const registration = await WalletService.registration(registrationId);
  if (!registration.isDemo) throw new Error('Solo se admiten inscripciones sintéticas marcadas como demo.');
  WalletService.assertEligible(registration);
  const preparation = { developmentOnly: true, eventTicketClass: WalletService.googleClass(registration), eventTicketObject: WalletService.googleData(registration) };
  fs.writeFileSync(output, JSON.stringify(preparation, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Preparación guardada. Mantenga el archivo privado; contiene el QR de prueba. Revise la clase en la consola oficial y limite las pruebas a test accounts.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo preparar el pase demo.'); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
