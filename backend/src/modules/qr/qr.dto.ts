import { z } from 'zod';

export const ScanQrSchema = z.object({
  codeOrToken: z.string().min(1, 'El código o token QR es requerido'),
  eventId: z.string().min(1, 'El identificador del evento es requerido'),
});

export const RevokeQrSchema = z.object({
  reason: z.string().optional(),
});

export type ScanQrInput = z.infer<typeof ScanQrSchema>;
export type RevokeQrInput = z.infer<typeof RevokeQrSchema>;
