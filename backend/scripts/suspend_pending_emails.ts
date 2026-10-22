import { prisma } from '../src/config/db.js';

async function main() {
  const pendingItems = await prisma.emailBatchItem.findMany({
    where: { status: 'PENDING' },
    select: { id: true, jobId: true, recipientEmail: true, status: true, attempts: true }
  });
  console.log(`Found ${pendingItems.length} PENDING items. Updating to CANCELLED to prevent accidental dispatch.`);

  const updated = await prisma.emailBatchItem.updateMany({
    where: { status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      errorMessage: 'Envío suspendido preventivamente por auditoría y protección de cuota Brevo.'
    }
  });
  console.log(`Updated ${updated.count} items to CANCELLED.`);

  // Also check any PROCESSING items
  const processingItems = await prisma.emailBatchItem.updateMany({
    where: { status: 'PROCESSING' },
    data: {
      status: 'CANCELLED',
      errorMessage: 'Envío suspendido preventivamente por auditoría y protección de cuota Brevo.'
    }
  });
  console.log(`Updated ${processingItems.count} PROCESSING items to CANCELLED.`);

  // Update any PENDING or PROCESSING batch jobs
  const updatedJobs = await prisma.emailBatchJob.updateMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    data: {
      status: 'CANCELLED',
      errorMessage: 'Campaña cancelada preventivamente por auditoría y protección de cuota Brevo.'
    }
  });
  console.log(`Updated ${updatedJobs.count} batch jobs to CANCELLED.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
