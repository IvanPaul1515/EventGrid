import { z } from 'zod';

export const CreateEventSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  slug: z.string().min(3, 'El slug identificador debe tener al menos 3 caracteres'),
  year: z.number().int().min(2010).max(2100),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  venue: z.string().default('PUCMM — Campus Santiago de los Caballeros, RD'),
  description: z.string().optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('PLANNING'),
  isDefault: z.boolean().default(false),
});

export const UpdateEventSchema = CreateEventSchema.partial();

export const UpdateEventSettingsSchema = z.object({
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un código hexadecimal válido'),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un código hexadecimal válido'),
  backgroundColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un código hexadecimal válido').optional(),
  themeMode: z.enum(['dark', 'light', 'system']).default('dark'),
  currencyCode: z.string().default('DOP'),
  currencySymbol: z.string().default('RD$'),
  logoUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  subtitle: z.string().default('PUCMM — Santiago de los Caballeros, República Dominicana'),
  registrationPrefix: z.string().default('BC-'),
});

export const CloneEventSchema = z.object({
  name: z.string().min(3, 'El nombre de la nueva edición es requerido'),
  slug: z.string().min(3, 'El slug identificador es requerido'),
  year: z.number().int().min(2020).max(2100),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  venue: z.string().default('PUCMM — Campus Santiago de los Caballeros, RD'),
  description: z.string().optional(),
  copySettings: z.boolean().default(true),
  copyPaymentMethods: z.boolean().default(true),
  copySalesResponsibles: z.boolean().default(true),
  copyCustomFields: z.boolean().default(true),
});
