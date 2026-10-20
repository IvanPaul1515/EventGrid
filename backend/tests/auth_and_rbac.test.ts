import { describe, it, expect } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.JWT_SECRET = 'test_jwt_secret_barcamp';

import request from 'supertest';
import { app } from '../src/app.js';

describe('Fase 1: API Health, Autenticación y Seguridad RBAC', () => {
  it('Debe responder en el endpoint de diagnóstico /health con nombre EventGrid', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBeOneOf([200, 503]);
    expect(res.body).toHaveProperty('service', 'eventgrid-backend-api');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('database');
  });

  it('Debe rechazar solicitudes a rutas protegidas sin token de autenticación (401 Unauthorized)', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.message.toLowerCase()).toContain('no autorizado');
  });

  it('Debe rechazar el acceso al perfil /auth/me sin sesión activa (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('Debe validar que las credenciales de login tengan formato válido (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'correo-invalido', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body).toHaveProperty('errors');
  });
});
