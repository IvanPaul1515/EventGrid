import { prisma } from '../../config/db.js';
import { NotFoundError } from '../../utils/errors.js';
import { ParticipantsService } from '../participants/participants.service.js';
import crypto from 'crypto';

const DOMINICAN_FIRST_NAMES = [
  'Carlos', 'Ana', 'María', 'José', 'Juan', 'Laura', 'Pedro', 'Rosa',
  'Luis', 'Carmen', 'David', 'Elena', 'Francisco', 'Patricia', 'Miguel',
  'Sofía', 'Manuel', 'Isabel', 'Alejandro', 'Gabriela', 'Rafael', 'Lucía',
];

const DOMINICAN_LAST_NAMES = [
  'Rodríguez', 'Pérez', 'González', 'Martínez', 'García', 'Reyes',
  'Hernández', 'Díaz', 'Morales', 'Jiménez', 'Álvarez', 'Castillo',
  'Romero', 'Santos', 'Cruz', 'Valdez', 'Mejía', 'Guzmán', 'Peña',
];

const DOMINICAN_INSTITUTIONS = [
  'Universidad Central de Tecnología',
  'UASD — Universidad Autónoma de Santo Domingo',
  'INTEC — Instituto Tecnológico de Santo Domingo',
  'UNIBE — Universidad Iberoamericana',
  'ITLA — Instituto Tecnológico de Las Américas',
  'Claro Dominicana',
  'Banco Popular Dominicano',
  'BHD León',
  'Grupo Ramos',
  'Independiente / Freelance',
];

export class DemoService {
  /**
   * Consultar estado y métricas del entorno de demostración
   */
  static async getStatus(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    const [demoRegistrations, realRegistrations, demoParticipants, realParticipants] = await Promise.all([
      prisma.registration.count({ where: { eventId, isDemo: true } }),
      prisma.registration.count({ where: { eventId, isDemo: false } }),
      prisma.participant.count({
        where: {
          isDemo: true,
          registrations: { some: { eventId } },
        },
      }),
      prisma.participant.count({
        where: {
          isDemo: false,
          registrations: { some: { eventId } },
        },
      }),
    ]);

    return {
      eventId,
      eventName: event.name,
      demoModeEnabled: event.settings?.demoModeEnabled ?? false,
      demoCount: demoRegistrations,
      realCount: realRegistrations,
      totalCount: demoRegistrations + realRegistrations,
      counts: {
        demoRegistrations,
        demoParticipants,
        realRegistrations,
        realParticipants,
        totalRegistrations: demoRegistrations + realRegistrations,
      },
    };
  }

  /**
   * Activar o desactivar el modo demostración
   */
  static async toggle(eventId: string, enabled: boolean) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    if (event.settings) {
      await prisma.eventSettings.update({
        where: { eventId },
        data: { demoModeEnabled: enabled },
      });
    } else {
      await prisma.eventSettings.create({
        data: {
          eventId,
          demoModeEnabled: enabled,
        },
      });
    }

