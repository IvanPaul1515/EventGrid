import { RealtimeService } from '../realtime/realtime.service.js';
import { prisma } from '../../config/db.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import * as XLSX from 'xlsx';
import { SearchAttendanceQuery } from './attendance.dto.js';
import { participantNameIds } from '../../utils/participantSearch.js';

export class AttendanceService {
  /**
   * Obtiene los contadores de asistencia en tiempo real para la edición activa
   */
  static async getCounters(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoFilter = !event?.settings?.demoModeEnabled ? { isDemo: false } : {};

    const [totalRegistrations, attendedCount] = await Promise.all([
      prisma.registration.count({ where: { eventId, ...isDemoFilter } }),
      prisma.registration.count({ where: { eventId, attended: true, ...isDemoFilter } }),
    ]);

    const pendingCount = totalRegistrations - attendedCount;

    return {
      totalRegistrations,
      attendedCount,
      pendingCount,
    };
  }

  /**
   * Búsqueda rápida universal de participantes y listado de asistencia
   */
  static async searchAndList(eventId: string, query: SearchAttendanceQuery) {
    const { search, status = 'ALL', page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoFilter = !event?.settings?.demoModeEnabled ? { isDemo: false } : {};

    const where: any = { eventId, ...isDemoFilter };

    // Filtro por estado de asistencia
    if (status === 'ATTENDED') {
      where.attended = true;
    } else if (status === 'PENDING') {
      where.attended = false;
    }

    // Búsqueda rápida multi-campo
    if (search && search.trim()) {
      let term = search.trim();
      if (term.includes('/t/')) {
        const parts = term.split('/t/');
        term = parts[parts.length - 1];
      }
      const digits = term.replace(/\D/g, '');
      const orClauses: any[] = [
        { participantId: { in: await participantNameIds(prisma, eventId, term) } },
        { registrationNumber: { contains: term } },
        { qrCode: { contains: term } },
        { participant: { firstName: { contains: term } } },
        { participant: { lastName: { contains: term } } },
        { participant: { fullName: { contains: term } } },
        { participant: { email: { contains: term } } },
        { participant: { documentId: { contains: term } } },
        { participant: { phone: { contains: term } } },
        { participant: { alternatePhone: { contains: term } } },
        { participant: { institution: { contains: term } } },
      ];
      if (digits.length >= 4) {
        if (digits.length === 11) {
          const formattedCedula = `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10, 11)}`;
          orClauses.push({ participant: { documentId: { contains: formattedCedula } } });
        } else if (digits.length === 10) {
          const formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
          const paddedCedula = `0${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9, 10)}`;
          orClauses.push({ participant: { phone: { contains: formattedPhone } } });
          orClauses.push({ participant: { documentId: { contains: paddedCedula } } });
        }
      }
      where.OR = orClauses;
    }

    const [total, data, counters] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          // Primero los que acaban de llegar (si están asistidos), luego por fecha de inscripción
          { attendedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: { select: { id: true, name: true } },
          attendedByUser: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.getCounters(eventId),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      counters,
    };
  }

  /**
   * Registrar asistencia física (Check-in)
   */
  static async checkIn(
    eventId: string,
    registrationId: string,
    operatorUserId: string,
    tshirtSize?: string,
    tshirtDelivered?: boolean
  ) {
    // QA-06: Validar que la talla pertenezca a la edición
    const validTshirtSize = tshirtSize ? await InventoryService.validateSize(eventId, tshirtSize) : null;

    // Buscar la inscripción en la edición activa
    const registration = await prisma.registration.findFirst({
      where: {
        id: registrationId,
        eventId,
      },
      include: {
        participant: true,
        attendedByUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    const now = new Date();

    if (registration.status === 'CANCELLED') {
      await prisma.auditLog.create({
        data: {
          userId: operatorUserId,
          action: 'ATTENDANCE_CHECKIN',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'CHECK_IN',
            result: 'REJECTED',
            reason: 'Inscripción en estado Cancelado',
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            attemptedAt: now.toISOString(),
          }),
        },
      }).catch(() => {});

      throw new BadRequestError('No se puede registrar asistencia de una inscripción cancelada.');
    }

    // Prevención inicial contra registros duplicados
    if (registration.attended) {
      const arrivedTime = registration.attendedAt
        ? new Date(registration.attendedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'hora desconocida';
      const registrar = registration.attendedByUser?.fullName || 'otro operador';

      await prisma.auditLog.create({
        data: {
          userId: operatorUserId,
          action: 'ATTENDANCE_CHECKIN',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'CHECK_IN',
            result: 'REJECTED',
            reason: `Asistencia ya registrada a las ${arrivedTime} por ${registrar}`,
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            attemptedAt: now.toISOString(),
          }),
        },
      }).catch(() => {});

      throw new BadRequestError(
        `ASISTENCIA YA REGISTRADA: ${registration.participant.fullName} ya ingresó al evento a las ${arrivedTime} (Registrado por: ${registrar}).`
      );
    }

    const shouldDeliver = Boolean(tshirtDelivered === true && validTshirtSize);

    // QA-01, QA-02, QA-03: Ejecución atómica y condicional en transacción interactiva
    const updatedRegistration = await prisma.$transaction(async (tx) => {
      let inventoryItem: any = null;

      if (shouldDeliver && validTshirtSize) {
        inventoryItem = await tx.tshirtInventory.findUnique({
          where: { eventId_size: { eventId, size: validTshirtSize } },
        });

        // QA-03: No permitir entrega si no existe inventario registrado
        if (!inventoryItem || !inventoryItem.isActive) {
          throw new BadRequestError(
            `INVENTARIO NO ENCONTRADO: No existe inventario configurado o activo para la talla "${validTshirtSize}". Puede confirmar la asistencia dejando la entrega pendiente.`
          );
        }

        // QA-02 / Fase 3: Validación atómica de existencias respetando reservas del staff
        const availableForParticipants = inventoryItem.initialQuantity - inventoryItem.deliveredQuantity - inventoryItem.staffReservedQuantity;
        if (availableForParticipants <= 0) {
          throw new BadRequestError(
            `TALLA AGOTADA: No quedan camisetas disponibles en talla "${validTshirtSize}" para participantes (reservas de staff protegidas). Puede confirmar la asistencia dejando la entrega pendiente.`
          );
        }

        const invUpdate = await tx.tshirtInventory.updateMany({
          where: {
            id: inventoryItem.id,
            initialQuantity: inventoryItem.initialQuantity,
            deliveredQuantity: inventoryItem.deliveredQuantity,
            staffReservedQuantity: inventoryItem.staffReservedQuantity,
            staffDeliveredQuantity: inventoryItem.staffDeliveredQuantity,
            isActive: true,
          },
          data: { deliveredQuantity: inventoryItem.deliveredQuantity + 1 },
        });

        if (invUpdate.count === 0) {
          throw new BadRequestError(
            `CONCURRENCIA: La disponibilidad para la talla "${validTshirtSize}" cambió durante la operación. Por favor intente nuevamente.`
          );
        }
      }

      // QA-01: Actualización condicional atómica. Solo actualiza si attended === false.
      // QA-05: Se preserva status (no se convierte PENDING en CONFIRMED automáticamente).
      const regUpdate = await tx.registration.updateMany({
        where: {
          id: registrationId,
          eventId,
          attended: false,
          status: { not: 'CANCELLED' },
        },
        data: {
          attended: true,
          attendedAt: now,
          attendedByUserId: operatorUserId,
          updatedByUserId: operatorUserId,
          ...(validTshirtSize ? {
            tshirtSize: validTshirtSize,
            tshirtSizeUpdatedAt: now,
            tshirtSizeUpdatedByUserId: operatorUserId,
          } : {}),
          ...(shouldDeliver ? {
            tshirtDelivered: true,
            tshirtDeliveredAt: now,
            tshirtDeliveredByUserId: operatorUserId,
          } : {
            tshirtDelivered: false,
          }),
        },
      });

      if (regUpdate.count === 0) {
        const current = await tx.registration.findUnique({
          where: { id: registrationId },
          include: { participant: true, attendedByUser: true },
        });

        if (!current) {
          throw new NotFoundError('Inscripción no encontrada.');
        }

        if (current.attended) {
          const arrivedTime = current.attendedAt
            ? new Date(current.attendedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'hora desconocida';
          const registrar = current.attendedByUser?.fullName || 'otro operador';
          throw new BadRequestError(
            `ASISTENCIA YA REGISTRADA: ${current.participant.fullName} ya ingresó al evento a las ${arrivedTime} (Registrado por: ${registrar}).`
          );
        }

        if (current.status === 'CANCELLED') {
          throw new BadRequestError('No se puede registrar asistencia de una inscripción cancelada.');
        }

        throw new BadRequestError('No se pudo registrar la asistencia debido a una operación concurrente.');
      }

      await tx.attendanceLog.create({
        data: {
          registrationId,
          userId: operatorUserId,
          action: 'CHECK_IN',
          timestamp: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: operatorUserId,
          action: 'ATTENDANCE_CHECKIN',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'CHECK_IN',
            result: 'SUCCESS',
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            tshirtSize: validTshirtSize || null,
            tshirtDelivered: shouldDeliver,
            inventoryDeducted: shouldDeliver ? 1 : 0,
            deliveryPending: Boolean(validTshirtSize && !shouldDeliver),
            attendedAt: now.toISOString(),
          }) as any,
        },
      });

      const updated = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: { select: { id: true, name: true } },
          attendedByUser: { select: { id: true, fullName: true, email: true } },
        },
      });

