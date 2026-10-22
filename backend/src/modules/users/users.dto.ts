import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email('Correo electrónico inválido').toLowerCase().trim(),
  assignedEventId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
  isActive: z.boolean().default(true),
});

export const UpdateUserSchema = z.object({
  assignedEventId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim().optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

export const ResetPasswordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
});

export const QueryUsersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER', 'ALL']).default('ALL'),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type QueryUsersInput = z.infer<typeof QueryUsersSchema>;
