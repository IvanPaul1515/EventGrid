import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../src/middleware/rbac.js';
import { Request, Response } from 'express';

describe('Middleware de Control de Acceso Basado en Roles (RBAC)', () => {
  it('Debe llamar next con error si el usuario no está autenticado', () => {
    const middleware = requireRole(['ADMIN']);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it('Debe denegar acceso (403) si el usuario tiene rol VIEWER y se requiere ADMIN', () => {
    const middleware = requireRole(['ADMIN']);
    const req = {
      user: { id: '1', email: 'consulta@barcamp.org.do', fullName: 'Auditor', role: 'VIEWER' },
    } as any;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('Acceso denegado');
  });

  it('Debe permitir el paso (next sin error) si el usuario tiene el rol permitido', () => {
    const middleware = requireRole(['ADMIN', 'OPERATOR']);
    const req = {
      user: { id: '2', email: 'operador@barcamp.org.do', fullName: 'Operador', role: 'OPERATOR' },
    } as any;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(); // Sin argumentos indica éxito
  });
});
