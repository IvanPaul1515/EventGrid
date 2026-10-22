import { z } from 'zod';

export const SponsorTypeEnum = z.enum(['SPONSOR', 'COLLABORATOR']);
export const ContributionTypeEnum = z.enum(['MONETARY', 'IN_KIND', 'MIXED']);
export const SponsorStatusEnum = z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
export const SponsorPaymentMethodEnum = z.enum(['TRANSFER', 'CHECK', 'CASH', 'CREDIT_CARD', 'OTHER']);

export const CreateSponsorSchema = z.object({
  eventId: z.string().uuid('ID de edición inválido').optional(),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  type: SponsorTypeEnum.default('SPONSOR'),
  category: z.string().trim().max(100).optional().nullable(),
  contactName: z.string().trim().max(150).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  contactEmail: z.string().trim().email('Correo de contacto inválido').optional().nullable().or(z.literal('')),
  logoUrl: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  contributionType: ContributionTypeEnum.default('MONETARY'),
  inKindDescription: z.string().trim().max(2000).optional().nullable(),
  committedAmount: z.coerce.number().min(0, 'El monto comprometido no puede ser negativo').default(0),
  commitmentDate: z.coerce.date().optional(),
  status: SponsorStatusEnum.optional(),
});

export const UpdateSponsorSchema = CreateSponsorSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const CreatePaymentSchema = z.object({
  amount: z.coerce.number().positive('El monto del pago debe ser mayor que cero'),
  paymentDate: z.coerce.date().default(() => new Date()),
  paymentMethod: SponsorPaymentMethodEnum.default('TRANSFER'),
  reference: z.string().trim().max(100).optional().nullable(),
  receiptNumber: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const AnnullPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'El motivo de la anulación debe tener al menos 3 caracteres'),
});

export const QuerySponsorsSchema = z.object({
  search: z.string().optional(),
  category: z.string().trim().max(100).optional(),
  type: z.enum(['ALL', 'SPONSOR', 'COLLABORATOR']).default('ALL'),
  status: z.enum(['ALL', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']).default('ALL'),
  contributionType: z.enum(['ALL', 'MONETARY', 'IN_KIND', 'MIXED']).default('ALL'),
  includeArchived: z.preprocess((val) => val === true || val === 'true' || val === 1 || val === '1', z.boolean()).default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateSponsorInput = z.infer<typeof CreateSponsorSchema>;
export type UpdateSponsorInput = z.infer<typeof UpdateSponsorSchema>;
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type AnnullPaymentInput = z.infer<typeof AnnullPaymentSchema>;
export type QuerySponsorsInput = z.infer<typeof QuerySponsorsSchema>;
