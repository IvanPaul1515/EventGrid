import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { CreateUserInput, UpdateUserInput, QueryUsersInput, ResetPasswordInput } from './users.dto.js';

export class UsersService {
  private static async validateAssignment(id?: string | null) {
    if (id && !await prisma.event.findUnique({ where: { id }, select: { id: true } })) {
      throw new BadRequestError('Edición asignada no encontrada');
    }
  }
  /**
   * Listar usuarios con búsqueda, filtros por rol y estado, y paginación
   */
  static async listUsers(query: QueryUsersInput) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.role && query.role !== 'ALL') {
      where.role = query.role;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term } },
        { email: { contains: term } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          assignedEventId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obtener un usuario por su ID
   */
  static async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        assignedEventId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Crear un nuevo usuario administrativo u operador
   */
  static async createUser(input: CreateUserInput, actorUserId?: string) {
    await this.validateAssignment(input.assignedEventId);
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new BadRequestError('Ya existe un usuario registrado con este correo electrónico.');
    }

    // Si no se suministra contraseña, generar contraseña temporal segura de un solo uso
    const temporaryPassword = input.password || `${crypto.randomBytes(6).toString('hex')}Aa1!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        assignedEventId: input.assignedEventId,
        isActive: input.isActive ?? true,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        assignedEventId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auditoría
    await prisma.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_CREATE',
        entity: 'USER',
        entityId: user.id,
        changes: JSON.stringify({
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
          temporaryPasswordGenerated: !input.password,
        }),
      },
    }).catch(() => {});

    return {
      user,
      temporaryPassword: input.password ? undefined : temporaryPassword,
    };
  }

  /**
   * Actualizar datos básicos o rol de un usuario
   */
  static async updateUser(id: string, input: UpdateUserInput, actorUserId?: string) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    // Protección del último administrador activo
    if (user.role === 'ADMIN' && (input.role && input.role !== 'ADMIN' || input.isActive === false)) {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestError('Acción bloqueada: No se puede demotar ni desactivar al último administrador activo del sistema.');
      }
    }

    await this.validateAssignment(input.assignedEventId);
    const data: any = {};
    if (input.assignedEventId !== undefined) data.assignedEventId = input.assignedEventId;
    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        assignedEventId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auditoría
    await prisma.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_UPDATE',
        entity: 'USER',
        entityId: id,
        changes: JSON.stringify(input),
      },
    }).catch(() => {});

    return updated;
  }

  /**
   * Alternar estado activo / inactivo de una cuenta
   */
  static async toggleUserStatus(id: string, actorUserId?: string) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    const targetStatus = !user.isActive;

    // Si se va a desactivar un administrador, verificar que no sea el último activo
    if (!targetStatus && user.role === 'ADMIN') {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestError('Acción bloqueada: No se puede desactivar al último administrador activo del sistema.');
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: targetStatus },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        assignedEventId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auditoría
    await prisma.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_TOGGLE_STATUS',
        entity: 'USER',
        entityId: id,
        changes: JSON.stringify({ previousStatus: user.isActive, newStatus: targetStatus }),
      },
    }).catch(() => {});

    return updated;
  }

  /**
   * Restablecer acceso mediante contraseña temporal de un solo uso
   */
  static async resetPassword(id: string, input?: ResetPasswordInput, actorUserId?: string) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    const temporaryPassword = input?.password || `${crypto.randomBytes(6).toString('hex')}Aa1!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Auditoría
    await prisma.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_PASSWORD_RESET',
        entity: 'USER',
        entityId: id,
        changes: JSON.stringify({ resetAt: new Date().toISOString() }),
      },
    }).catch(() => {});

    return {
      message: 'Contraseña restablecida exitosamente.',
      temporaryPassword,
    };
  }

  /**
   * Eliminar cuenta de usuario
   */
  static async deleteUser(id: string, actorUserId?: string) {
    if (id === actorUserId) {
      throw new BadRequestError('No puedes eliminar tu propia cuenta de usuario conectada actualmente.');
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    if (user.role === 'ADMIN') {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestError('Acción bloqueada: No se puede eliminar al último administrador activo del sistema.');
      }
    }

    try {
      await prisma.user.delete({
        where: { id },
      });
    } catch (e: any) {
      // Si existen registros vinculados por clave foránea (auditoría, asistencias, etc.), desactivar en lugar de borrar
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        message: 'El usuario tiene registros históricos vinculados. La cuenta fue desactivada de forma segura para preservar la integridad referencial.',
      };
    }

    // Auditoría
    await prisma.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_DELETE',
        entity: 'USER',
        entityId: id,
        changes: JSON.stringify({ email: user.email, fullName: user.fullName }),
      },
    }).catch(() => {});

    return { message: 'Usuario eliminado exitosamente' };
  }
}
