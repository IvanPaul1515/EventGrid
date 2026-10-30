import { z } from 'zod';

export const LoginSchema = z.object({
  scannerMode:z.boolean().optional(),
  email: z.string().trim().min(1).max(254),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Debe ser un correo electrónico válido'),
});
