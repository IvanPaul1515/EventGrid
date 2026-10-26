import { z } from 'zod';
export const ImportDefaultsSchema = z.object({ externalPlatform: z.string().trim().min(1).max(100).optional(), salesResponsible: z.string().trim().max(120).optional(), buyerName: z.string().trim().max(160).optional(), paymentMethod: z.string().trim().max(100).optional() }).default({});

export const AnalyzeFileSchema = z.object({
  fileBase64: z.string().min(1, 'El contenido del archivo en base64 es requerido'),
  fileName: z.string().min(1, 'El nombre del archivo es requerido'),
  sheetName: z.string().optional(),
  headerRowIndex: z.number().int().min(0).optional(),
});

export const ValidateImportSchema = z.object({
  fileName: z.string().min(1),
  sheetName: z.string().min(1),
  rows: z.array(z.record(z.any())).min(1, 'El archivo no contiene filas para importar'),
  batchDefaults: ImportDefaultsSchema,
  columnMapping: z.record(z.string()), // e.g. { "Nombres": "firstName", "EMail": "email" }
});

export const ExecuteImportSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().default(0),
  sheetName: z.string().min(1),
  rows: z.array(z.record(z.any())).min(1),
  batchDefaults: ImportDefaultsSchema,
  columnMapping: z.record(z.string()),
  conflictStrategy: z.enum(['SKIP', 'UPDATE', 'ONLY_NEW']).default('SKIP'),
});

export type AnalyzeFileInput = z.infer<typeof AnalyzeFileSchema>;
export type ValidateImportInput = z.infer<typeof ValidateImportSchema>;
export type ExecuteImportInput = z.infer<typeof ExecuteImportSchema>;
