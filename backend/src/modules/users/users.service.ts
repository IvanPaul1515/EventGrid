import {writeTransaction} from '../../utils/writeTransaction.js';
import { updateUserSafely } from './userSafety.js';
import {serializeCapabilities} from './operator-policy.js';
import { InvitationsService } from './invitations.service.js';
import crypto from 'crypto';
import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors.js';
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
  static async listUsers(query: QueryUsersInput, assignedScope?: string | null) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = assignedScope ? { assignedEventId: assignedScope } : {};

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
          role: true, scannerOnly: true, operationalPermissions:true,
          assignedEventId: true,
        accountStatus: true,
        staffArea: true,
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

    const staffMembers = await prisma.staffMember.findMany({ where: { userId: { in: users.map(user => user.id) }, ...(assignedScope ? { eventId: assignedScope } : {}) }, select: { id: true, userId: true, eventId: true, firstName: true, lastName: true } });
    return {
      users: await InvitationsService.withStatus(users.map(user => ({ ...user, staffMembers: staffMembers.filter(member => member.userId === user.id).map(({ userId, ...member }) => member) }))),
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
        role: true, scannerOnly: true, operationalPermissions:true,
        assignedEventId: true,
        accountStatus: true,
        staffArea: true,
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
    if(input.scannerOnly && (input.role !== 'OPERATOR' || !input.assignedEventId)) throw new BadRequestError('Escáner QR requiere base Operador y edición asignada.');
    await this.validateAssignment(input.assignedEventId);
    const existing = (await prisma.user.findMany({ select: { email: true } })).some(user => user.email.trim().toLowerCase() === input.email);

    if (existing) {
      throw new BadRequestError('Ya existe un usuario registrado con este correo electrónico.');
    }

    // An unusable marker is not a password or credential. Only token activation sets a bcrypt hash.
    const passwordHash = 'pending-activation:' + crypto.randomUUID();

    const user = await writeTransaction(async tx=>{
      const actor=actorUserId?await tx.user.findUnique({where:{id:actorUserId}}):null;
      if(!actor?.isActive||actor.scannerOnly||actor.role!=='ADMIN'||actor.accountStatus==='PENDING'||actor.assignedEventId&&actor.assignedEventId!==input.assignedEventId)throw new ForbiddenError('Se requiere un administrador vigente de la edición.');
      const user = await tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        scannerOnly: input.scannerOnly,
        operationalPermissions:serializeCapabilities(input.role,input.scannerOnly,input.operatorProfile,input.operationalPermissions),
        assignedEventId: input.assignedEventId,
        isActive: false,
        accountStatus: 'PENDING',
        staffArea: input.staffArea,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true, scannerOnly: true, operationalPermissions:true,
        assignedEventId: true,
        accountStatus: true,
        staffArea: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auditoría
    await tx.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: 'USER_CREATE',
        entity: 'USER',
        entityId: user.id,
        changes: JSON.stringify({
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          operationalPermissions:user.operationalPermissions,
          isActive: user.isActive,
          accountStatus: 'PENDING',
        }),
      },
    });

      return user;
    });

    await InvitationsService.prepare(user.id);
    return { user };
  }

  /**
   * Actualizar datos básicos o rol de un usuario
   */
  static async updateUser(id: string, input: UpdateUserInput, actorUserId?: string) {
    const {operatorProfile,operationalPermissions,...patch}=input;
    const existing=await prisma.user.findUnique({where:{id}});
    if(!existing)throw new NotFoundError('Usuario no encontrado');
    const permissions=operatorProfile!==undefined||operationalPermissions!==undefined?{operationalPermissions:serializeCapabilities(input.role||existing.role,input.scannerOnly??existing.scannerOnly,operatorProfile,operationalPermissions)}:{};
    return updateUserSafely(id, {...patch,...permissions}, actorUserId, 'UPDATE');
  }

  /**
   * Alternar estado activo / inactivo de una cuenta
   */
  static async toggleUserStatus(id: string, actorUserId?: string) {
    const user = await prisma.user.findUnique({where:{id}});
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return updateUserSafely(id, {isActive:!user.isActive}, actorUserId, user.isActive?'DEACTIVATE':'REACTIVATE');
  }

  /**
   * Preparar acceso por invitación, sin modificar credenciales
   */
  static async resetPassword(id: string, input?: ResetPasswordInput, actorUserId?: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Usuario no encontrado');
    await InvitationsService.prepare(id);
    return { message: 'Invitación preparada. Seleccione la cuenta y confirme Enviar invitaciones para autorizar su envío.' };

  }

  /**
   * Eliminar cuenta de usuario
   */
  static async deleteUser(id: string, actorUserId?: string) {
    if (id === actorUserId) throw new BadRequestError('No puedes desactivar tu propia cuenta conectada.');
    const user=await updateUserSafely(id,{isActive:false},actorUserId,'DEACTIVATE');
    return {user,message:'Usuario desactivado. Su identidad e historial se conservan.'};
  }
}
