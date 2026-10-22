import { describe, it, expect } from 'vitest';
import { matchesParticipantName, normalizeName, participantNameIds } from '../src/utils/participantSearch.js';

describe('participant name search (no database writes)', () => {
  it('normalizes accents, case and repeated whitespace', () => {
    expect(normalizeName('  JOSÉ   Pérez  ')).toBe('jose perez');
    expect(matchesParticipantName('José Luis Pérez Núñez', '  jose   perez nunez ')).toBe(true);
    expect(matchesParticipantName('María del Carmen Gómez', 'gomez maria carmen')).toBe(true);
    expect(matchesParticipantName('José Luis Pérez', 'jose garcia')).toBe(false);
    expect(matchesParticipantName('José Luis Pérez', '   ')).toBe(false);
  });
  it('scopes candidates to the event and projects only name fields', async () => {
    let args: any;
    const db = { participant: { findMany: async (query: any) => {
      args = query;
      return [{ id: 'a', fullName: 'José Pérez', firstName: 'José', lastName: 'Pérez' }];
    } } };
    expect(await participantNameIds(db as any, 'event-a', 'perez jose')).toEqual(['a']);
    expect(args.where).toEqual({ registrations: { some: { eventId: 'event-a' } } });
    expect(args.select).not.toHaveProperty('email');
    expect(await participantNameIds(db as any, 'event-a', 'https://example/t/token')).toEqual([]);
  });
});
