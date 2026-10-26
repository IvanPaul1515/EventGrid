// Add nullable metadata before Prisma's schema reconciliation. No backfill,
// renumbering, price changes, deletions or destructive acceptance flags.
export async function migrateReceptionMetadata(db) {
  const columns = await db.$queryRawUnsafe('PRAGMA table_info("registrations")');
  if (!columns.length) return; // New database: Prisma creates the complete schema.
  const names = new Set(columns.map(column => column.name));
  await db.$transaction(async tx => {
    for (const name of ['externalPaymentStatus', 'externalReference', 'externalPlatform', 'buyerName', 'originLabel', 'createdByUserId', 'commercialUserId']) {
      if (!names.has(name)) await tx.$executeRawUnsafe(`ALTER TABLE "registrations" ADD COLUMN "${name}" TEXT`);
    }
    // Historical rows have NULL references. A duplicate real reference fails
    // closed instead of removing or changing either registration.
    await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "registrations_eventId_externalPlatform_externalReference_key" ON "registrations"("eventId", "externalPlatform", "externalReference")');
  });
}