    return this.getStatus(eventId);
  }

  /**
   * Generar participantes ficticios con diferentes estados de pago, cortesía y asistencia
   */
  static async generate(eventId: string, count = 15, userId?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        settings: true,
        ticketTypes: true,
        paymentMethods: true,
        salesResponsibles: true,
      },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    const ticketTypes = event.ticketTypes.length > 0
      ? event.ticketTypes
      : [await prisma.ticketType.create({
          data: {
            eventId,
            name: 'General',
            price: 2000.0,
            isActive: true,
          },
        })];

    const paymentMethods = event.paymentMethods.length > 0
      ? event.paymentMethods
      : [await prisma.paymentMethod.create({
          data: {
            eventId,
            name: 'Efectivo',
            isActive: true,
          },
        })];

    const prefix = event.settings?.registrationPrefix || `EV${String(event.year).slice(-2)}-`;
    const regCount = await prisma.registration.count({ where: { eventId } });
    let seq = regCount + 1;

    const createdIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const firstName = DOMINICAN_FIRST_NAMES[Math.floor(Math.random() * DOMINICAN_FIRST_NAMES.length)];
      const lastName = DOMINICAN_LAST_NAMES[Math.floor(Math.random() * DOMINICAN_LAST_NAMES.length)];
      const fullName = `${firstName} ${lastName}`;
      const randomSuffix = Date.now() + '_' + i + '_' + Math.floor(Math.random() * 100000);
      const email = `demo.${firstName.toLowerCase()}.${lastName.toLowerCase()}.${randomSuffix}@eventgrid.demo`;
      const docNum = Math.floor(100000000 + Math.random() * 800000000);
      const documentId = `402-${docNum.toString().slice(0, 7)}-${docNum.toString().slice(7, 8)}`;
      const phone = `809-${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const institution = DOMINICAN_INSTITUTIONS[Math.floor(Math.random() * DOMINICAN_INSTITUTIONS.length)];

      // Crear o buscar participante ficticio
      let participant = await prisma.participant.findFirst({
        where: { email },
      });

      if (!participant) {
        participant = await prisma.participant.create({
          data: {
            firstName,
            lastName,
            fullName,
            email,
            documentId,
            phone,
            institution,
            isDemo: true,
            updatedByUserId: userId,
          },
        });
      }

      const regNum = await ParticipantsService.getNextRegistrationNumber(eventId, event.year, prefix);
      const ticket = ticketTypes[i % ticketTypes.length];
      const pMethod = paymentMethods[i % paymentMethods.length];
      const price = Number(ticket.price);

      // Distribuir escenarios de prueba:
      // 0: Pagado y asistió
      // 1: Pagado pero no ha llegado
      // 2: Cortesía
      // 3: Abono parcial
      // 4: Pendiente
      const scenario = i % 5;
      let isCourtesy = false;
      let ticketPrice = price;
      let amountPaid = price;
      let balanceDue = 0;
      let paymentStatus = 'PAID';
      let regStatus = 'CONFIRMED';
      let attended = false;
      let attendedAt: Date | null = null;
      let courtesyReason: string | null = null;
      let courtesyAuthorizedBy: string | null = null;

      if (scenario === 0) {
        attended = true;
        attendedAt = new Date();
      } else if (scenario === 1) {
        attended = false;
      } else if (scenario === 2) {
        isCourtesy = true;
        ticketPrice = 0;
        amountPaid = 0;
        balanceDue = 0;
        paymentStatus = 'COURTESY';
        courtesyReason = 'Beca / Invitado Especial Demo';
        courtesyAuthorizedBy = 'Comité Organizador Demo';
      } else if (scenario === 3) {
        amountPaid = Math.round(price / 2);
        balanceDue = price - amountPaid;
        paymentStatus = 'PARTIAL';
      } else if (scenario === 4) {
        amountPaid = 0;
        balanceDue = price;
        paymentStatus = 'PENDING';
        regStatus = 'PENDING';
      }

      const qrCode = `eg_qr_${crypto.randomBytes(16).toString('hex')}`;

      const reg = await prisma.registration.create({
        data: {
          eventId,
          participantId: participant.id,
          registrationNumber: regNum,
          source: 'MANUAL',
          ticketTypeId: ticket.id,
          paymentMethodId: pMethod.id,
          ticketPrice,
          amountPaid,
          balanceDue,
          totalAmount: amountPaid,
          isVerified: amountPaid > 0,
          isCourtesy,
          courtesyReason,
          courtesyAuthorizedBy,
          courtesyDate: isCourtesy ? new Date() : null,
          courtesyUserId: isCourtesy ? userId : null,
          isDemo: true,
          status: regStatus as any,
          paymentStatus: paymentStatus as any,
          attended,
          attendedAt,
          attendedByUserId: attended ? userId : null,
          updatedByUserId: userId,
          qrCode,
          qrGeneratedAt: new Date(),
        },
      });

      // Si pagó, crear registro en pagos
      if (amountPaid > 0) {
        await prisma.payment.create({
          data: {
            registrationId: reg.id,
            amount: amountPaid,
            paymentMethodId: pMethod.id,
            notes: 'Pago de demostración simulado',
            receivedByUserId: userId,
          },
        });
      }

      createdIds.push(reg.id);
    }

    return {
      generatedCount: createdIds.length,
      status: await this.getStatus(eventId),
    };
  }

  /**
   * Restablecer y eliminar exclusivamente los registros ficticios del evento
   */
  static async reset(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    // QA-18: Transacción atómica para evitar estados inconsistentes o registros huérfanos
    const result = await prisma.$transaction(async (tx) => {
      // 1. Obtener los IDs de registros demo
      const demoRegs = await tx.registration.findMany({
        where: { eventId, isDemo: true },
        select: { id: true, participantId: true },
      });

      const demoRegIds = demoRegs.map((r) => r.id);
      const participantIds = Array.from(new Set(demoRegs.map((r) => r.participantId)));

      // 2. Eliminar pagos y logs vinculados a registros demo
      if (demoRegIds.length > 0) {
        await tx.payment.deleteMany({
          where: { registrationId: { in: demoRegIds } },
        });
        await tx.attendanceLog.deleteMany({
          where: { registrationId: { in: demoRegIds } },
        });
        await tx.emailLog.deleteMany({
          where: { registrationId: { in: demoRegIds } },
        });
        await tx.registration.deleteMany({
          where: { id: { in: demoRegIds } },
        });
      }

      // 3. Eliminar participantes demo que no tengan ninguna otra inscripción
      if (participantIds.length > 0) {
        for (const pId of participantIds) {
          const remaining = await tx.registration.count({
            where: { participantId: pId },
          });
          if (remaining === 0) {
            await tx.participant.deleteMany({
              where: { id: pId, isDemo: true },
            });
          }
        }
      }

      return {
        deletedRegistrationsCount: demoRegIds.length,
      };
    });

    return {
      deletedRegistrationsCount: result.deletedRegistrationsCount,
      status: await this.getStatus(eventId),
    };
  }
}
