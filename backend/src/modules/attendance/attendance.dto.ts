import { z } from 'zod';

export const CheckInSchema = z.object({
  confirmed: z.literal(true, { errorMap: () => ({ message: 'Debe confirmar expresamente el ingreso definitivo.' }) }),
  registrationId: z.string().uuid('ID de inscripción inválido'),
  tshirtSize: z.string().optional(), // Talla de camiseta registrada en check-in
  tshirtDelivered: z.boolean().optional(), // Si la camiseta fue entregada físicamente
});

export const RevertAttendanceSchema = z.object({
  registrationId: z.string().uuid('ID de inscripción inválido'),
  reason: z.string().min(3, 'Debe especificar el motivo de la reversión (mínimo 3 caracteres)'),
});

const eventDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;},'Fecha inválida');
export const SearchAttendanceQuerySchema = z.object({
  dateFrom:eventDate.optional(),
  dateTo:eventDate.optional(),
  tshirtDelivery:z.enum(['PENDING','NOT_DELIVERED','DELIVERED']).optional(),
  search: z.string().optional(),
  status: z.enum(['ALL', 'ATTENDED', 'PENDING']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type CheckInInput = z.infer<typeof CheckInSchema>;
export type RevertAttendanceInput = z.infer<typeof RevertAttendanceSchema>;
export type SearchAttendanceQuery = z.infer<typeof SearchAttendanceQuerySchema>;
