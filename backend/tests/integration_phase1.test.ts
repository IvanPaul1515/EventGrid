import { describe, it, expect } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.JWT_SECRET = 'test_jwt_secret_barcamp';

import request from 'supertest';
import { app } from '../src/app.js';

describe('Validación de la Fase 1: Flujo Completo de Integración', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;

  it('1. Debe iniciar sesión exitosamente como ADMINISTRADOR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@barcamp.org.do',
        password: 'BarCamp2026!Admin',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe('ADMIN');
    adminToken = res.body.data.token;
  });

  it('2. Debe iniciar sesión exitosamente como OPERADOR y como CONSULTA', async () => {
    const resOp = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    expect(resOp.status).toBe(200);
    expect(resOp.body.data.user.role).toBe('OPERATOR');
    operatorToken = resOp.data?.token || resOp.body.data.token;

    const resView = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    expect(resView.status).toBe(200);
    expect(resView.body.data.user.role).toBe('VIEWER');
    viewerToken = resView.body.data.token;
  });

  it('3. Debe rechazar credenciales incorrectas (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'PasswordErronea' });

    expect(res.status).toBe(401);
  });

  it('4. Debe obtener el perfil /auth/me con token válido', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('admin@barcamp.org.do');
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('5. Debe listar las ediciones registradas (2026, 2025, 2024)', async () => {
    const res = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    const event2026 = res.body.data.find((e: any) => e.year === 2026);
    expect(event2026).toBeDefined();
    expect(event2026.status).toBe('ACTIVE');
    activeEventId = event2026.id;
  });

  it('6. Debe obtener el detalle de la edición activa y sus ajustes de diseño', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${activeEventId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.settings).toBeDefined();
    expect(res.body.data.settings.primaryColor).toBe('#e11d48'); // Rojo BarCamp
    expect(res.body.data.settings.currencyCode).toBe('DOP');
  });

  it('7. El rol VIEWER no debe tener permiso para modificar ajustes (403 Forbidden)', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${activeEventId}/settings`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        primaryColor: '#ff0000',
        secondaryColor: '#990000',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Acceso denegado');
  });

  it('8. El ADMINISTRADOR puede actualizar la configuración visual de la edición', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${activeEventId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        primaryColor: '#e11d48',
        secondaryColor: '#881337',
        backgroundColor: '#09090b',
        subtitle: 'PUCMM — Campus Santiago de los Caballeros',
        registrationPrefix: 'BC26-',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('9. Debe clonar la configuración de una edición para preparar BarCamp 2029 sin copiar participantes', async () => {
    const uniqueSlug = `barcamp-rd-clone-${Date.now()}`;
    const res = await request(app)
      .post(`/api/v1/events/${activeEventId}/clone`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'BarCamp RD 2029',
        slug: uniqueSlug,
        year: 2029,
        startDate: '2029-11-04T08:00:00.000Z',
        endDate: '2029-11-04T18:00:00.000Z',
        venue: 'PUCMM — Campus Santiago de los Caballeros, RD',
        copySettings: true,
        copyPaymentMethods: true,
        copySalesResponsibles: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('BarCamp RD 2029');
    expect(res.body.data.year).toBe(2029);
    expect(res.body.data.settings).toBeDefined();
  });
});
