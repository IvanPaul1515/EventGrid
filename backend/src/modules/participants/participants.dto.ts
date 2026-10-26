import { z } from 'zod';

export const CreateRegistrationSchema = z.object({
  firstName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().min(2, 'El apellido debe tener al menos 2 caracteres'),
  documentId: z.string().optional().nullable(),
  email: z.string().email('Debe ser un correo electrónico válido'),
  phone: z.string().optional().nullable(),
  alternatePhone: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  numberChangeReason: z.string().trim().min(3).max(500).optional(),
  responsibleChangeReason: z.string().trim().min(3).max(500).optional(),
  commercialUserId: z.string().uuid().optional().nullable(),
  ticketTypeId: z.string().optional().nullable(),
  ticketPrice: z.number().finite().min(0).optional().nullable(),
  amountPaid: z.number().finite().min(0).optional().nullable(),
  balanceDue: z.number().finite().min(0).optional().nullable(),
  totalAmount: z.number().finite().min(0, 'El monto no puede ser negativo').default(0),
  isVerified: z.boolean().default(false),
  isCourtesy: z.boolean().default(false),
  courtesyAuthorizedBy: z.string().optional().nullable(),
  courtesyReason: z.string().optional().nullable(),
  isDemo: z.boolean().default(false),
  paymentMethodId: z.string().optional().nullable(),
  salesResponsibleId: z.string().optional().nullable(),
  saleTimestamp: z.string().or(z.date()).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).default('PENDING'),
  customFields: z.record(z.any()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const UpdateRegistrationSchema = CreateRegistrationSchema.partial();

export const ListParticipantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  paymentMethodId: z.string().optional(),
  ticketTypeId: z.string().optional(),
  salesResponsibleId: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'ATTENDED']).optional(),
  isVerified: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  isCourtesy: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy: z.enum(['registrationNumber', 'fullName', 'email', 'totalAmount', 'ticketPrice', 'amountPaid', 'balanceDue', 'saleTimestamp', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const OnsiteSaleSchema = z.object({
  participantId: z.string().optional().nullable(),
  firstName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  lastName: z.string().min(2, 'El apellido debe tener al menos 2 caracteres').optional(),
  email: z.string().email('Debe ser un correo electrónico válido').optional(),
  documentId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  alternatePhone: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  ticketTypeId: z.string().min(1, 'Debe seleccionar un tipo de entrada'),
  paymentMethodId: z.string().optional().nullable(),
  amountReceived: z.number().finite().min(0, 'El monto recibido no puede ser negativo').default(0),
  amountPaid: z.number().finite().min(0, 'El monto a abonar no puede ser negativo').optional(),
  notes: z.string().optional().nullable(),
  courtesyAuthorizedBy: z.string().optional().nullable(),
  courtesyReason: z.string().optional().nullable(),
});

export const RecordPaymentSchema = z.object({
  amount: z.number().finite().positive('El monto del abono debe ser mayor a 0'),
  paymentMethodId: z.string().min(1, 'Debe seleccionar el método de pago'),
  notes: z.string().optional().nullable(),
});

export const CancelRegistrationSchema = z.object({
  reason: z.string().min(3, 'Debe especificar el motivo de la cancelación'),
});

export const ReactivateRegistrationSchema = z.object({
  reason: z.string().min(3, 'Debe especificar el motivo de la reactivación'),
});

export const AssignCourtesySchema = z.object({
  authorizedBy: z.string().min(2, 'Debe indicar quién autoriza la cortesía'),
  reason: z.string().min(2, 'Debe indicar el motivo de la cortesía'),
});

export type CreateRegistrationInput = z.infer<typeof CreateRegistrationSchema>;
export type UpdateRegistrationInput = z.infer<typeof UpdateRegistrationSchema>;
export type ListParticipantsQueryInput = z.infer<typeof ListParticipantsQuerySchema>;
export type OnsiteSaleInput = z.infer<typeof OnsiteSaleSchema>;
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;
export type CancelRegistrationInput = z.infer<typeof CancelRegistrationSchema>;
export type ReactivateRegistrationInput = z.infer<typeof ReactivateRegistrationSchema>;
export type AssignCourtesyInput = z.infer<typeof AssignCourtesySchema>;
