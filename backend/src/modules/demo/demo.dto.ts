import { z } from 'zod';

export const ToggleDemoSchema = z.object({
  eventId: z.string().uuid().or(z.string().min(1)),
  enabled: z.boolean(),
});

export const GenerateDemoSchema = z.object({
  eventId: z.string().uuid().or(z.string().min(1)),
  count: z.number().int().min(1).max(100).default(15),
});

export const ResetDemoSchema = z.object({
  eventId: z.string().uuid().or(z.string().min(1)),
});

export type ToggleDemoInput = z.infer<typeof ToggleDemoSchema>;
export type GenerateDemoInput = z.infer<typeof GenerateDemoSchema>;
export type ResetDemoInput = z.infer<typeof ResetDemoSchema>;
