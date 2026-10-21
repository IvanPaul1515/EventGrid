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

// Esquemas para T-shirts del Staff (Parte 2)
export const ReserveStaffTshirtsSchema = z.object({
  size: z.string().min(1, 'La talla es requerida'),
  reservedQuantity: z.number().int().min(0, 'La cantidad de reserva debe ser 0 o superior'),
});

export const DeliverStaffTshirtsSchema = z.object({
  size: z.string().min(1, 'La talla es requerida'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1').default(1),
  recipientName: z.string().optional(),
  notes: z.string().optional(),
});

export const ReleaseStaffTshirtsSchema = z.object({
  size: z.string().min(1, 'La talla es requerida'),
  quantityToRelease: z.number().int().min(1, 'La cantidad a liberar debe ser al menos 1'),
});

export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;
export type DeliverTshirtInput = z.infer<typeof DeliverTshirtSchema>;
export type ReturnTshirtInput = z.infer<typeof ReturnTshirtSchema>;
export type ReserveStaffTshirtsInput = z.infer<typeof ReserveStaffTshirtsSchema>;
export type DeliverStaffTshirtsInput = z.infer<typeof DeliverStaffTshirtsSchema>;
export type ReleaseStaffTshirtsInput = z.infer<typeof ReleaseStaffTshirtsSchema>;
