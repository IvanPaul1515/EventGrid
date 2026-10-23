import { z } from 'zod';

export const UpdateSmtpConfigSchema = z.object({
  eventId: z.string().optional().nullable(),
  host: z.string().min(1, 'El servidor SMTP es requerido'),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  fromEmail: z.string().email('Correo de remitente inválido'),
  fromName: z.string().min(1, 'Nombre de remitente requerido'),
  replyToEmail: z.string().email().optional().nullable().or(z.literal('')),
  isEnabled: z.boolean().default(false),
});

export const TestEmailSchema = z
  .object({
    eventId: z.string().optional().nullable(),
    recipientEmail: z.string().email('Correo de destinatario inválido').optional(),
    testRecipient: z.string().email('Correo de destinatario inválido').optional(),
  })
  .refine((data) => Boolean(data.recipientEmail || data.testRecipient), {
    message: 'Debe especificar el correo del destinatario de prueba',
    path: ['recipientEmail'],
  });

export const SendEmailSchema = z.object({
  eventId: z.string().optional().nullable(),
  registrationId: z.string({ required_error: 'Debe seleccionar un participante.' }).min(1, 'El identificador de inscripción es requerido'),
  templateCode: z.string({ required_error: 'Debe seleccionar una plantilla.' }).min(1, 'El código de plantilla es requerido'),
  customSubject: z.string().optional().nullable(),
  customBodyHtml: z.string().optional().nullable(),
  customMessage: z.string().optional().nullable(),
  mode: z.enum(['REAL', 'SIMULATION']).optional(),
  simulateOnly: z.boolean().optional(),
  confirmedDemoSending: z.boolean().optional(),
  forceResend: z.boolean().optional(),
  confirmedResend: z.boolean().optional(),
  resendReason: z.string().optional(),
});

export const SendBulkEmailSchema = z.object({
  eventId: z.string().min(1, 'El identificador del evento es requerido'),
  templateCode: z.string().min(1, 'El código de plantilla es requerido'),
  targetGroup: z.enum([
    'ALL',
    'CONFIRMED',
    'PAID',
    'PENDING',
    'PENDING_PAYMENT',
    'PARTIAL',
    'COURTESY',
    'ATTENDED',
    'NOT_ATTENDED',
    'SELECTED',
    'PAID_WITHOUT_CONFIRMATION',
    'COURTESY_WITHOUT_CONFIRMATION',
    'WITHOUT_DIGITAL_TICKET',
    'FAILED_COMMUNICATION',
    'WITHOUT_REMINDER',
    'ALREADY_RECEIVED',
  ]),
  selectedRegistrationIds: z.array(z.string()).optional(),
  ticketTypeId: z.string().optional().nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  customSubject: z.string().optional().nullable(),
  customBodyHtml: z.string().optional().nullable(),
  customMessage: z.string().optional().nullable(),
  mode: z.enum(['REAL', 'SIMULATION']).optional(),
  simulateOnly: z.boolean().optional(),
  confirmedDemoSending: z.boolean().optional(),
  excludeAlreadyNotified: z.boolean().optional(),
  forceResend: z.boolean().optional(),
});

export const ValidateRecipientsSchema = z.object({
  eventId: z.string().min(1, 'El identificador del evento es requerido'),
  templateCode: z.string().optional(),
  targetGroup: z.enum([
    'ALL',
    'CONFIRMED',
    'PAID',
    'PENDING',
    'PENDING_PAYMENT',
    'PARTIAL',
    'COURTESY',
    'ATTENDED',
    'NOT_ATTENDED',
    'SELECTED',
    'PAID_WITHOUT_CONFIRMATION',
    'COURTESY_WITHOUT_CONFIRMATION',
    'WITHOUT_DIGITAL_TICKET',
    'FAILED_COMMUNICATION',
    'WITHOUT_REMINDER',
    'ALREADY_RECEIVED',
  ]),
  selectedRegistrationIds: z.array(z.string()).optional(),
  ticketTypeId: z.string().optional().nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  excludeAlreadyNotified: z.boolean().optional(),
});

export const EmailPreviewSchema = z.object({
  eventId: z.string().optional().nullable(),
  registrationId: z.string().optional().nullable(),
  sampleType: z.enum(['MOCK', 'PARTICIPANT']).optional(),
  templateCode: z.string().min(1, 'El código de plantilla es requerido'),
  customSubject: z.string().optional().nullable(),
  customBodyHtml: z.string().optional().nullable(),
  customMessage: z.string().optional().nullable(),
});

export const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
  subject: z.string().min(1, 'El asunto es requerido'),
  bodyHtml: z.string().min(1, 'El contenido HTML es requerido'),
  bodyText: z.string().optional().nullable(),
});

export const QueryLogsSchema = z.object({
  eventId: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
  registrationId: z.string().optional().nullable(),
  recipientEmail: z.string().optional().nullable(),
  templateCode: z.string().optional().nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  sentByUserId: z.string().optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export type UpdateSmtpConfigInput = z.infer<typeof UpdateSmtpConfigSchema>;
export type TestEmailInput = z.infer<typeof TestEmailSchema>;
export type SendEmailInput = z.infer<typeof SendEmailSchema>;
export type SendBulkEmailInput = z.infer<typeof SendBulkEmailSchema>;
export type ValidateRecipientsInput = z.infer<typeof ValidateRecipientsSchema>;
export type EmailPreviewInput = z.infer<typeof EmailPreviewSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type QueryLogsInput = z.infer<typeof QueryLogsSchema>;

export const RetryUncertainBatchSchema = z.object({
  confirmedDuplicateRisk: z.boolean().refine((val) => val === true, {
    message: 'Debe confirmar explícitamente que acepta el riesgo de enviar correos duplicados',
  }),
  reason: z.string().min(5, 'Debe especificar el motivo justificado para el reenvío de correos inciertos (mínimo 5 caracteres)'),
});

export type RetryUncertainBatchInput = z.infer<typeof RetryUncertainBatchSchema>;
