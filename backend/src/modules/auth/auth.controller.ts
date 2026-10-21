import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { LoginSchema, ChangePasswordSchema, UpdateProfileSchema } from './auth.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { clearFailedLogin, recordFailedLogin } from '../../middleware/rateLimiter.js';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    let attemptedEmail: string | undefined = undefined;
    try {
      const validated = LoginSchema.parse(req.body);
      attemptedEmail = validated.email;
      const result = await AuthService.login(validated.email, validated.password);

      // Limpiar intentos fallidos acumulados
      clearFailedLogin(req, validated.email);

      // Guardar token en cookie HttpOnly segura
      res.cookie('barcamp_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      });

      // Registrar auditoría de inicio de sesión
      await recordAuditLog({
        req,
        action: 'LOGIN',
        entity: 'USER',
        entityId: result.user.id,
        changes: { email: result.user.email },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Sesión iniciada correctamente',
        data: result,
      });
    } catch (error) {
      // Registrar intento fallido para rate-limiting y auditoría segura
      recordFailedLogin(req, attemptedEmail || (req.body?.email ? String(req.body.email) : undefined));
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AuthService.getProfile(req.user!.id);
      return res.status(200).json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie('barcamp_token');
    return res.status(200).json({
      status: 'success',
      message: 'Sesión cerrada correctamente',
    });
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = ChangePasswordSchema.parse(req.body);
      const result = await AuthService.changePassword(
        req.user!.id,
        validated.currentPassword,
        validated.newPassword
      );

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'USER',
        entityId: req.user!.id,
        changes: { action: 'password_change' },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}
