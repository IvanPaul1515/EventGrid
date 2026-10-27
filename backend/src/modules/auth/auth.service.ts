import { DeviceSessionService } from './device-session.service.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.js';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../../utils/errors.js';

export class AuthService {
  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedError('Credenciales incorrectas');
    }

    if (!user.isActive || user.accountStatus === 'PENDING') {
      throw new UnauthorizedError('La cuenta de usuario se encuentra desactivada');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Credenciales incorrectas');
    }

    const token = await DeviceSessionService.issue(user);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        scannerOnly: user.scannerOnly,
        assignedEventId: user.assignedEventId,
        lastLoginAt: user.lastLoginAt,
      },
    };
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        scannerOnly: true,
        assignedEventId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    return user;
  }

  static async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestError('La contraseña actual es incorrecta');
    }

    const newHash = await bcrypt.hash(newPass, 10);
    await writeTransaction(async tx=>{
      await tx.user.update({where:{id:userId},data:{passwordHash:newHash,sessionVersion:{increment:1}}});
      await tx.passwordReset.updateMany({where:{userId,usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
    });
    RealtimeService.notifyAccess(userId);

    return { message: 'Contraseña actualizada correctamente' };
  }
}
