import { z } from 'zod';

export const CreateInventoryItemSchema = z.object({
  size: z.string().min(1, 'El nombre de la talla es obligatorio'),
  initialQuantity: z.number().int().min(0, 'La cantidad inicial debe ser 0 o superior'),
});

export const UpdateInventoryItemSchema = z.object({
  size: z.string().min(1).optional(),
  initialQuantity: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const DeliverTshirtSchema = z.object({
  size: z.string().optional(),
});

export const ReturnTshirtSchema = z.object({
  reason: z.string().min(3, 'Debe especificar un motivo justificado de la devolución'),
});

export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;
export type DeliverTshirtInput = z.infer<typeof DeliverTshirtSchema>;
export type ReturnTshirtInput = z.infer<typeof ReturnTshirtSchema>;
