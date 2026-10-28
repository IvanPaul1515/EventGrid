import { z } from 'zod';

export const CreateScheduleItemSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio'),
  speakerName: z.string().optional().nullable(),
  speakerBio: z.string().optional().nullable(),
  speakerCompany: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
  day: z.string().default(''),
  speakerIds: z.array(z.string().uuid()).max(20).optional(),
  startTime: z.union([z.literal(''),z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)]).default(''),
  endTime: z.union([z.literal(''),z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)]).default(''),
  category: z.string().optional().nullable(),
  status: z.enum(['CONFIRMED', 'RESCHEDULED', 'CANCELLED']).default('CONFIRMED'),
  description: z.string().optional().nullable(),
  order: z.number().int().optional().default(0),
  isKeynote: z.boolean().optional().default(false),
  isDemo: z.boolean().optional().default(false),
  visibility: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED']).optional().default('PUBLISHED'),
  publishAt: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  announcementText: z.string().optional().nullable(),
});

export const UpdateScheduleItemSchema = CreateScheduleItemSchema.partial();

export const QueryScheduleSchema = z.object({
  day: z.string().optional(),
  room: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  search: z.string().optional(),
  includeDrafts: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
  visibility: z.string().optional(),
  isDemo: z.preprocess((val) => (val === 'true' ? true : val === 'false' ? false : undefined), z.boolean().optional()),
});

export const UpdateSchedulePdfSchema = z.object({
  pdfUrl: z.string().min(1, 'La URL o ruta del PDF es obligatoria'),
});

export const PublishKeynoteSchema = z.object({
  action: z.string().optional(),
  publishOnly: z.boolean().optional().default(false),
  sendNow: z.boolean().optional().default(false),
  targetGroup: z.enum(['ALL', 'ATTENDED', 'NOT_ATTENDED', 'PAID', 'COURTESY', 'CONFIRMED']).default('ALL'),
  customSubject: z.string().optional().nullable(),
  customMessage: z.string().optional().nullable(),
  mode: z.enum(['REAL', 'SIMULATION']).default('REAL'),
  scheduledFor: z.string().optional().nullable(),
  schedulePublicationAt: z.string().optional().nullable(),
  scheduleNotificationAt: z.string().optional().nullable(),
});

export const NotifyScheduleChangeSchema = z.object({
  changeLogId: z.string().optional().nullable(),
  scheduleItemId: z.string().optional().nullable(),
  action: z.string().optional(),
  targetGroup: z.enum(['ALL', 'ATTENDED', 'NOT_ATTENDED', 'PAID', 'COURTESY', 'CONFIRMED']).default('ALL'),
  customSubject: z.string().optional().nullable(),
  customMessage: z.string().optional().nullable(),
  customNote: z.string().optional().nullable(),
  changesSummary: z.any().optional(),
  mode: z.enum(['REAL', 'SIMULATION']).default('REAL'),
  scheduledFor: z.string().optional().nullable(),
  scheduleAt: z.string().optional().nullable(),
});

export const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'El título del anuncio es obligatorio').optional(),
  subject: z.string().optional(),
  message: z.string().min(1, 'El mensaje del anuncio es obligatorio'),
  action: z.string().optional(),
  priority: z.string().optional(),
  scheduleItemId: z.string().uuid().optional().nullable(),
  targetGroup: z.enum(['ALL', 'ATTENDED', 'NOT_ATTENDED', 'PAID', 'COURTESY', 'CONFIRMED']).default('ALL'),
  mode: z.enum(['REAL', 'SIMULATION']).default('REAL'),
  scheduledFor: z.string().optional().nullable(),
  scheduleAt: z.string().optional().nullable(),
});

export type CreateScheduleItemInput = z.infer<typeof CreateScheduleItemSchema>;
export type UpdateScheduleItemInput = z.infer<typeof UpdateScheduleItemSchema>;
export type QueryScheduleInput = z.infer<typeof QueryScheduleSchema>;
export type UpdateSchedulePdfInput = z.infer<typeof UpdateSchedulePdfSchema>;
export type PublishKeynoteInput = z.infer<typeof PublishKeynoteSchema>;
export type NotifyScheduleChangeInput = z.infer<typeof NotifyScheduleChangeSchema>;
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementSchema>;
