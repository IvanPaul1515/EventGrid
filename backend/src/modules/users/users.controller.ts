import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service.js';
import { CreateUserSchema, UpdateUserSchema, QueryUsersSchema, ResetPasswordSchema } from './users.dto.js';

export class UsersController {
  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = QueryUsersSchema.parse(req.query);
      const result = await UsersService.listUsers(parsed, req.user?.assignedEventId);

      return res.status(200).json({
        status: 'success',
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UsersService.getUserById(req.params.id);

      return res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateUserSchema.parse({ ...req.body, assignedEventId: req.eventId });
      const actorUserId = req.user?.id;
      const result = await UsersService.createUser(parsed, actorUserId);

      return res.status(201).json({
        status: 'success',
        message: 'Usuario creado exitosamente',
        data: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateUserSchema.parse(req.body);
      const actorUserId = req.user?.id;
      const updated = await UsersService.updateUser(req.params.id, parsed, actorUserId);

      return res.status(200).json({
        status: 'success',
        message: 'Usuario actualizado exitosamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async toggleStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUserId = req.user?.id;
      const updated = await UsersService.toggleUserStatus(req.params.id, actorUserId);

      return res.status(200).json({
        status: 'success',
        message: `Usuario ${updated.isActive ? 'activado' : 'desactivado'} exitosamente`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = req.body ? ResetPasswordSchema.parse(req.body) : undefined;
      const actorUserId = req.user?.id;
      const result = await UsersService.resetPassword(req.params.id, parsed, actorUserId);

      return res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUserId = req.user?.id;
      const result = await UsersService.deleteUser(req.params.id, actorUserId);

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.user,
      });
    } catch (error) {
      next(error);
    }
  }
}
