import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Reserved identities: never repurpose an existing account with a matching email.
export const DEMO_SCANNERS = {
  SCANNER_1: { id: '56bbfdb6-f601-42dc-8a36-37914bf57001', email: 'scanner-1@example.invalid', fullName: 'Escáner QR 1', password: 'EventGridDemo!Scanner1' },
  SCANNER_2: { id: '56bbfdb6-f601-42dc-8a36-37914bf57002', email: 'scanner-2@example.invalid', fullName: 'Escáner QR 2', password: 'EventGridDemo!Scanner2' },
} as const;

export async function seedDemoScanners(prisma: Pick<PrismaClient, 'user'>, eventId: string, enabled: boolean) {
  if (!enabled) return;
  for (const account of Object.values(DEMO_SCANNERS)) {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: account.email }, { id: account.id }] } });
    if (existing) continue;
    await prisma.user.create({ data: {
      id: account.id, email: account.email, fullName: account.fullName,
      passwordHash: await bcrypt.hash(account.password, 10), role: 'OPERATOR',
      scannerOnly: true, assignedEventId: eventId, isActive: true, accountStatus: 'ACTIVE',
    } });
  }
}

export function isDemoScannerAccount(user: { id: string; role: string; scannerOnly?: boolean; assignedEventId?: string | null }, account: { id: string }) {
  return user.id === account.id && user.role === 'OPERATOR' && user.scannerOnly === true && Boolean(user.assignedEventId);
}
