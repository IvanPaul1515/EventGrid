import { z } from 'zod';

export const CheckInSchema = z.object({
  registrationId: z.string().uuid('ID de inscripción inválido'),
  tshirtSize: z.string().optional(), // Talla de camiseta registrada en check-in
});

export const RevertAttendanceSchema = z.object({
  registrationId: z.string().uuid('ID de inscripción inválido'),
  reason: z.string().min(3, 'Debe especificar el motivo de la reversión (mínimo 3 caracteres)'),
});

export const SearchAttendanceQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'ATTENDED', 'PENDING']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type CheckInInput = z.infer<typeof CheckInSchema>;
export type RevertAttendanceInput = z.infer<typeof RevertAttendanceSchema>;
export type SearchAttendanceQuery = z.infer<typeof SearchAttendanceQuerySchema>;