      return updated!;
    });

    const counters = await this.getCounters(eventId);

    RealtimeService.emit(eventId, {
      type: 'CHECK_IN_CONFIRMED',
      data: {
        registrationId,
        attended: true,
        attendedAt: updatedRegistration.attendedAt,
        attendedByUserId: operatorUserId,
        attendedByName: updatedRegistration.attendedByUser?.fullName || 'Operador',
        attendedByEmail: updatedRegistration.attendedByUser?.email || '',
        tshirtSize: updatedRegistration.tshirtSize,
        tshirtDelivered: updatedRegistration.tshirtDelivered,
        counters,
        registration: updatedRegistration,
      },
    });

    return {
      registration: updatedRegistration,
      counters,
      message: `¡Bienvenido(a), ${registration.participant.fullName}! Asistencia confirmada exitosamente.`,
    };
  }

  static async revertAttendance(eventId: string, registrationId: string, adminUserId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Debe especificar un motivo justificado para revertir la asistencia');
    }

    const registration = await prisma.registration.findFirst({
      where: {
        id: registrationId,
        eventId,
      },
      include: {
        participant: true,
        attendedByUser: { select: { id: true, fullName: true } },
      },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if (!registration.attended) {
      throw new BadRequestError('El participante no tiene una asistencia registrada para revertir');
    }

    const now = new Date();

    const [updatedRegistration] = await prisma.$transaction([
      prisma.registration.update({
        where: { id: registrationId },
        data: {
          attended: false,
          attendedAt: null,
          attendedByUserId: null,
          updatedByUserId: adminUserId,
        },
        include: {
          participant: true,
          paymentMethod: { select: { id: true, name: true } },
          attendedByUser: true,
        },
      }),
      prisma.attendanceLog.create({
        data: {
          registrationId,
          userId: adminUserId,
          action: 'REVERT',
          reason: reason.trim(),
          timestamp: now,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'ATTENDANCE_REVERT',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'CHECK_IN_REVERT',
            result: 'SUCCESS',
            reason: reason.trim(),
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            tshirtDeliveredRetained: Boolean((registration as any).tshirtDelivered),
            tshirtSize: registration.tshirtSize,
            revertedAt: now.toISOString(),
            previousAttendedAt: registration.attendedAt?.toISOString() || null,
            previousAttendedBy: registration.attendedByUser?.fullName || null,
          }) as any,
        },
      }),
    ]);

    const counters = await this.getCounters(eventId);

    RealtimeService.emit(eventId, {
      type: 'ATTENDANCE_REVERTED',
      data: {
        registrationId,
        attended: false,
        attendedAt: null,
        attendedByUserId: null,
        attendedByName: null,
        counters,
        registration: updatedRegistration,
      },
    });

    return {
      registration: updatedRegistration,
      counters,
      message: `Asistencia de ${registration.participant.fullName} revertida correctamente.`,
    };
  }

  /**
   * Exportar lista de asistencia a archivo Excel (.xlsx)
   */
  static async exportAttendance(eventId: string, status?: string, search?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoFilter = !event?.settings?.demoModeEnabled ? { isDemo: false } : {};
    const where: any = { eventId, ...isDemoFilter };

    if (status === 'ATTENDED') where.attended = true;
    else if (status === 'PENDING') where.attended = false;

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { participantId: { in: await participantNameIds(prisma, eventId, term) } },
        { registrationNumber: { contains: term } },
        { participant: { firstName: { contains: term } } },
        { participant: { lastName: { contains: term } } },
        { participant: { fullName: { contains: term } } },
        { participant: { email: { contains: term } } },
        { participant: { documentId: { contains: term } } },
      ];
    }

    const registrations = await prisma.registration.findMany({
      where,
      orderBy: [
        { attended: 'desc' },
        { attendedAt: 'desc' },
        { registrationNumber: 'asc' },
      ],
      include: {
        participant: true,
        paymentMethod: true,
        attendedByUser: { select: { fullName: true } },
      },
    });

    const exportRows = registrations.map((r) => ({
      'No. Registro': r.registrationNumber,
      'Nombres y Apellidos': r.participant.fullName,
      'Cédula / Documento': r.participant.documentId || 'No indicado',
      'Correo Electrónico': r.participant.email,
      'Teléfono': r.participant.phone || '',
      'Tel. Alterno': r.participant.alternatePhone || '',
      'Forma de Pago': r.paymentMethod?.name || 'No registrada',
      'Es Cortesía': r.isCourtesy ? 'Sí (RD$ 0.00)' : 'No',
      'Estado Asistencia': r.attended ? 'Asistió' : 'No ha llegado',
      'Fecha y Hora de Entrada': r.attendedAt
        ? new Date(r.attendedAt).toLocaleString('es-DO')
        : 'Pendiente',
      'Operador de Entrada': r.attendedByUser?.fullName || (r.attended ? 'Sistema' : '—'),
      'Es Demo': r.isDemo ? 'Sí' : 'No',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia BarCamp');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * Resumen diario de ventas presenciales y cobros en recepción
   */
  static async getDailySales(eventId: string, targetDate?: string) {
    const baseDate = targetDate ? new Date(targetDate) : new Date();
    const startOfDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoFilter = !event?.settings?.demoModeEnabled ? { isDemo: false } : {};

    const [paymentsToday, registrationsToday] = await Promise.all([
      prisma.payment.findMany({
        where: {
          registration: { eventId, ...isDemoFilter },
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          paymentMethod: true,
          receivedByUser: { select: { id: true, fullName: true, email: true } },
          registration: {
            include: {
              participant: true,
              ticketType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.registration.findMany({
        where: {
          eventId,
          ...isDemoFilter,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
        },
      }),
    ]);

    let totalAmount = 0;
    const byMethod: Record<string, { count: number; total: number }> = {};

    for (const p of paymentsToday) {
      const amount = Number(p.amount);
      totalAmount += amount;
      const methodName = p.paymentMethod?.name || 'Efectivo';
      if (!byMethod[methodName]) {
        byMethod[methodName] = { count: 0, total: 0 };
      }
      byMethod[methodName].count++;
      byMethod[methodName].total += amount;
    }

    const onsiteSalesCount = registrationsToday.filter((r) => r.source === 'ONSITE_SALE').length;

    return {
      date: startOfDay.toISOString().slice(0, 10),
      totalSalesCount: registrationsToday.length,
      onsiteSalesCount,
      totalPaymentsCount: paymentsToday.length,
      totalAmount,
      byMethod,
      recentPayments: paymentsToday.slice(0, 10).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.paymentMethod?.name || 'Efectivo',
        participantName: p.registration.participant.fullName,
        ticket: p.registration.registrationNumber,
        time: p.createdAt,
        operator: p.receivedByUser?.fullName || 'Sistema',
      })),
    };
  }
}
