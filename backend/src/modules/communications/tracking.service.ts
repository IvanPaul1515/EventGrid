import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { normalizeName } from '../../utils/participantSearch.js';
import { safeCommunicationError } from '../../utils/communicationError.js';
const accepted = Prisma.sql `('SENT','ACCEPTED_BY_SMTP','ACCEPTED_BY_PROVIDER','DELIVERED')`;
const pending = Prisma.sql `('PREPARED','PENDING')`;
// Read-only projection: a batch item is not counted twice when its log already represents its current state.
export function communicationProjection(eventId: string, operator: boolean) {
    return Prisma.sql `WITH communications AS (
    SELECT l.id, l."registrationId", l."recipientEmail", l."templateCode", l.subject, l.status,
      l."sentAt" AS "date", l."sentByUserId" AS "actorId", l."messageId", l."errorMessage",
      CASE WHEN l.status IN ('PREPARED','PENDING','CANCELLED') THEN 0 ELSE 1 END AS attempts,
      'LOG' AS source
    FROM email_logs l WHERE l."eventId" = ${eventId} ${operator ? Prisma.sql `AND l."templateCode" = 'DIGITAL_TICKET'` : Prisma.empty}
    UNION ALL
    SELECT b.id, b."registrationId", b."recipientEmail", j."templateCode", COALESCE(b."renderedSubject",j.subject), b.status,
      COALESCE(b."lastAttemptAt",b."createdAt"), j."createdById", b."messageId", b."errorMessage",
      CASE WHEN b.attempts > (SELECT COUNT(*) FROM email_logs old WHERE old."batchId"=j.id AND old."registrationId"=b."registrationId" AND old.status NOT IN ('PREPARED','PENDING','CANCELLED'))
        THEN b.attempts - (SELECT COUNT(*) FROM email_logs old WHERE old."batchId"=j.id AND old."registrationId"=b."registrationId" AND old.status NOT IN ('PREPARED','PENDING','CANCELLED')) ELSE 0 END, 'BATCH'
    FROM email_batch_items b JOIN email_batch_jobs j ON j.id = b."jobId"
    WHERE j."eventId" = ${eventId} ${operator ? Prisma.sql `AND j."templateCode" = 'DIGITAL_TICKET'` : Prisma.empty}
      AND NOT EXISTS (SELECT 1 FROM email_logs l WHERE l."eventId" = j."eventId" AND l.status = b.status
        AND ((b."messageId" IS NOT NULL AND l."messageId" = b."messageId") OR
          (l."batchId" = j.id AND l."registrationId" = b."registrationId")))
  )`;
}
const validEmail = Prisma.sql `p.email LIKE '%_@_%._%' AND p.email NOT LIKE '% %'`;
const eligible = Prisma.sql `r.status = 'CONFIRMED' AND r."isDemo" = false AND ${validEmail}`;
const ticketAccepted = Prisma.sql `EXISTS (SELECT 1 FROM communications c WHERE c."registrationId" = r.id AND c."templateCode" = 'DIGITAL_TICKET' AND c.status IN ${accepted})`;
const toDate = (v: unknown) => v == null ? null : new Date(typeof v === 'bigint' ? Number(v) : v as any).toISOString();
function safeRecord(row: any, admin: boolean) {
    return { ...row, date: toDate(row.date), attempts: Number(row.attempts || 0),
        errorMessage: safeCommunicationError(row.errorMessage, admin) };
}
export class CommunicationTracking {
    static async participants(eventId: string, operator: boolean, query: {
        page: number;
        limit: number;
        search?: string;
        filter?: string;
        ids?: string[];
    }) {
        const { page, limit, search, filter } = query;
        const conditions = [Prisma.sql `r."eventId" = ${eventId}`];
        if (query.ids)
            conditions.push(query.ids.length ? Prisma.sql `r.id IN (${Prisma.join(query.ids)})` : Prisma.sql `1=0`);
        if (search?.trim()) {
            const escape = (value: string) => value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
            const term = '%' + escape(search.trim().toLowerCase()) + '%';
            let name = Prisma.sql `(p."fullName" || ' ' || p."firstName" || ' ' || p."lastName")`;
            for (const [from, to] of Object.entries({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n', 'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ü': 'u', 'Ñ': 'n' }))
                name = Prisma.sql `REPLACE(${name},${from},${to})`;
            const tokens = normalizeName(search.trim()).split(' ').filter(Boolean).slice(0, 20).map(token => Prisma.sql `LOWER(${name}) LIKE ${'%' + escape(token) + '%'} ESCAPE '!'`);
            conditions.push(Prisma.sql `(LOWER(p.email) LIKE ${term} ESCAPE '!' OR LOWER(r."registrationNumber") LIKE ${term} ESCAPE '!' OR LOWER(COALESCE(p."documentId",'')) LIKE ${term} ESCAPE '!' OR (${Prisma.join(tokens, ' AND ')}))`);
        }
        const hasStatus = (statuses: Prisma.Sql) => Prisma.sql `EXISTS (SELECT 1 FROM communications c WHERE c."registrationId"=r.id AND c.status IN ${statuses})`;
        const filters: Record<string, Prisma.Sql> = {
            NONE: Prisma.sql `NOT EXISTS (SELECT 1 FROM communications c WHERE c."registrationId"=r.id)`, ACCEPTED: hasStatus(accepted),
            PENDING: hasStatus(Prisma.sql `('PREPARED','PENDING','PROCESSING','DEFERRED')`), FAILED: hasStatus(Prisma.sql `('FAILED','REJECTED','BLOCKED')`),
            UNCERTAIN: hasStatus(Prisma.sql `('UNKNOWN_DELIVERY_STATUS')`), DIGITAL: ticketAccepted,
            MISSING_DIGITAL: Prisma.sql `${eligible} AND NOT ${ticketAccepted}`, COURTESY: Prisma.sql `r."isCourtesy"=true`,
            CONFIRMED: Prisma.sql `r.status='CONFIRMED'`, UNPAID: Prisma.sql `r."balanceDue">0`,
        };
        if (filter && filters[filter])
            conditions.push(filters[filter]);
        const where = Prisma.join(conditions, ' AND '), projection = communicationProjection(eventId, operator);
        const [counts, rows] = await Promise.all([
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT COUNT(*) AS total FROM registrations r JOIN participants p ON p.id=r."participantId" WHERE ${where}`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT r.id,r."registrationNumber",p."fullName",p.email,
        (SELECT COUNT(*) FROM communications c WHERE c."registrationId"=r.id) AS "communicationCount",
        (SELECT c.status FROM communications c WHERE c."registrationId"=r.id ORDER BY c."date" DESC,c.id DESC LIMIT 1) AS "lastStatus",
        (SELECT c."templateCode" FROM communications c WHERE c."registrationId"=r.id ORDER BY c."date" DESC,c.id DESC LIMIT 1) AS "lastTemplate",
        (SELECT c."date" FROM communications c WHERE c."registrationId"=r.id AND c.attempts>0 ORDER BY c."date" DESC,c.id DESC LIMIT 1) AS "lastAttempt"
        FROM registrations r JOIN participants p ON p.id=r."participantId" WHERE ${where}
        ORDER BY r."registrationNumber",r.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
        ]);
        return { data: rows.map(r => ({ ...r, communicationCount: Number(r.communicationCount), lastAttempt: toDate(r.lastAttempt) })), pagination: { page, limit, total: Number(counts[0].total), totalPages: Math.max(1, Math.ceil(Number(counts[0].total) / limit)) } };
    }
    static async history(eventId: string, operator: boolean, registrationId: string, page: number, limit: number, templateCode?: string) {
        const projection = communicationProjection(eventId, operator);
        const filter = Prisma.sql `"registrationId"=${registrationId} ${templateCode ? Prisma.sql `AND "templateCode"=${templateCode}` : Prisma.empty}`;
        const [rows, counts, templates] = await Promise.all([
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT c.*,u."fullName" AS "actorName" FROM communications c LEFT JOIN users u ON u.id=c."actorId" WHERE ${filter} ORDER BY c."date" DESC,c.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT COUNT(*) AS total,SUM(attempts) AS attempts,MAX(CASE WHEN attempts>0 THEN "date" ELSE NULL END) AS "lastAttempt" FROM communications WHERE ${filter}`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT DISTINCT "templateCode" AS code FROM communications WHERE ${filter} ORDER BY "templateCode"`),
        ]);
        return { data: rows.map(r => safeRecord(r, !operator)), summary: { totalAttempts: Number(counts[0].attempts || 0), lastAttempt: toDate(counts[0].lastAttempt), templates: templates.map(t => t.code) }, pagination: { page, limit, total: Number(counts[0].total), totalPages: Math.max(1, Math.ceil(Number(counts[0].total) / limit)) } };
    }
    static async summary(eventId: string, operator: boolean) {
        const projection = communicationProjection(eventId, operator);
        const [states, templates, days, coverage, recent, contacted] = await Promise.all([
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT status,COUNT(*) AS count,SUM(attempts) AS attempts FROM communications GROUP BY status`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT "templateCode" AS name,COUNT(*) AS count FROM communications GROUP BY "templateCode"`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT ${process.env.DATABASE_URL?.startsWith('file:') ? Prisma.sql `date("date"/1000,'unixepoch')` : Prisma.sql `to_char("date" AT TIME ZONE 'UTC','YYYY-MM-DD')`} AS day,COUNT(*) AS count FROM communications GROUP BY day ORDER BY day DESC LIMIT 30`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT SUM(CASE WHEN ${eligible} AND NOT ${ticketAccepted} THEN 1 ELSE 0 END) AS missing,
        SUM(CASE WHEN r.status='CONFIRMED' AND r."isDemo"=false AND NOT (${validEmail}) THEN 1 ELSE 0 END) AS invalid
        FROM registrations r JOIN participants p ON p.id=r."participantId" WHERE r."eventId"=${eventId}`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT c.*,u."fullName" AS "actorName" FROM communications c LEFT JOIN users u ON u.id=c."actorId" ORDER BY c."date" DESC,c.id DESC LIMIT 8`),
            prisma.$queryRaw<any[]>(Prisma.sql `${projection} SELECT COUNT(DISTINCT r."participantId") AS total FROM communications c JOIN registrations r ON r.id=c."registrationId" WHERE r."eventId"=${eventId} AND c.status IN ${accepted}`),
        ]);
        const distribution = states.map(x => ({ status: x.status, count: Number(x.count), attempts: Number(x.attempts || 0) }));
        const count = (values: string[]) => distribution.filter(x => values.includes(x.status)).reduce((s, x) => s + x.count, 0);
        return { scope: operator ? 'Entrada digital de la edición; Mis envíos conserva el filtro personal' : 'Edición seleccionada',
            records: distribution.reduce((s, x) => s + x.count, 0), totalAttempts: distribution.reduce((s, x) => s + x.attempts, 0),
            accepted: count(['SENT', 'ACCEPTED_BY_SMTP', 'ACCEPTED_BY_PROVIDER', 'DELIVERED']), delivered: count(['DELIVERED']),
            pending: count(['PREPARED', 'PENDING', 'DEFERRED']), processing: count(['PROCESSING']), failed: count(['FAILED', 'REJECTED', 'BLOCKED']),
            uncertain: count(['UNKNOWN_DELIVERY_STATUS']), simulated: count(['SIMULATED']), uniqueContacted: Number(contacted[0].total),
            missingDigital: Number(coverage[0].missing || 0), invalidExcluded: Number(coverage[0].invalid || 0),
            missingDefinition: 'Participantes confirmados, no demo, con correo de formato válido y sin entrada digital aceptada por el proveedor.',
            distribution, templates: templates.map(x => ({ ...x, count: Number(x.count) })), days: days.reverse().map(x => ({ ...x, count: Number(x.count) })), recent: recent.map(r => safeRecord(r, !operator)) };
    }
}
