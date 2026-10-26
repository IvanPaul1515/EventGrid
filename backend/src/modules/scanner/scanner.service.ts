import { randomInt, createHmac, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from '../../utils/errors.js';
import { AuthUser } from '../../middleware/auth.js';
import { assignedEdition } from '../../middleware/editionAccess.js';
import { QrService } from '../qr/qr.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const lease = () => new Date(Date.now() + 45000);
const digest = (id: string, code: string) => createHmac('sha256', ENV.JWT_SECRET).update(id + ':' + code).digest('hex');
const key = () => createHash('sha256').update(ENV.JWT_SECRET).digest();
function encrypt(code: string) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv); const body = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'); }
function decrypt(value: string) { const b = Buffer.from(value, 'base64'), d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return d.update(b.subarray(28)) + d.final('utf8'); }

export class ScannerService {
  static async authorize(user: AuthUser, eventId: string) {
    if (!user.sessionId || user.sessionId.startsWith('legacy-')) throw new ForbiddenError('Inicie sesión nuevamente para vincular dispositivos');
    if (!['ADMIN', 'OPERATOR'].includes(user.role)) throw new ForbiddenError();
    const allowed = await assignedEdition(user);
    if (allowed && allowed !== eventId) throw new ForbiddenError();
    if (!await prisma.event.findUnique({ where: { id: eventId } })) throw new BadRequestError('Edición no disponible');
  }
  static async session(tx: any, id: string, userId?: string) {
    const session = await tx.authSession.findUnique({ where: { id }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || !session.user.isActive || session.user.accountStatus === 'PENDING' || session.user.sessionVersion !== session.sessionVersion || !['ADMIN', 'OPERATOR'].includes(session.user.role) || (userId && session.userId !== userId)) throw new UnauthorizedError('Dispositivo desconectado o sesión revocada');
    return session;
  }
  static async station(tx: any, id: string, eventId: string, userId: string) {
    const station = await tx.receptionStation.findUnique({ where: { id } });
    if (!station || station.eventId !== eventId || station.userId !== userId || station.leaseUntil.getTime() <= Date.now()) throw new ConflictError('La estación ya no está disponible');
    const session = await this.session(tx, station.sessionId, userId);
    const allowed = await assignedEdition(session.user);
    if (allowed && allowed !== eventId) throw new ForbiddenError();
    return station;
  }
  static async register(user: AuthUser, eventId: string, label: string) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      await this.session(tx, user.sessionId!, user.id);
      const previous = await tx.receptionStation.findUnique({ where: { sessionId: user.sessionId! } });
      if (previous && previous.eventId !== eventId) await this.clear(tx, previous);
      return tx.receptionStation.upsert({ where: { sessionId: user.sessionId! }, create: { sessionId: user.sessionId!, userId: user.id, eventId, label, leaseUntil: lease() }, update: { eventId, label, leaseUntil: lease(), version: { increment: 1 } } });
    });
  }
  static async clear(tx: any, station: any) {
    if (station.activeLinkId) await tx.scannerLink.updateMany({ where: { id: station.activeLinkId }, data: { status: 'REVOKED', codeHash: null, codeCipher: null } });
    if (station.activeReadingId) await tx.scannerReading.updateMany({ where: { id: station.activeReadingId, status: 'PENDING' }, data: { status: 'DISMISSED' } });
    await tx.receptionStation.update({ where: { id: station.id }, data: { activeLinkId: null, activeReadingId: null, busy: false, version: { increment: 1 } } });
  }
  static async available(user: AuthUser, eventId: string) {
    await this.authorize(user, eventId);
    const candidates = await prisma.receptionStation.findMany({ where: { eventId, userId: user.id, sessionId: { not: user.sessionId }, leaseUntil: { gt: new Date() }, activeLinkId: null }, select: { id: true, label: true, sessionId: true } });
    const valid = [];
    for (const station of candidates) { try { await this.session(prisma, station.sessionId, user.id); valid.push({ id: station.id, label: station.label }); } catch (e) { if (!(e instanceof UnauthorizedError)) throw e; } }
    return valid;
  }
  static async request(user: AuthUser, eventId: string, stationId: string) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      await this.session(tx, user.sessionId!, user.id);
      const station = await this.station(tx, stationId, eventId, user.id);
      if (station.sessionId === user.sessionId) throw new BadRequestError('Use otro dispositivo');
      if (station.activeLinkId) {
        const old = await tx.scannerLink.findUnique({ where: { id: station.activeLinkId } });
        if (old && ((old.status === 'LINKED' && old.mobileLeaseUntil > new Date()) || (['REQUESTED', 'APPROVED'].includes(old.status) && old.expiresAt > new Date()))) throw new ConflictError('La estación ya tiene una vinculación. Desvincule primero.');
        await this.clear(tx, station);
      }
      const existing = await tx.scannerLink.findFirst({ where: { mobileSessionId: user.sessionId!, status: { in: ['REQUESTED', 'APPROVED', 'LINKED'] }, mobileLeaseUntil: { gt: new Date() } } });
      if (existing) throw new ConflictError('Este dispositivo ya tiene una vinculación');
      const code = String(randomInt(1000000)).padStart(6, '0');
      const link = await tx.scannerLink.create({ data: { eventId, stationId, mobileSessionId: user.sessionId!, expiresAt: new Date(Date.now() + 90000), mobileLeaseUntil: lease() } });
      await tx.scannerLink.update({ where: { id: link.id }, data: { codeHash: digest(link.id, code), codeCipher: encrypt(code) } });
      await tx.receptionStation.update({ where: { id: stationId }, data: { activeLinkId: link.id, version: { increment: 1 } } });
      return { id: link.id, status: link.status, expiresAt: link.expiresAt };
    });
  }
  static async linkFor(tx: any, user: AuthUser, eventId: string, linkId: string) {
    const link = await tx.scannerLink.findUnique({ where: { id: linkId } });
    if (!link || link.eventId !== eventId) throw new ForbiddenError();
    const station = await this.station(tx, link.stationId, eventId, user.id);
    if (station.activeLinkId !== link.id || ![station.sessionId, link.mobileSessionId].includes(user.sessionId!)) throw new ForbiddenError();
    const mobile = await this.session(tx, link.mobileSessionId, user.id);
    const allowed = await assignedEdition(mobile.user);
    if (allowed && allowed !== eventId) throw new ForbiddenError();
    return { link, station };
  }
  static async decide(user: AuthUser, eventId: string, linkId: string, approve: boolean) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      const { link, station } = await this.linkFor(tx, user, eventId, linkId);
      if (station.sessionId !== user.sessionId) throw new ForbiddenError();
      if (!approve) { await this.clear(tx, station); return { status: 'REVOKED' }; }
      if (link.status !== 'REQUESTED' || link.expiresAt < new Date()) throw new ConflictError('La solicitud ha expirado');
      await tx.scannerLink.update({ where: { id: linkId }, data: { status: 'APPROVED' } });
      return { status: 'APPROVED' };
    });
  }
  static async confirm(user: AuthUser, eventId: string, linkId: string, code: string) {
    await this.authorize(user, eventId);
    const result = await writeTransaction(async tx => {
      const { link } = await this.linkFor(tx, user, eventId, linkId);
      if (link.mobileSessionId !== user.sessionId) throw new ForbiddenError();
      if (link.status !== 'APPROVED' || link.expiresAt < new Date() || !link.codeHash || link.attempts >= 5) return false;
      const valid = timingSafeEqual(Buffer.from(link.codeHash, 'hex'), Buffer.from(digest(link.id, code), 'hex'));
      await tx.scannerLink.update({ where: { id: linkId }, data: valid ? { status: 'LINKED', codeHash: null, codeCipher: null, mobileLeaseUntil: lease() } : { attempts: { increment: 1 }, ...(link.attempts === 4 ? { status: 'REVOKED', codeHash: null, codeCipher: null } : {}) } });
      return valid;
    });
    // Throw outside the transaction so failed attempts remain committed.
    if (!result) throw new BadRequestError('Código incorrecto, no autorizado o vencido');
    return { status: 'LINKED' };
  }
  static async snapshot(user: AuthUser, eventId: string, busy: boolean) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      await this.session(tx, user.sessionId!, user.id);
      let station = await tx.receptionStation.findUnique({ where: { sessionId: user.sessionId! } });
      let link: any;
      const pc = station?.eventId === eventId;
      if (pc) {
        if (station!.activeLinkId && station!.leaseUntil < new Date()) await this.clear(tx, station);
        station = await tx.receptionStation.update({ where: { id: station!.id }, data: { leaseUntil: lease(), busy } });
        link = station.activeLinkId ? await tx.scannerLink.findUnique({ where: { id: station.activeLinkId } }) : null;
      } else {
        link = await tx.scannerLink.findFirst({ where: { eventId, mobileSessionId: user.sessionId!, status: { in: ['REQUESTED', 'APPROVED', 'LINKED'] } }, orderBy: { createdAt: 'desc' } });
        station = link ? await tx.receptionStation.findUnique({ where: { id: link.stationId } }) : null;
      }
      if (!station || station.eventId !== eventId) return { station: null, link: null, reading: null };
      if (link) {
        let valid = station.leaseUntil > new Date() && (link.status === 'LINKED' ? link.mobileLeaseUntil > new Date() : link.expiresAt > new Date()) && ['REQUESTED', 'APPROVED', 'LINKED'].includes(link.status);
        try { await this.linkFor(tx, user, eventId, link.id); } catch (e) { if (e instanceof UnauthorizedError || e instanceof ForbiddenError || e instanceof ConflictError) valid = false; else throw e; }
        if (!valid) { await this.clear(tx, station); link = null; station = await tx.receptionStation.findUnique({ where: { id: station.id } }); }
        else if (!pc) await tx.scannerLink.update({ where: { id: link.id }, data: { mobileLeaseUntil: lease() } });
      }
      let reading = station?.activeReadingId ? await tx.scannerReading.findUnique({ where: { id: station.activeReadingId } }) : link ? await tx.scannerReading.findFirst({ where: { linkId: link.id }, orderBy: { createdAt: 'desc' } }) : null;
      if (reading?.registrationId && reading.status === 'PENDING') {
        const reg = await tx.registration.findUnique({ where: { id: reading.registrationId }, select: { attended: true, status: true } });
        if (reg?.attended || reg?.status === 'CANCELLED') {
          reading = await tx.scannerReading.update({ where: { id: reading.id }, data: { status: reg.attended ? 'CONFIRMED' : 'REJECTED' } });
          await tx.receptionStation.update({ where: { id: station!.id }, data: { activeReadingId: null, version: { increment: 1 } } });
        }
      }
      return { station: { id: station!.id, label: station!.label, version: station!.version, pc }, link: link ? { id: link.id, status: link.status, expiresAt: link.expiresAt, code: pc && link.codeCipher ? decrypt(link.codeCipher) : undefined, user: user.fullName } : null, reading: reading ? { id: reading.id, status: reading.status, result: reading.result, registrationId: pc ? reading.registrationId : undefined } : null };
    });
  }
  static async unlink(user: AuthUser, eventId: string, linkId: string) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      const link = await tx.scannerLink.findUnique({ where: { id: linkId } });
      const station = link ? await tx.receptionStation.findUnique({ where: { id: link.stationId } }) : null;
      if (!link || !station || link.eventId !== eventId || station.userId !== user.id || ![station.sessionId, link.mobileSessionId].includes(user.sessionId!)) throw new ForbiddenError();
      if (station.activeLinkId === link.id) await this.clear(tx, station);
      return { status: 'REVOKED' };
    });
  }
  static async read(user: AuthUser, eventId: string, linkId: string, requestKey: string, token: string) {
    await this.authorize(user, eventId);
    // QR validation has no check-in side effects. Only a small status is relayed to the phone.
    const result = await QrService.validateAndScan(token, eventId);
    return writeTransaction(async tx => {
      const { link, station } = await this.linkFor(tx, user, eventId, linkId);
      if (link.mobileSessionId !== user.sessionId || link.status !== 'LINKED' || link.mobileLeaseUntil < new Date()) throw new ForbiddenError('Vinculación no disponible');
      const previous = await tx.scannerReading.findUnique({ where: { linkId_requestKey: { linkId, requestKey } } });
      if (previous) return { id: previous.id, status: previous.status, result: previous.result };
      if (station.activeReadingId) {
        const active = await tx.scannerReading.findUnique({ where: { id: station.activeReadingId } });
        if (active?.status === 'PENDING' && active.registrationId === result.registration?.id) return { id: active.id, status: active.status, result: active.result };
      }
      if (station.activeReadingId || station.busy) throw new ConflictError('La estación está atendiendo a otro participante');
      const valid = result.valid && result.canCheckIn && result.registration?.eventId === eventId;
      const reading = await tx.scannerReading.create({ data: { linkId, stationId: station.id, requestKey, registrationId: valid ? result.registration!.id : null, status: valid ? 'PENDING' : 'REJECTED', result: valid ? 'Enviada a la PC. Confirme allí la asistencia.' : result.status } });
      if (valid) await tx.receptionStation.update({ where: { id: station.id }, data: { activeReadingId: reading.id, version: { increment: 1 } } });
      return { id: reading.id, status: reading.status, result: reading.result };
    });
  }
  static async dismiss(user: AuthUser, eventId: string, linkId: string) {
    await this.authorize(user, eventId);
    return writeTransaction(async tx => {
      const { station } = await this.linkFor(tx, user, eventId, linkId);
      if (station.sessionId !== user.sessionId) throw new ForbiddenError();
      if (station.activeReadingId) await tx.scannerReading.updateMany({ where: { id: station.activeReadingId, status: 'PENDING' }, data: { status: 'DISMISSED' } });
      await tx.receptionStation.update({ where: { id: station.id }, data: { activeReadingId: null, busy: false, version: { increment: 1 } } });
      return { status: 'DISMISSED' };
    });
  }
}
