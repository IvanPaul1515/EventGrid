import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { UnauthorizedError } from '../../utils/errors.js';

export class DeviceSessionService {
  static async issue(user: { id: string; email: string; fullName: string; role: string; sessionVersion: number }) {
    const sid = randomUUID();
    const token = jwt.sign({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, sessionVersion: user.sessionVersion, sid }, ENV.JWT_SECRET, { expiresIn: ENV.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    const expiresAt = new Date(decoded.exp! * 1000);
    await writeTransaction(async tx => {
      await tx.authSession.create({ data: { id: sid, userId: user.id, sessionVersion: user.sessionVersion, expiresAt } });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    });
    return token;
  }

  // Existing signed tokens keep their original expiry and become revocable too.
  // A digest identifies the token without storing the bearer credential.
  static async validate(token: string, decoded: jwt.JwtPayload, user: { id: string; sessionVersion: number }) {
    const sid = typeof decoded.sid === 'string' ? decoded.sid : 'legacy-' + createHash('sha256').update(token).digest('hex');
    let session = await prisma.authSession.findUnique({ where: { id: sid } });
    if (!session && !decoded.sid) {
      session = await writeTransaction(tx => tx.authSession.upsert({ where: { id: sid }, create: { id: sid, userId: user.id, sessionVersion: user.sessionVersion, expiresAt: new Date(decoded.exp ? decoded.exp * 1000 : Date.now() + 3600000) }, update: {} }));
    }
    if (!session || session.userId !== user.id || session.sessionVersion !== user.sessionVersion || session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError('La sesión fue revocada. Inicie sesión nuevamente');
    return { id: sid, expiresAt: session.expiresAt.getTime() };
  }

  static async revoke(id: string, userId: string) {
    const result = await writeTransaction(tx => tx.authSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } }));
    return result.count > 0;
  }
}
