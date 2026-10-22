import { z } from 'zod';

export const CreateScheduleItemSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  speakerName: z.string().optional().nullable(),
  speakerBio: z.string().optional().nullable(),
  speakerCompany: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
  day: z.string().default('Día 1'),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora de inicio inválido (HH:MM)'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora de fin inválido (HH:MM)'),
  category: z.string().optional().nullable(),
  status: z.enum(['CONFIRMED', 'RESCHEDULED', 'CANCELLED']).default('CONFIRMED'),
  description: z.string().optional().nullable(),
  order: z.number().int().optional().default(0),
});

export const UpdateScheduleItemSchema = CreateScheduleItemSchema.partial();

export const QueryScheduleSchema = z.object({
  day: z.string().optional(),
  room: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  search: z.string().optional(),
});

export const UpdateSchedulePdfSchema = z.object({
  pdfUrl: z.string().min(1, 'La URL o ruta del PDF es obligatoria'),
});

export type CreateScheduleItemInput = z.infer<typeof CreateScheduleItemSchema>;
export type UpdateScheduleItemInput = z.infer<typeof UpdateScheduleItemSchema>;
export type QueryScheduleInput = z.infer<typeof QueryScheduleSchema>;
export type UpdateSchedulePdfInput = z.infer<typeof UpdateSchedulePdfSchema>;
