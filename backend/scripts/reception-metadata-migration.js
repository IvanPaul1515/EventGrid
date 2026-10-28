// Add metadata before Prisma's schema reconciliation. Historical payment origin
// becomes LEGACY once, never presumed to be EventGrid cash. No financial backfill,
// renumbering, price changes, deletions or destructive acceptance flags.
export async function migrateReceptionMetadata(db) {
  const columns = await db.$queryRawUnsafe('PRAGMA table_info("registrations")');
  if (!columns.length) return; // New database: Prisma creates the complete schema.
  const names = new Set(columns.map(column => column.name));
  await db.$transaction(async tx => {
    for (const name of ['externalPaymentStatus', 'externalReference', 'externalPlatform', 'buyerName', 'originLabel', 'createdByUserId', 'commercialUserId', 'organizationRnc', 'participantCategory', 'waitlistState', 'importOriginalData', 'paymentFullReported', 'externalPaymentMethod', 'cancelledByUserId', 'cancellationReason', 'cancellationType']) {
      if (!names.has(name)) await tx.$executeRawUnsafe(`ALTER TABLE "registrations" ADD COLUMN "${name}" TEXT`);
    }
    const addColumns = async (table, declarations) => {
      const existing = await tx.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
      if (!existing.length) return;
      const names = new Set(existing.map(c => c.name));
      for (const [name, type] of declarations) if (!names.has(name)) await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type}`);
      return names;
    };
    await addColumns('registrations', [['lastExternalSyncAt','DATETIME'],['cancelledAt','DATETIME']]);
    await addColumns('event_settings', [['paymentDeadlineAt','DATETIME'],['paymentInstructions','TEXT'],['paymentSupportContact','TEXT']]);
    const payments = await addColumns('payments', [['channel',"TEXT NOT NULL DEFAULT 'ONSITE'"],['idempotencyKey','TEXT'],['externalReference','TEXT'],['sourceBatchId','TEXT'],['externalMethod','TEXT'],['recordedByUserId','TEXT']]);
    if (payments && !payments.has('channel')) await tx.$executeRawUnsafe("UPDATE payments SET channel='LEGACY'");
    if (payments) await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey")');
    const batches = await addColumns('import_batches', [['contentHash','TEXT']]);
    if (batches) await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "import_batches_eventId_contentHash_key" ON "import_batches"("eventId","contentHash")');
    // Nullable identity fields are additive. Build the unique index explicitly
    // before Prisma reconciliation; existing duplicates fail closed, never deleted.
    const sponsors = await addColumns('sponsors', [['legalName','TEXT'],['rnc','TEXT']]);
    if (sponsors) await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "sponsors_eventId_rnc_key" ON "sponsors"("eventId","rnc")');
    await addColumns('courtesy_requests', [['exceptionType',"TEXT NOT NULL DEFAULT 'COURTESY'"],['agreementReference','TEXT']]);
    // Historical rows have NULL references. A duplicate real reference fails
    // closed instead of removing or changing either registration.
    await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "registrations_eventId_externalPlatform_externalReference_key" ON "registrations"("eventId", "externalPlatform", "externalReference")');
  });
}
