import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // Manejo de errores de validación Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: req.originalUrl.includes('/communications/')
        ? `Solicitud de correo inválida: ${err.errors.map(e => e.message).join('; ')}`
        : 'Error de validación en los datos enviados',
      errors: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Manejo de errores operativos controlados (AppError)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      details: err.details || null,
    });
  }

  // Errores no controlados
  console.error('💥 Error inesperado:', err);
  return res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}
