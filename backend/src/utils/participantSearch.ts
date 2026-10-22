import type { PrismaClient } from '@prisma/client';

export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
}

export function matchesParticipantName(name: string, search: string): boolean {
  const tokens = normalizeName(search).split(' ').filter(Boolean);
  const normalized = normalizeName(name);
  return tokens.length > 0 && tokens.every((token) => normalized.includes(token));
}

// Provider-independent (SQLite/PostgreSQL), without altering stored names or schema.
// Only project names and IDs from this event; keep filtering and pagination in SQL.
export async function participantNameIds(db: PrismaClient, eventId: string, search: string): Promise<string[]> {
  if (!/^[\p{L}\p{M}\s.'’-]+$/u.test(search.trim())) return [];
  const participants = await db.participant.findMany({
    where: { registrations: { some: { eventId } } },
    select: { id: true, fullName: true, firstName: true, lastName: true },
  });
  return participants.filter((p) => matchesParticipantName(
    `${p.fullName} ${p.firstName} ${p.lastName}`, search
  )).map((p) => p.id);
}
