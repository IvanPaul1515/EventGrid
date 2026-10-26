import { PrismaClient } from '@prisma/client';
// Explicit migration utility, never invoked by server startup. Only one compatible candidate is unambiguous.
export async function backfillDefaultTickets(prisma: PrismaClient) {
    return prisma.$transaction(async (tx) => {
        const events = await tx.event.findMany({ where: { defaultTicketTypeId: null }, include: { ticketTypes: { where: { isActive: true, price: { gt: 0 } } } } });
        const results = [];
        for (const event of events) {
            if (event.ticketTypes.length !== 1) {
                results.push({ event: event.name, status: 'REQUIRES_ADMIN_SELECTION' });
                continue;
            }
            const changed = await tx.event.updateMany({ where: { id: event.id, defaultTicketTypeId: null }, data: { defaultTicketTypeId: event.ticketTypes[0].id } });
            if (changed.count) {
                const changes = { action: 'MIGRATE_DEFAULT_TICKET', ticketTypeId: event.ticketTypes[0].id, reason: 'One compatible candidate only; no prices changed' };
                await tx.auditLog.create({ data: { entity: 'EVENT', entityId: event.id, action: 'UPDATE', changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
            }
            results.push({ event: event.name, status: changed.count ? 'SELECTED_SINGLE_CANDIDATE' : 'UNCHANGED' });
        }
        return results;
    });
}
