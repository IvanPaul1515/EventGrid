import { z } from 'zod';

export const ScanQrSchema = z.object({
  codeOrToken: z.string().optional(),
  qrToken: z.string().optional(),
  eventId: z.string().optional(),
  activeEventId: z.string().optional(),
}).refine(data => !!(data.codeOrToken || data.qrToken), {
  message: 'El código o token QR es requerido',
  path: ['codeOrToken'],
});

export const RevokeQrSchema = z.object({
  reason: z.string().optional(),
});

export type ScanQrInput = z.infer<typeof ScanQrSchema>;
export type RevokeQrInput = z.infer<typeof RevokeQrSchema>;
