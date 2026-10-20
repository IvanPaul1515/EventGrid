import { z } from 'zod';

export const UpdateSmtpConfigSchema = z.object({
  eventId: z.string().optional().nullable(),
  host: z.string().min(1, 'El servidor SMTP es requerido'),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  fromEmail: z.string().email('Correo de remitente inválido'),
  fromName: z.string().min(1, 'Nombre de remitente requerido'),
  replyToEmail: z.string().email().optional().nullable(),
  isEnabled: z.boolean().default(false),
});

export const TestEmailSchema = z.object({
  eventId: z.string().optional().nullable(),
  recipientEmail: z.string().email('Correo de destinatario inválido'),
});

export const SendEmailSchema = z.object({
  eventId: z.string().min(1, 'El identificador del evento es requerido'),
  registrationId: z.string().min(1, 'El identificador de inscripción es requerido'),
  templateCode: z.string().min(1, 'El código de plantilla es requerido'),
  customMessage: z.string().optional().nullable(),
});

export const SendBulkEmailSchema = z.object({
  eventId: z.string().min(1, 'El identificador del evento es requerido'),
  templateCode: z.string().min(1, 'El código de plantilla es requerido'),
  targetGroup: z.enum(['ALL', 'CONFIRMED', 'PENDING_PAYMENT', 'ATTENDED']),
  customMessage: z.string().optional().nullable(),
});

export const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
  subject: z.string().min(1, 'El asunto es requerido'),
  bodyHtml: z.string().min(1, 'El contenido HTML es requerido'),
  bodyText: z.string().optional().nullable(),
});

export type UpdateSmtpConfigInput = z.infer<typeof UpdateSmtpConfigSchema>;
export type TestEmailInput = z.infer<typeof TestEmailSchema>;
export type SendEmailInput = z.infer<typeof SendEmailSchema>;
export type SendBulkEmailInput = z.infer<typeof SendBulkEmailSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
