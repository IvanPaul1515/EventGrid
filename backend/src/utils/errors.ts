export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado. Se requiere iniciar sesión') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado. Permisos insuficientes') {
    super(message, 403);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Solicitud incorrecta', details?: any) {
    super(message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicto con los datos existentes', details?: any) {
    super(message, 409, details);
  }
}
