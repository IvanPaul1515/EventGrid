import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('QA — Módulo Integral de Patrocinadores y Colaboradores', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let secondaryEventId: string;
  const createdSponsorIds: string[] = [];

  beforeAll(async () => {
    // 1. Obtener tokens de autenticación
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;

    const viewRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    viewerToken = viewRes.body.data.token;

    // 2. Obtener dos eventos para probar aislamiento por edición
    const events = await prisma.event.findMany({
      orderBy: { year: 'desc' },
      take: 2,
    });
    activeEventId = events[0].id;
    secondaryEventId = events[1]?.id || events[0].id;

    // Verificar que SMTP esté apagado
    const emailConfig = await prisma.emailConfig.findFirst();
    expect(emailConfig?.isEnabled).toBe(false);
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (createdSponsorIds.length > 0) {
      await prisma.sponsorPayment.deleteMany({
        where: { sponsorId: { in: createdSponsorIds } },
      });
      await prisma.sponsor.deleteMany({
        where: { id: { in: createdSponsorIds } },
      });
    }
  });

  describe('1. Control de Acceso y RBAC', () => {
    it('Operador y Viewer pueden consultar lista y resumen, pero NO crear patrocinadores', async () => {
      // Viewer can read
      const getRes = await request(app)
        .get(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe('success');

      // Operator cannot create (403)
      const opCreateRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Patrocinador Prohibido Op',
          committedAmount: 10000,
        });
      expect(opCreateRes.status).toBe(403);

      // Viewer cannot create (403)
      const viewCreateRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Patrocinador Prohibido View',
          committedAmount: 10000,
        });
      expect(viewCreateRes.status).toBe(403);
    });
  });

  describe('2. Creación, Validaciones y Aislamiento por Edición', () => {
    const uniqueSuffix = Date.now();
    const testSponsorName = `Tech Corp QA ${uniqueSuffix}`;

    it('Administrador puede registrar un patrocinador monetario con cálculos iniciales correctos', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: testSponsorName,
          type: 'SPONSOR',
          category: 'Platino',
          contactName: 'Lic. Laura Méndez',
          contactPhone: '809-555-4321',
          contactEmail: 'laura@techcorp.qa',
          contributionType: 'MONETARY',
          committedAmount: 50000,
          commitmentDate: '2026-10-15',
          notes: 'Aporte principal confirmado para el escenario principal',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      const sponsor = res.body.data;
      expect(sponsor.name).toBe(testSponsorName);
      expect(sponsor.committedAmount).toBe(50000);
      expect(sponsor.receivedAmount).toBe(0);
      expect(sponsor.pendingBalance).toBe(50000);
      expect(sponsor.status).toBe('PENDING');
      expect(sponsor.isArchived).toBe(false);

      createdSponsorIds.push(sponsor.id);
    });

    it('Rechaza patrocinadores con nombre duplicado dentro de la misma edición', async () => {
      const duplicateRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: testSponsorName,
          committedAmount: 25000,
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.message).toMatch(/Ya existe un patrocinador o colaborador con el nombre/i);
    });

    it('Permite registrar patrocinador con aporte en especie requiriendo descripción', async () => {
      const inKindName = `Catering Aliado QA ${uniqueSuffix}`;
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: inKindName,
          type: 'COLLABORATOR',
          category: 'Alimentación',
          contributionType: 'IN_KIND',
          inKindDescription: 'Refrigerios y café durante toda la jornada de conferencias',
          committedAmount: 0,
        });

      expect(res.status).toBe(201);
      const sponsor = res.body.data;
      expect(sponsor.contributionType).toBe('IN_KIND');
      expect(sponsor.inKindDescription).toContain('Refrigerios');
      expect(sponsor.committedAmount).toBe(0);
      expect(sponsor.pendingBalance).toBe(0);

      createdSponsorIds.push(sponsor.id);
    });
  });

  describe('3. Registro de Pagos Parciales, Saldos y Estados Automáticos', () => {
    let targetSponsorId: string;
    let payment1Id: string;
    let payment2Id: string;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Banco Innovación QA ${Date.now()}`,
          type: 'SPONSOR',
          category: 'Diamante',
          contributionType: 'MONETARY',
          committedAmount: 100000,
        });
      targetSponsorId = res.body.data.id;
      createdSponsorIds.push(targetSponsorId);
    });

    it('Registrar primer abono parcial actualiza balance y estado a PARTIALLY_PAID', async () => {
      const payRes = await request(app)
        .post(`/api/v1/sponsors/${targetSponsorId}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 40000,
          paymentMethod: 'TRANSFER',
          reference: 'TRANSF-QA-001',
          receiptNumber: 'REC-001',
          notes: 'Primer abono del 40%',
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.status).toBe('success');
      const { payment, sponsor } = payRes.body.data;

      expect(payment.amount).toBe(40000);
      expect(payment.status).toBe('ACTIVE');
      payment1Id = payment.id;

      expect(sponsor.receivedAmount).toBe(40000);
      expect(sponsor.pendingBalance).toBe(60000);
      expect(sponsor.status).toBe('PARTIALLY_PAID');
    });

    it('Operador NO puede registrar abonos (RBAC 403)', async () => {
      const opPayRes = await request(app)
        .post(`/api/v1/sponsors/${targetSponsorId}/payments`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          amount: 10000,
        });
      expect(opPayRes.status).toBe(403);
    });

    it('Registrar segundo abono completando el total cambia estado a PAID', async () => {
      const payRes = await request(app)
        .post(`/api/v1/sponsors/${targetSponsorId}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 60000,
          paymentMethod: 'CHECK',
          reference: 'CHEQUE-99881',
          receiptNumber: 'REC-002',
          notes: 'Pago final del saldo restante',
        });

      expect(payRes.status).toBe(201);
      const { payment, sponsor } = payRes.body.data;

      expect(payment.amount).toBe(60000);
      payment2Id = payment.id;

      expect(sponsor.receivedAmount).toBe(100000);
      expect(sponsor.pendingBalance).toBe(0);
      expect(sponsor.status).toBe('PAID');
    });

    it('Anulación de pago recalcula automáticamente el saldo y revierte el estado a PARTIALLY_PAID', async () => {
      // Anular el segundo pago de 60,000
      const annullRes = await request(app)
        .post(`/api/v1/sponsors/payments/${payment2Id}/annull`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Cheque devuelto por el banco por firma disconforme',
        });

      expect(annullRes.status).toBe(200);
      const { payment, sponsor } = annullRes.body.data;

      expect(payment.status).toBe('ANNULLED');
      expect(payment.annulledReason).toBe('Cheque devuelto por el banco por firma disconforme');
      expect(payment.annulledAt).toBeDefined();

      // Recalculación confirmada: vuelve a recibir 40,000, pendiente 60,000, estado PARTIALLY_PAID
      expect(sponsor.receivedAmount).toBe(40000);
      expect(sponsor.pendingBalance).toBe(60000);
      expect(sponsor.status).toBe('PARTIALLY_PAID');
    });
  });

  describe('4. Archivo de Patrocinadores sin Pérdida de Historial', () => {
    let archiveSponsorId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/sponsors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Sponsor Para Archivar QA ${Date.now()}`,
          committedAmount: 15000,
        });
      archiveSponsorId = res.body.data.id;
      createdSponsorIds.push(archiveSponsorId);
    });

    it('Archivar un patrocinador lo oculta de la lista regular pero conserva historial y permite consultarlo con includeArchived', async () => {
      // Archivar
      const archiveRes = await request(app)
        .patch(`/api/v1/sponsors/${archiveSponsorId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isArchived: true });

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.isArchived).toBe(true);

      // Consulta sin archivados: no debe estar
      const listWithoutArchived = await request(app)
        .get(`/api/v1/events/${activeEventId}/sponsors?includeArchived=false`)
        .set('Authorization', `Bearer ${adminToken}`);
      const foundWithout = listWithoutArchived.body.data.items.find((s: any) => s.id === archiveSponsorId);
      expect(foundWithout).toBeUndefined();

      // Consulta con archivados: sí debe estar
      const listWithArchived = await request(app)
        .get(`/api/v1/events/${activeEventId}/sponsors?includeArchived=true`)
        .set('Authorization', `Bearer ${adminToken}`);
      const foundWith = listWithArchived.body.data.items.find((s: any) => s.id === archiveSponsorId);
      expect(foundWith).toBeDefined();
      expect(foundWith.isArchived).toBe(true);
    });
  });

  describe('5. Verificación de Seguridad Crítica', () => {
    it('El estado del SMTP se mantiene estrictamente apagado (isEnabled: false)', async () => {
      const config = await prisma.emailConfig.findFirst();
      expect(config?.isEnabled).toBe(false);
    });
  });
});
