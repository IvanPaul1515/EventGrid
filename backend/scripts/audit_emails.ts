import { prisma } from '../src/config/db.js';

async function main() {
  console.log('=== 1. PENDING BATCH JOBS & ITEMS ===');
  const pendingJobs = await prisma.emailBatchJob.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true, templateCode: true, status: true, totalCount: true, sentCount: true, failedCount: true, createdAt: true }
  });
  console.log('Pending Jobs count:', pendingJobs.length, pendingJobs);

  const pendingItems = await prisma.emailBatchItem.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true, jobId: true, recipientEmail: true, status: true, attempts: true, leaseUntil: true }
  });
  console.log('Pending Items count:', pendingItems.length, pendingItems);

  const scheduledNotifs = await prisma.scheduledNotification.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true, title: true, status: true, scheduledFor: true }
  });
  console.log('Pending Scheduled Notifications count:', scheduledNotifs.length, scheduledNotifs);

  console.log('=== 2. AUDIT OF ALL EMAIL LOGS (REAL VS SIMULATED) ===');
  const logs = await prisma.emailLog.findMany({
    orderBy: { sentAt: 'desc' },
    select: {
      id: true,
      recipientEmail: true,
      recipientName: true,
      templateCode: true,
      subject: true,
      status: true,
      errorMessage: true,
      batchId: true,
      sentByUserId: true,
      sentAt: true
    }
  });
  console.log('Total EmailLog count:', logs.length);
  const byStatus: Record<string, number> = {};
  for (const l of logs) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  }
  console.log('EmailLog by status:', byStatus);

  console.log('\n--- Details of ACCEPTED_BY_SMTP or SENT in EmailLog ---');
  const realSentLogs = logs.filter(l => l.status === 'ACCEPTED_BY_SMTP' || l.status === 'SENT' || l.status === 'DELIVERED');
  console.log(`Found ${realSentLogs.length} real sent logs:`);
  for (const l of realSentLogs) {
    console.log(`[${l.sentAt.toISOString()}] TO: ${l.recipientEmail} | TMPL: ${l.templateCode} | STATUS: ${l.status} | BATCH: ${l.batchId || 'SINGLE'} | BY: ${l.sentByUserId || 'NONE'}`);
  }

  console.log('\n=== 3. AUDIT OF BATCH JOBS ===');
  const batchJobs = await prisma.emailBatchJob.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      templateCode: true,
      subject: true,
      status: true,
      mode: true,
      totalCount: true,
      sentCount: true,
      failedCount: true,
      simulatedCount: true,
      createdById: true,
      createdAt: true
    }
  });
  console.log('Total Batch Jobs:', batchJobs.length);
  for (const bj of batchJobs) {
    console.log(`[${bj.createdAt.toISOString()}] ID: ${bj.id} | TMPL: ${bj.templateCode} | MODE: ${bj.mode} | STATUS: ${bj.status} | TOTAL: ${bj.totalCount} | SENT: ${bj.sentCount} | FAILED: ${bj.failedCount} | SIM: ${bj.simulatedCount} | BY: ${bj.createdById}`);
  }

  console.log('\n=== 4. RECENT AUDIT LOGS FOR EMAIL RESENDS / ACTIONS ===');
  const auditLogs = await prisma.auditLog.findMany({
    where: { action: { contains: 'EMAIL' } },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log('Audit logs for EMAIL actions:', auditLogs.length);
  for (const a of auditLogs) {
    console.log(`[${a.createdAt.toISOString()}] ACTION: ${a.action} | ENTITY: ${a.entity}:${a.entityId} | USER: ${a.userId} | CHANGES: ${a.changes}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
