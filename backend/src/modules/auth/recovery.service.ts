import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { BadRequestError } from '../../utils/errors.js';
import { CommunicationsService } from '../communications/communications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
export const recoveryMessage = 'Si la cuenta puede recuperar acceso y el correo está habilitado, recibirás un enlace. Si no llega, consulta con la administración.';
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export class RecoveryService {
    static async request(email: string) {
        let id: string | undefined;
        let transport: any;
        try {
            const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
            if (!user?.isActive || user.accountStatus !== 'ACTIVE')
                return;
            const config = await CommunicationsService.getRawConfig(user.assignedEventId);
            if (!config?.isEnabled)
                return; // No token or mail job is queued for later activation.
            const origin = process.env.FRONTEND_URL || ENV.CORS_ORIGIN.find(s => s.startsWith('https://') || (ENV.NODE_ENV !== 'production' && s.startsWith('http://localhost')));
            if (!origin)
                return;
            const url = new URL('/reset-password', origin);
            if (url.protocol !== 'https:' && ENV.NODE_ENV === 'production')
                return;
            const token = crypto.randomBytes(32).toString('base64url');
            const minutes = Math.max(5, Math.min(60, Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 15));
            const record = await writeTransaction(async (tx) => {
                const recent = await tx.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60000) }, usedAt: null, revokedAt: null } });
                if (recent)
                    return null;
                await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
                return tx.passwordReset.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + minutes * 60000) } });
            });
            if (!record)
                return;
            id = record.id;
            url.hash = 'token=' + encodeURIComponent(token);
            transport = CommunicationsService.createTransporter(config);
            const sent = await transport.sendMail({ from: `"${config.fromName}" <${config.fromEmail}>`, to: user.email, subject: 'Recuperar acceso a EventGrid', text: `Establece una nueva contraseña: ${url.toString()}\nEnlace de un solo uso, válido durante ${minutes} minutos.` });
            const accepted = Array.isArray(sent.accepted) && sent.accepted.some((s: any) => String(s).toLowerCase() === user.email.toLowerCase());
            await prisma.passwordReset.update({ where: { id }, data: { status: accepted ? 'ACCEPTED_BY_PROVIDER' : 'UNCONFIRMED' } });
        }
        catch {
            if (id)
                await prisma.passwordReset.update({ where: { id }, data: { status: 'UNCONFIRMED' } }).catch(() => { });
        }
        finally {
            try {
                transport?.close?.();
            }
            catch { }
        }
    }
    static async validate(token: string) {
        const item = await prisma.passwordReset.findUnique({ where: { tokenHash: hash(token) }, include: { user: { select: { isActive: true, accountStatus: true } } } });
        if (!item || item.usedAt || item.revokedAt || !item.user.isActive || item.user.accountStatus !== 'ACTIVE')
            throw new BadRequestError('Solicitud inválida o ya utilizada.');
        if (item.expiresAt <= new Date())
            throw new BadRequestError('El enlace ha vencido. Solicita uno nuevo.');
        return item;
    }
    static async confirm(token: string, password: string) {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = await writeTransaction(async (tx) => {
            const item = await tx.passwordReset.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
            if (!item || item.usedAt || item.revokedAt || item.expiresAt <= new Date() || !item.user.isActive || item.user.accountStatus !== 'ACTIVE')
                throw new BadRequestError('Enlace inválido, vencido o ya utilizado.');
            const claim = await tx.passwordReset.updateMany({ where: { id: item.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), status: 'USED' } });
            if (claim.count !== 1)
                throw new BadRequestError('El enlace ya fue utilizado.');
            await tx.user.update({ where: { id: item.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
            await tx.passwordReset.updateMany({ where: { userId: item.userId, id: { not: item.id }, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
            const changes = { action: 'PASSWORD_RECOVERED', sessionsRevoked: true };
            await tx.auditLog.create({ data: { userId: item.userId, entity: 'USER', entityId: item.userId, action: 'USER_UPDATE', changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
            return item.userId;
        });
        RealtimeService.notifyAccess(userId);
    }
}
