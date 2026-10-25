import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().trim().email('Correo electrónico inválido').toLowerCase(),
  staffArea: z.string().trim().max(100).nullable().optional(),
  assignedEventId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'),
  isActive: z.boolean().default(true),
});

export const UpdateUserSchema = z.object({
  staffArea: z.string().trim().max(100).nullable().optional(),
  assignedEventId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim().optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

export const ResetPasswordSchema = z.object({
});

export const QueryUsersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER', 'ALL']).default('ALL'),
  isActive: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type QueryUsersInput = z.infer<typeof QueryUsersSchema>;
