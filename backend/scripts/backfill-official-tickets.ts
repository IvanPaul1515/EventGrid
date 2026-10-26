import { prisma } from '../src/config/db.js';
import { backfillDefaultTickets } from '../src/modules/events/defaultTicketMigration.js';
// Run only after an approved backup and schema migration. No startup hook.
backfillDefaultTickets(prisma).then(result => console.log(JSON.stringify(result))).catch(() => { console.error('La selección explícita no se completó.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
