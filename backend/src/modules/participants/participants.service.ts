import { FinanceService,cents } from '../finance/finance.service.js';
import { recordCourtesyRequest } from './courtesy.policy.js';
import { officialTicket, authorizeCourtesy, auditCourtesy } from './registrationPolicy.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { CommunicationsService } from '../communications/communications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { prisma } from '../../config/db.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { participantNameIds } from '../../utils/participantSearch.js';
import {
  CreateRegistrationInput,
  UpdateRegistrationInput,
  ListParticipantsQueryInput,
  OnsiteSaleInput,
  RecordPaymentInput,
  AssignCourtesyInput,
} from './participants.dto.js';
import * as XLSX from 'xlsx';

export class ParticipantsService {
  /**
   * Listar registros de participantes paginados con métricas de estado
   */
  static async list(eventId: string, query: ListParticipantsQueryInput) {
    const {
      page,
      limit,
      search,
      paymentMethodId,
      ticketTypeId,
      salesResponsibleId,
      status,
      isVerified,
      isCourtesy,
      sortBy,
      sortOrder,
    } = query;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    // Filtros dinámicos
    const whereClause: any = { eventId };

    if (!event.settings?.demoModeEnabled) {
      whereClause.isDemo = false;
    }

    if (paymentMethodId) whereClause.paymentMethodId = paymentMethodId;
    if (ticketTypeId) whereClause.ticketTypeId = ticketTypeId;
    if (salesResponsibleId) whereClause.salesResponsibleId = salesResponsibleId;
    if (status) whereClause.status = status;
    if (isVerified !== undefined) whereClause.isVerified = isVerified;
    if (isCourtesy !== undefined) whereClause.isCourtesy = isCourtesy;

    if (search && search.trim() !== '') {
      let s = search.trim();
      if (s.includes('/t/')) {
        const parts = s.split('/t/');
        s = parts[parts.length - 1];
      }
      const digits = s.replace(/\D/g, '');
      const orClauses: any[] = [
        { participantId: { in: await participantNameIds(prisma, eventId, s) } },
        { registrationNumber: { contains: s } },
        { externalReference: { contains: s } },
        { qrCode: { contains: s } },
        { participant: { fullName: { contains: s } } },
        { participant: { firstName: { contains: s } } },
        { participant: { lastName: { contains: s } } },
        { participant: { email: { contains: s } } },
        { participant: { documentId: { contains: s } } },
        { participant: { phone: { contains: s } } },
        { participant: { alternatePhone: { contains: s } } },
        { participant: { institution: { contains: s } } },
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
      whereClause.OR = orClauses;
    }

    let orderBy: any = {};
    if (sortBy === 'fullName') {
      orderBy = { participant: { fullName: sortOrder } };
    } else if (sortBy === 'email') {
      orderBy = { participant: { email: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const skip = (page - 1) * limit;

    const [total, registrations, allEventRegistrations] = await Promise.all([
      prisma.registration.count({ where: whereClause }),
      prisma.registration.findMany({
        where: whereClause,
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
          salesResponsible: true,
          attendedByUser: { select: { id: true, fullName: true, email: true } },
          courtesyUser: { select: { id: true, fullName: true, email: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      // Métricas de resumen de toda la edición
      prisma.registration.findMany({
        where: {
          eventId,
          ...(!event.settings?.demoModeEnabled ? { isDemo: false } : {}),
        },
        select: {
          status: true,
          attended: true,
          isCourtesy: true,
          isVerified: true,
          ticketPrice: true,
          amountPaid: true,
          balanceDue: true,
          totalAmount: true,
          isDemo: true,
        },
      }),
    ]);

    // Calcular KPIs de la edición
    let confirmedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let attendedCount = 0;
    let courtesyCount = 0;
    let demoCount = 0;
    let totalRevenue = 0;
    let verifiedRevenue = 0;
    let totalBalanceDue = 0;

    for (const r of allEventRegistrations) {
      if (r.status === 'CONFIRMED' || (r.status as string) === 'ATTENDED') confirmedCount++;
      else if (r.status === 'PENDING') pendingCount++;
      else if (r.status === 'CANCELLED') cancelledCount++;

      if (r.attended) attendedCount++;
      if (r.isCourtesy) courtesyCount++;
      if (r.isDemo) demoCount++;

      // REGLA CLAVE: Las cortesías tienen monto 0 y NO se suman a los ingresos del evento
      if (!r.isCourtesy && r.status !== 'CANCELLED') {
        const paid = Number(r.amountPaid ?? r.totalAmount ?? 0);
        totalRevenue += paid;
        if (r.isVerified) verifiedRevenue += paid;
        totalBalanceDue += Number(r.balanceDue ?? 0);
      }
    }

    const formatted = registrations.map((r) => {
      let customFields: any = r.customFields;
      if (typeof customFields === 'string') {
        try {
          customFields = JSON.parse(customFields);
        } catch {
          customFields = {};
        }
      }
      return {
        ...r,
        customFields,
      };
    });

    return {
      data: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        totalRegistrations: allEventRegistrations.length,
        confirmedCount,
        pendingCount,
        cancelledCount,
        attendedCount,
        courtesyCount,
        demoCount,
        totalRevenue,
        verifiedRevenue,
        totalBalanceDue,
      },
    };
  }

  /**
   * Obtener detalle completo de un registro (Ficha 360°)
   */
  static async getById(eventId: string, registrationId: string, communicationRole?:string, canReadOtherEditions=true) {
    const registration = await prisma.registration.findFirst({
      where: {
        id: registrationId,
        eventId,
      },
      include: {
        participant: {
          include: {
            updatedByUser: { select: { id: true, fullName: true, email: true } },
          },
        },
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
        attendedByUser: { select: { id: true, fullName: true, email: true } },
        courtesyUser: { select: { id: true, fullName: true, email: true } },
        updatedByUser: { select: { id: true, fullName: true, email: true } },
        payments: {
          include: {
            paymentMethod: true,
            receivedByUser: { select: { id: true, fullName: true, email: true } },
            recordedByUser: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        attendanceLogs: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
        },
        event: {
          include: { settings: true },
        },
      },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición seleccionada');
    }

    const otherRegistrations = canReadOtherEditions ? await prisma.registration.findMany({
      where: {
        participantId: registration.participantId,
        eventId: { not: eventId },
      },
      include: {
        event: {
          include: { settings: true },
        },
        ticketType: true,
        paymentMethod: true,
      },
      orderBy: {
        event: { year: 'desc' },
      },
    }) : [];

    let customFields: any = registration.customFields;
    if (typeof customFields === 'string') {
      try {
        customFields = JSON.parse(customFields);
      } catch {
        customFields = {};
      }
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: registration.id },
          { entityId: registration.participantId },
        ],
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const parsedAuditLogs = auditLogs.map((l) => {
      let ch = l.changes;
      if (typeof ch === 'string') {
        try {
          ch = JSON.parse(ch);
        } catch {
          // Keep as string
        }
      }
      return { ...l, changes: ch };
    });

    const attributionUsers = await prisma.user.findMany({ where: { id: { in: [registration.createdByUserId, registration.commercialUserId].filter((id): id is string => Boolean(id)) } }, select: { id: true, fullName: true } });
    const emailHistory = communicationRole==='VIEWER'?[]:await CommunicationsService.getUnifiedHistoryForRegistration(registration.id,undefined,20,communicationRole==='OPERATOR');

    return {
      ...registration,
      createdByUser: attributionUsers.find(user => user.id === registration.createdByUserId) || null,
      commercialUser: attributionUsers.find(user => user.id === registration.commercialUserId) || null,
      customFields,
      auditLogs: parsedAuditLogs,
      emailHistory,
      editionHistory: otherRegistrations.map((or) => ({
        registrationId: or.id,
        editionId: or.eventId,
        editionName: or.event.name,
        year: or.event.year,
        registrationNumber: or.registrationNumber,
        ticketTypeName: or.ticketType?.name || 'General',
        status: or.status,
        paymentStatus: or.paymentStatus || (or.isCourtesy ? 'COURTESY' : Number(or.balanceDue) === 0 ? 'PAID' : 'PENDING'),
        attended: or.attended,
        isCourtesy: or.isCourtesy,
        totalAmount: Number(or.amountPaid ?? or.totalAmount),
        saleTimestamp: or.saleTimestamp,
        paymentMethodName: or.paymentMethod?.name || (or.isCourtesy ? 'Cortesía' : 'No especificado'),
      })),
    };
  }

  /**
   * Crear nueva inscripción en la edición activa
   */
  static async create(eventId: string, input: CreateRegistrationInput, actorId?: string, request?: { key: string; reason: string; exceptionType?: 'COURTESY' | 'SPONSOR' | 'GUEST' | 'AGREEMENT'; agreementReference?: string }) {
    if ((input.status as string) === 'ATTENDED') throw new BadRequestError('La asistencia solo puede confirmarse mediante check-in autorizado.');
    if (input.status === 'CANCELLED') throw new BadRequestError('Cree el registro vigente y use la cancelación administrativa con motivo e historial.');
    const reservedNumber = await ParticipantsService.getNextRegistrationNumber(eventId);
    return writeTransaction(async tx => {
    const prisma = tx;
    if (request && actorId) {
      const previous = await tx.courtesyRequest.findUnique({ where: { eventId_requestedByUserId_requestKey: { eventId, requestedByUserId: actorId, requestKey: request.key } } });
      if (previous) return tx.registration.findUniqueOrThrow({ where: { id: previous.registrationId }, include: { participant: true, ticketType: true, paymentMethod: true, salesResponsible: true } });
    }
    if ((input.status as string) === 'ATTENDED' || ['attended', 'attendedAt', 'attendedByUserId'].some(key => Object.prototype.hasOwnProperty.call(input, key))) throw new BadRequestError('La asistencia solo puede confirmarse mediante check-in autorizado.');
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true, paymentMethods: true, ticketTypes: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId } }) : null;
    if(input.isDemo&&actor?.role!=='ADMIN')throw new ForbiddenError('Generar datos demo requiere administrador.');
    if ((input.commercialUserId && input.commercialUserId !== actorId) || input.salesResponsibleId) {
      if (actor?.role !== 'ADMIN' || !input.responsibleChangeReason) throw new BadRequestError('Cambiar el responsable comercial requiere administrador y motivo.');
    }
    if (input.commercialUserId && input.commercialUserId !== actorId) {
      const target = await tx.user.findUnique({ where: { id: input.commercialUserId } });
      if (!target?.isActive || (target.assignedEventId && target.assignedEventId !== eventId)) throw new BadRequestError('Responsable fuera de la edición activa.');
    }
    const cleanEmail = input.email.toLowerCase().trim();
    const cleanDoc = input.documentId ? input.documentId.trim() : null;
    const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
    const cleanInstitution = input.institution ? input.institution.trim() : null;

    // 1. Resolver Tipo de Entrada y Precios
    let ticketType = null;
    if (input.ticketTypeId) {
      ticketType = event.ticketTypes.find((t) => t.id === input.ticketTypeId);
      if (!ticketType) throw new BadRequestError('Tarifa fuera de la edición activa.');
    }

    let isCourtesy = input.isCourtesy || false;
    let paymentMethodId = input.paymentMethodId || null;

    if (ticketType && (Number(ticketType.price) === 0)) {
      isCourtesy = true;
    }

    if (paymentMethodId) {
      const pm = event.paymentMethods.find((m) => m.id === paymentMethodId);
      if (!pm) throw new BadRequestError('Método de pago fuera de la edición activa.');
      if (pm && pm.name.toLowerCase().includes('cortes')) {
        isCourtesy = true;
      }
    }

    const approval = isCourtesy ? await authorizeCourtesy(tx, eventId, actorId, input.courtesyReason) : null;
    if (!isCourtesy) {
      ticketType = officialTicket(event.ticketTypes, event.defaultTicketTypeId) || null;
      if (!ticketType) throw new BadRequestError('Configure una tarifa oficial activa antes de registrar participantes.');
    }
    // Regla de cortesía: forma de pago y responsable no aplican (null)
    if (isCourtesy) {
      paymentMethodId = null;
    }

    // Regla Financiera
    let ticketPrice = 0;
    let amountPaid = 0;
    let balanceDue = 0;

    if (isCourtesy) {
      ticketPrice = 0;
      amountPaid = 0;
      balanceDue = 0;
    } else {
      ticketPrice = ticketType ? Number(ticketType.price) : Number(input.ticketPrice ?? input.totalAmount ?? 0);
      amountPaid = input.amountPaid !== undefined ? Number(input.amountPaid) : Number(input.totalAmount ?? 0);
      balanceDue = Math.max(0, ticketPrice - amountPaid);
    }

    // 2. Buscar o crear la Persona física (Participant)
    let participant = null;
    if (cleanDoc) {
      participant = await prisma.participant.findFirst({
        where: { documentId: cleanDoc },
      });
    }
    if (!participant) {
      participant = await prisma.participant.findFirst({
        where: { email: cleanEmail },
      });
    }

    if (participant) {
      participant = await prisma.participant.update({
        where: { id: participant.id },
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          fullName,
          phone: input.phone || participant.phone,
          alternatePhone: input.alternatePhone || participant.alternatePhone,
          documentId: cleanDoc || participant.documentId,
          institution: cleanInstitution || participant.institution,
        },
      });
    } else {
      participant = await prisma.participant.create({
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          fullName,
          email: cleanEmail,
          documentId: cleanDoc,
          phone: input.phone || null,
          alternatePhone: input.alternatePhone || null,
          institution: cleanInstitution,
          isDemo: input.isDemo || false,
        },
      });
    }

    // 3. Verificar que no esté ya inscrito en ESTA edición
    const existingRegistration = await prisma.registration.findUnique({
      where: {
        eventId_participantId: {
          eventId,
          participantId: participant.id,
        },
      },
    });

    if (existingRegistration) {
      throw new ConflictError(
        `El participante ${fullName} ya se encuentra registrado en ${event.name} con el ticket ${existingRegistration.registrationNumber}`
      );
    }

    const regNumber = reservedNumber;

    // 5. Crear inscripción
    const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
    const customFieldsData = input.customFields
      ? (isSqlite ? JSON.stringify(input.customFields) : input.customFields)
      : null;

    const initialPaymentStatus = isCourtesy
      ? 'COURTESY'
      : balanceDue === 0 && amountPaid > 0
      ? 'PAID'
      : amountPaid > 0 && balanceDue > 0
      ? 'PARTIAL'
      : 'PENDING';

    const registration = await prisma.registration.create({
      data: {
        eventId,
        participantId: participant.id,
        registrationNumber: regNumber!,
        source: 'MANUAL',
        originLabel: 'Venta presencial',
        createdByUserId: actorId || null,
        commercialUserId: isCourtesy || request || input.salesResponsibleId ? null : (input.commercialUserId || actorId || null),
        ticketTypeId: ticketType ? ticketType.id : null,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: isCourtesy ? true : (input.isVerified || (amountPaid > 0)),
        isCourtesy,
        courtesyAuthorizedBy: approval?.name || null,
        courtesyUserId: approval?.id || null,
        courtesyReason: approval?.reason || null,
        courtesyDate: approval?.date || null,
        isDemo: input.isDemo || false,
        paymentMethodId: isCourtesy ? null : paymentMethodId,
        paymentStatus: initialPaymentStatus,
        salesResponsibleId: isCourtesy ? null : (input.salesResponsibleId || null),
        saleTimestamp: input.saleTimestamp ? new Date(input.saleTimestamp) : new Date(),
        status: input.status ? input.status : (balanceDue === 0 || isCourtesy ? 'CONFIRMED' : 'PENDING'),
        qrCode: `eg_qr_${crypto.randomBytes(16).toString('hex')}`,
        qrGeneratedAt: new Date(),
        notes: input.notes || null,
        customFields: customFieldsData as any,
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
      },
    });

    // Si hubo pago inicial, registrar en libro contable de pagos
    if (amountPaid > 0) {
      await prisma.payment.create({
        data: {
          registrationId: registration.id,
          amount: amountPaid,
          paymentMethodId,
          notes: 'Pago inicial de inscripción manual',
          receivedByUserId: actorId || null,
        },
      });
    }


    if (actorId) {
      const changes = { createdByUserId: actorId, origin: registration.originLabel, commercialUserId: registration.commercialUserId, salesResponsibleId: registration.salesResponsibleId, responsibleChangeReason: input.responsibleChangeReason, ticketPrice: Number(registration.ticketPrice), amountPaid: Number(registration.amountPaid), paymentMethodId: registration.paymentMethodId, paymentStatus: registration.paymentStatus, isCourtesy: registration.isCourtesy };
      await tx.auditLog.create({ data: { userId: actorId, action: 'CREATE', entity: 'REGISTRATION', entityId: registration.id, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
    }
    if (request && actorId) {
      const changes = { createdByUserId: actorId, action: 'CREATE_PENDING_COURTESY_REGISTRATION' };
      await tx.auditLog.create({ data: { userId: actorId, action: 'CREATE', entity: 'REGISTRATION', entityId: registration.id, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
      await recordCourtesyRequest(tx, eventId, registration, actorId, request.reason, request.key, request);
    }
    if (approval) await auditCourtesy(tx, eventId, registration.id, actorId, approval, true);
    return registration;

    }, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  /**
   * Actualizar registro existente
   */
  static async update(eventId: string, registrationId: string, input: UpdateRegistrationInput, userId?: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    if ((input.status as string) === 'ATTENDED' || ['attended', 'attendedAt', 'attendedByUserId'].some(key => Object.prototype.hasOwnProperty.call(input, key))) throw new BadRequestError('La asistencia solo puede confirmarse mediante check-in autorizado.');
    const existing = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: {
        participant: true,
        ticketType: true,
        event: { include: { paymentMethods: true, ticketTypes: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if ((input.status === 'CANCELLED' && existing.status !== 'CANCELLED') || (existing.status === 'CANCELLED' && input.status && input.status !== 'CANCELLED')) throw new BadRequestError('Utilice la operación administrativa de cancelación o reactivación; la edición de la ficha no sustituye sus controles.');

    if(input.isDemo!==undefined&&input.isDemo!==existing.isDemo){const actor=userId?await tx.user.findUnique({where:{id:userId}}):null;if(actor?.role!=='ADMIN')throw new ForbiddenError('Cambiar el carácter demo requiere administrador.');}

    const numberChanged = Boolean(input.registrationNumber && input.registrationNumber !== existing.registrationNumber);
    const responsibleChanged = (input.salesResponsibleId !== undefined && input.salesResponsibleId !== existing.salesResponsibleId) || (input.commercialUserId !== undefined && input.commercialUserId !== existing.commercialUserId);
    if (numberChanged || responsibleChanged) {
      const actor = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
      if (actor?.role !== 'ADMIN' || (numberChanged && !input.numberChangeReason) || (responsibleChanged && !input.responsibleChangeReason)) throw new BadRequestError('Se requiere administrador y un motivo para cambiar numeración o responsable.');
      if (input.commercialUserId) { const target = await tx.user.findUnique({ where: { id: input.commercialUserId } }); if (!target?.isActive || (target.assignedEventId && target.assignedEventId !== eventId)) throw new BadRequestError('Responsable fuera de la edición activa.'); }
      const changes = { registrationNumber: { before: existing.registrationNumber, after: input.registrationNumber, reason: input.numberChangeReason }, commercialUserId: { before: existing.commercialUserId, after: input.commercialUserId }, salesResponsibleId: { before: existing.salesResponsibleId, after: input.salesResponsibleId }, responsibleChangeReason: input.responsibleChangeReason };
      await tx.auditLog.create({ data: { userId: userId!, action: 'UPDATE', entity: 'REGISTRATION', entityId: registrationId, changes: (process.env.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
    }
    const previousValues: Record<string, any> = {
      firstName: existing.participant.firstName,
      lastName: existing.participant.lastName,
      fullName: existing.participant.fullName,
      email: existing.participant.email,
      documentId: existing.participant.documentId,
      phone: existing.participant.phone,
      alternatePhone: existing.participant.alternatePhone,
      institution: existing.participant.institution,
      ticketTypeId: existing.ticketTypeId,
      ticketTypeName: existing.ticketType?.name,
      ticketPrice: Number(existing.ticketPrice),
      amountPaid: Number(existing.amountPaid),
      balanceDue: Number(existing.balanceDue),
      isCourtesy: existing.isCourtesy,
      status: existing.status,
      paymentStatus: existing.paymentStatus,
      paymentMethodId: existing.paymentMethodId,
      notes: existing.notes,
    };

    if ((input.isCourtesy && Number(existing.amountPaid) > 0) ||
        (await prisma.payment.count({ where: { registrationId } }) > 0 &&
        ((input.amountPaid != null && Number(input.amountPaid) !== Number(existing.amountPaid)) ||
         (input.totalAmount != null && Number(input.totalAmount) !== Number(existing.amountPaid))))) {
      throw new BadRequestError('Los pagos históricos se conservan. Utilice las operaciones financieras autorizadas para corregirlos.');
    }
    if (input.ticketTypeId && !existing.event.ticketTypes.some(t => t.id === input.ticketTypeId)) throw new BadRequestError('Tarifa fuera de la edición activa.');
    if (input.paymentMethodId && !existing.event.paymentMethods.some(m => m.id === input.paymentMethodId)) throw new BadRequestError('Método de pago fuera de la edición activa.');
    // Si se enviaron datos de la persona física
    if (
      input.firstName ||
      input.lastName ||
      input.email ||
      input.phone !== undefined ||
      input.documentId !== undefined ||
      input.institution !== undefined
    ) {
      const firstName = input.firstName || existing.participant.firstName;
      const lastName = input.lastName || existing.participant.lastName;
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      await prisma.participant.update({
        where: { id: existing.participantId },
        data: {
          firstName,
          lastName,
          fullName,
          email: input.email ? input.email.toLowerCase().trim() : undefined,
          phone: input.phone !== undefined ? input.phone : undefined,
          alternatePhone: input.alternatePhone !== undefined ? input.alternatePhone : undefined,
          documentId: input.documentId !== undefined ? (input.documentId ? input.documentId.trim() : null) : undefined,
          institution: input.institution !== undefined ? (input.institution ? input.institution.trim() : null) : undefined,
          updatedByUserId: userId || undefined,
        },
      });
    }

    // Comprobar cortesía
    let isCourtesy = input.isCourtesy !== undefined ? input.isCourtesy : existing.isCourtesy;
    let paymentMethodId = input.paymentMethodId !== undefined ? input.paymentMethodId : existing.paymentMethodId;
    let ticketTypeId = input.ticketTypeId !== undefined ? input.ticketTypeId : existing.ticketTypeId;

    let ticketType = null;
    if (ticketTypeId) {
      ticketType = existing.event.ticketTypes.find((t) => t.id === ticketTypeId);
      if (!ticketType) throw new BadRequestError('Tarifa fuera de la edición activa.');
      if (ticketType && (Number(ticketType.price) === 0)) {
        isCourtesy = true;
      }
    }

    if (paymentMethodId) {
      const pm = existing.event.paymentMethods.find((m) => m.id === paymentMethodId);
      if (!pm) throw new BadRequestError('Método de pago fuera de la edición activa.');
      if (pm && pm.name.toLowerCase().includes('cortes')) {
        isCourtesy = true;
      }
    }

    const courtesyChanged = isCourtesy && (!existing.isCourtesy ||
      (input.courtesyReason !== undefined && input.courtesyReason !== existing.courtesyReason) ||
      (input.courtesyAuthorizedBy !== undefined && input.courtesyAuthorizedBy !== existing.courtesyAuthorizedBy));
    const approval = courtesyChanged ? await authorizeCourtesy(tx, eventId, userId, input.courtesyReason) : null;
    // Si pasamos de cortesía a entrada normal pagada, restaurar el precio oficial de la tarifa
    let ticketPrice = existing.ticketPrice ? Number(existing.ticketPrice) : Number(existing.totalAmount);
    if (existing.isCourtesy && !isCourtesy) {
      ticketPrice = ticketType ? Number(ticketType.price) : (input.ticketPrice ? Number(input.ticketPrice) : 0);
    } else if (input.ticketPrice !== undefined && input.ticketPrice !== null && !isCourtesy && Number(input.ticketPrice) !== ticketPrice) {
      const actor = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
      if (actor?.role !== 'ADMIN') throw new BadRequestError('La tarifa no puede modificarse manualmente.');
      ticketPrice = Number(input.ticketPrice);
    } else if (input.ticketTypeId !== undefined && input.ticketTypeId !== existing.ticketTypeId && ticketType) {
      ticketPrice = Number(ticketType.price);
    } else if (ticketType && (!existing.ticketPrice || Number(existing.ticketPrice) === 0) && !isCourtesy) {
      ticketPrice = Number(ticketType.price);
    }

    let amountPaid = existing.amountPaid !== undefined && existing.amountPaid !== null
      ? Number(existing.amountPaid)
      : Number(existing.totalAmount);
    if (existing.isCourtesy && !isCourtesy) {
      amountPaid = input.amountPaid !== undefined ? Number(input.amountPaid) : 0;
    } else if (input.amountPaid !== undefined && input.amountPaid !== null) {
      amountPaid = Number(input.amountPaid);
    } else if (input.totalAmount !== undefined && input.totalAmount !== null) {
      amountPaid = Number(input.totalAmount);
    }

    let balanceDue = Math.max(0, ticketPrice - amountPaid);
    if (isCourtesy) {
      ticketPrice = 0;
      amountPaid = 0;
      balanceDue = 0;
      paymentMethodId = null;
    }

    // Calcular estado de pago
    let paymentStatus = existing.paymentStatus || 'PENDING';
    if (isCourtesy) {
      paymentStatus = 'COURTESY';
    } else if (amountPaid >= ticketPrice && ticketPrice > 0) {
      paymentStatus = 'PAID';
    } else if (amountPaid > 0 && balanceDue > 0) {
      paymentStatus = 'PARTIAL';
    } else if (amountPaid === 0) {
      paymentStatus = 'PENDING';
    }

    const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
    let customFieldsData = undefined;
    if (input.customFields !== undefined) {
      customFieldsData = input.customFields
        ? (isSqlite ? JSON.stringify(input.customFields) : input.customFields)
        : null;
    }

    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        registrationNumber: numberChanged ? input.registrationNumber! : undefined,
        commercialUserId: input.commercialUserId,
        ticketTypeId,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: isCourtesy ? true : (input.isVerified !== undefined ? input.isVerified : existing.isVerified),
        isCourtesy,
        courtesyAuthorizedBy: isCourtesy ? (approval?.name || existing.courtesyAuthorizedBy) : null,
        courtesyReason: isCourtesy ? (approval?.reason || existing.courtesyReason) : null,
        courtesyUserId: isCourtesy ? (approval?.id || existing.courtesyUserId) : null,
        courtesyDate: isCourtesy ? (approval?.date || existing.courtesyDate) : null,
        paymentMethodId: isCourtesy ? null : paymentMethodId,
        paymentStatus,
        salesResponsibleId: isCourtesy ? null : (input.salesResponsibleId !== undefined ? input.salesResponsibleId : existing.salesResponsibleId),
        saleTimestamp: input.saleTimestamp ? new Date(input.saleTimestamp) : undefined,

        status: input.status !== undefined ? input.status : undefined,
        notes: input.notes !== undefined ? input.notes : undefined,
        customFields: customFieldsData as any,
        updatedByUserId: userId || undefined,
      },
      include: {
        participant: {
          include: {
            updatedByUser: { select: { id: true, fullName: true, email: true } },
          },
        },
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
        updatedByUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (approval) await auditCourtesy(tx, eventId, registrationId, userId, approval);
    return {
      ...updated,
      status: updated.status,
      previousValues,
    };

    }, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  /**
   * Venta presencial en recepción ("Nueva venta")
   */
  static async onsiteSale(eventId: string, input: OnsiteSaleInput, operatorUserId: string) {
    if (input.paymentMethodId && !await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, eventId } })) throw new BadRequestError('Método de pago fuera de la edición activa.');
    const reservedNumber = await ParticipantsService.getNextRegistrationNumber(eventId);
    return writeTransaction(async tx => {
    const prisma = tx;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true, ticketTypes: true, paymentMethods: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const ticketType = event.ticketTypes.find((t) => t.id === input.ticketTypeId);
    if (!ticketType) {
      throw new NotFoundError('El tipo de entrada seleccionado no existe en esta edición');
    }

    const isCourtesy =
      Number(ticketType.price) === 0 ||
      !!input.courtesyAuthorizedBy;

    const approval = isCourtesy ? await authorizeCourtesy(tx, eventId, operatorUserId, input.courtesyReason) : null;
    const ticketPrice = isCourtesy ? 0 : Number(ticketType.price);
    const amountReceived = isCourtesy ? 0 : Number(input.amountReceived || 0);
    const amountPaid = isCourtesy
      ? 0
      : (input.amountPaid !== undefined ? Number(input.amountPaid) : Math.min(amountReceived, ticketPrice));
    const balanceDue = Math.max(0, ticketPrice - amountPaid);
    const changeDue = Math.max(0, amountReceived - amountPaid);

    // 1. Identificar o registrar al participante
    let participant = null;

    if (input.participantId) {
      participant = await prisma.participant.findUnique({
        where: { id: input.participantId },
      });
      if (!participant) throw new NotFoundError('Participante seleccionado no encontrado');

      if (input.institution && input.institution.trim()) {
        participant = await prisma.participant.update({
          where: { id: participant.id },
          data: { institution: input.institution.trim() },
        });
      }
    } else {
      if (!input.firstName || !input.lastName || !input.email) {
        throw new BadRequestError('Para un participante nuevo debe indicar Nombre, Apellido y Correo electrónico');
      }

      const cleanEmail = input.email.toLowerCase().trim();
      const cleanDoc = input.documentId ? input.documentId.trim() : null;
      const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
      const institution = input.institution ? input.institution.trim() : null;

      if (cleanDoc) {
        participant = await prisma.participant.findFirst({ where: { documentId: cleanDoc } });
      }
      if (!participant) {
        participant = await prisma.participant.findFirst({ where: { email: cleanEmail } });
      }

      if (participant) {
        participant = await prisma.participant.update({
          where: { id: participant.id },
          data: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            fullName,
            phone: input.phone || participant.phone,
            alternatePhone: input.alternatePhone || participant.alternatePhone,
            documentId: cleanDoc || participant.documentId,
            institution: institution || participant.institution,
          },
        });
      } else {
        participant = await prisma.participant.create({
          data: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            fullName,
            email: cleanEmail,
            documentId: cleanDoc,
            phone: input.phone || null,
            alternatePhone: input.alternatePhone || null,
            institution,
          },
        });
      }
    }

    // 2. Verificar que no esté ya registrado en esta edición
    const existing = await prisma.registration.findUnique({
      where: {
        eventId_participantId: {
          eventId,
          participantId: participant.id,
        },
      },
    });

    if (existing) {
      throw new ConflictError(
        `El participante ${participant.fullName} ya está registrado en ${event.name} con el ticket ${existing.registrationNumber}`
      );
    }

    // 3. Generar número de registro único atómico (QA-16)
    const regNumber = reservedNumber;

    const now = new Date();

    const onsitePaymentStatus = isCourtesy
      ? 'COURTESY'
      : balanceDue === 0
      ? 'PAID'
      : amountPaid > 0
      ? 'PARTIAL'
      : 'PENDING';

    // 4. Crear la inscripción
    const registration = await prisma.registration.create({
      data: {
        eventId,
        participantId: participant.id,
        registrationNumber: regNumber,
        source: 'ONSITE_SALE',
        originLabel: 'Venta presencial',
        createdByUserId: operatorUserId,
        commercialUserId: isCourtesy ? null : operatorUserId,
        ticketTypeId: ticketType.id,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: true,
        isCourtesy,
        courtesyAuthorizedBy: approval?.name || null,
        courtesyReason: approval?.reason || null,
        courtesyDate: isCourtesy ? now : null,
        courtesyUserId: approval?.id || null,
        paymentMethodId: isCourtesy ? null : input.paymentMethodId || null,
        paymentStatus: onsitePaymentStatus,
        status: balanceDue === 0 || isCourtesy ? 'CONFIRMED' : 'PENDING',
        qrCode: `eg_qr_${crypto.randomBytes(16).toString('hex')}`,
        qrGeneratedAt: now,
        notes: input.notes || null,
        saleTimestamp: now,
        updatedByUserId: operatorUserId,
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
      },
    });

    // 5. Registrar abono en el libro de pagos si amountPaid > 0
    let recordedPayment = null;
    if (amountPaid > 0) {
      recordedPayment = await prisma.payment.create({
        data: {
          registrationId: registration.id,
          amount: amountPaid,
          paymentMethodId: input.paymentMethodId,
          notes: input.notes || 'Venta presencial en recepción',
          receivedByUserId: operatorUserId,
        },
      });
    }


    if (approval) await auditCourtesy(tx, eventId, registration.id, operatorUserId, approval, true);
    return {
      registration,
      payment: recordedPayment,
      financials: {
        ticketPrice,
        amountReceived,
        amountPaid,
        balanceDue,
        changeDue,
      },
    };

    });
  }

  /**
   * Registrar abono o pago adicional
   */
  static async recordPayment(eventId: string, registrationId: string, input: RecordPaymentInput, userId: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    const actor=await prisma.user.findUnique({where:{id:userId}});
    if(!actor?.isActive||actor.accountStatus!=='ACTIVE'||actor.assignedEventId&&actor.assignedEventId!==eventId||actor.scannerOnly||!['ADMIN','OPERATOR'].includes(actor.role))throw new ForbiddenError('No autorizado para registrar pagos.');
    const idempotencyKey=input.requestKey?`manual:${eventId}:${userId}:${input.requestKey}`:undefined;
    if(idempotencyKey){const previous=await prisma.payment.findUnique({where:{idempotencyKey}});if(previous){if(previous.registrationId!==registrationId||cents(previous.amount)!==cents(input.amount)||previous.paymentMethodId!==input.paymentMethodId)throw new BadRequestError('El reintento no coincide con el pago original. Consulta el estado antes de registrar otra operación.');return {payment:previous,registration:await prisma.registration.findFirstOrThrow({where:{id:registrationId,eventId}})};}}
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true, ticketType: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if (registration.status === 'CANCELLED') {
      throw new BadRequestError('No se pueden registrar pagos a una inscripción cancelada');
    }

    if (registration.isCourtesy) {
      throw new BadRequestError('Las cortesías no admiten cobros ni abonos');
    }

    const method=await prisma.paymentMethod.findFirst({where:{id:input.paymentMethodId,eventId,isActive:true}});
    if(!method||['COURTESY','SPONSOR'].includes(method.code||'')) throw new BadRequestError('Método de pago fuera de la edición activa.');
    if(input.source==='RECEPTION_QUEUE'){
      const settings=await prisma.eventSettings.findUnique({where:{eventId}});
      if(!settings?.allowOnsitePayments)throw new BadRequestError('Esta edición no autoriza cobros en recepción.');
      if(registration.source==='EXCEL_IMPORT'||registration.externalPlatform)throw new BadRequestError('Pago externo: utiliza la conciliación autorizada, no caja presencial.');
      if(Number(input.amount)>Number(registration.balanceDue)||Number(registration.balanceDue)<=0)throw new BadRequestError('El importe supera el pendiente real.');
    }
    const paymentAmount = cents(input.amount)/100;
    const currentPaid = cents(registration.amountPaid ?? registration.totalAmount ?? 0)/100;
    const ticketPrice = Number(registration.ticketPrice ?? registration.totalAmount ?? 0);
    const newAmountPaid = (cents(currentPaid)+cents(paymentAmount))/100;
    const newBalanceDue = Math.max(0,cents(ticketPrice)-cents(newAmountPaid))/100;

    const newPaymentStatus = registration.isCourtesy
      ? 'COURTESY'
      : newBalanceDue === 0
      ? 'PAID'
      : newAmountPaid > 0
      ? 'PARTIAL'
      : 'PENDING';

    const [payment, updatedRegistration] = await Promise.all([
      prisma.payment.create({
        data: {
          registrationId,
          idempotencyKey,channel:'ONSITE',recordedByUserId:userId,
          amount: paymentAmount,
          paymentMethodId: input.paymentMethodId,
          notes: input.notes || null,
          receivedByUserId: userId,
        },
        include: {
          paymentMethod: true,
          receivedByUser: { select: { id: true, fullName: true, email: true } },
            recordedByUser: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.registration.update({
        where: { id: registrationId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          totalAmount: newAmountPaid,
          isVerified: true,
          paymentStatus: newPaymentStatus,
          status: newBalanceDue === 0 && registration.status === 'PENDING' ? 'CONFIRMED' : registration.status,
          updatedByUserId: userId,
        },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
          payments: {
            include: { paymentMethod: true, receivedByUser: { select: { id: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);


    await prisma.auditLog.create({data:{userId,action:'UPDATE',entity:'REGISTRATION',entityId:registrationId,changes:JSON.stringify({operation:'PAYMENT_RECORDED',channel:'ONSITE',amount:paymentAmount,paymentMethodId:input.paymentMethodId,source:input.source||'MANUAL'})}});
    return {
      payment,
      registration: updatedRegistration,
    };

    }, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  /**
   * Cancelar inscripción (Solo ADMIN)
   * REGLA: No borra datos ni pagos históricos, ni genera reembolsos automáticos.
   */
  static async cancelRegistration(eventId: string, registrationId: string, reason: string, adminUserId: string) {
    return writeTransaction(tx => FinanceService.cancel(tx, eventId, adminUserId, registrationId, reason, 'VOLUNTARY'));
  }

  /**
   * Reactivar inscripción cancelada (Solo ADMIN)
   */
  static async reactivateRegistration(eventId: string, registrationId: string, reason: string, adminUserId: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    await FinanceService.admin(tx, adminUserId, eventId);
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if (await prisma.refundRequest.findFirst({ where: { registrationId, status: 'REFUNDED' } })) throw new BadRequestError('Tiene reembolsos confirmados. Requiere regularización financiera antes de reactivar.');
    if (registration.status !== 'CANCELLED') {
      throw new BadRequestError('Solo se pueden reactivar inscripciones en estado CANCELADO');
    }

    const noteEntry = `[REACTIVACIÓN ${new Date().toLocaleString('es-DO')}]: ${reason}`;
    const newNotes = registration.notes ? `${registration.notes}\n${noteEntry}` : noteEntry;
    const balance = Number(registration.balanceDue ?? 0);
    const newStatus = balance === 0 || registration.isCourtesy ? 'CONFIRMED' : 'PENDING';

    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: newStatus,
        notes: newNotes,
        updatedByUserId: adminUserId,
      },
      include: {
        participant: true,
        ticketType: true,
      },
    });

    return {
      ...updated,
      previousTshirtSize: registration.tshirtSize || null,
    };
    });
  }

  /**
   * Asignar cortesía a un participante
   */
  static async assignCourtesy(eventId: string, registrationId: string, input: AssignCourtesyInput, adminUserId: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if (registration.attended || registration.status === 'CANCELLED') throw new BadRequestError('No puede asignar cortesía a una entrada cancelada o con asistencia confirmada.');
    if (Number(registration.amountPaid) > 0) throw new BadRequestError('No se puede convertir a cortesía una inscripción con pagos registrados.');
    const approval = await authorizeCourtesy(prisma, eventId, adminUserId, input.reason);
    // Buscar tipo de entrada cortesía si existe
    const courtesyTicketType = await prisma.ticketType.findFirst({
      where: {
        eventId,
        OR: [{ price: 0 }, { name: { contains: 'Cortes' } }],
      },
    });

    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        isCourtesy: true,
        courtesyAuthorizedBy: approval.name,
        courtesyReason: input.reason,
        courtesyDate: new Date(),
        courtesyUserId: adminUserId,
        ticketTypeId: courtesyTicketType ? courtesyTicketType.id : registration.ticketTypeId,
        ticketPrice: 0,
        amountPaid: 0,
        balanceDue: 0,
        totalAmount: 0,
        paymentStatus: 'COURTESY',
        status: 'CONFIRMED',
        updatedByUserId: adminUserId,
      },
      include: {
        participant: true,
        ticketType: true,
        courtesyUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    await auditCourtesy(tx, eventId, registrationId, adminUserId, approval);
    return {
      ...updated,
      previousTshirtSize: registration.tshirtSize || null,
    };
    }, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  /**
   * Historial completo de un participante (pagos, asistencia, auditoría)
   */
  static async getHistory(eventId: string, registrationId: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: {
        participant: true,
        ticketType: true,
      },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    const [payments, attendanceLogs, auditLogs] = await Promise.all([
      prisma.payment.findMany({
        where: { registrationId },
        include: {
          paymentMethod: true,
          receivedByUser: { select: { id: true, fullName: true, email: true } },
            recordedByUser: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.attendanceLog.findMany({
        where: { registrationId },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: {
          entityId: registrationId,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      registration,
      payments,
      attendanceLogs,
      auditLogs,
    };
  }

  /**
   * Eliminar inscripción
   */
  static async delete(eventId: string, registrationId: string) {
    const existing = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true, ticketType: true },
    });

    if (!existing) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    const previousValues: Record<string, any> = {
      firstName: existing.participant.firstName,
      lastName: existing.participant.lastName,
      fullName: existing.participant.fullName,
      email: existing.participant.email,
      documentId: existing.participant.documentId,
      phone: existing.participant.phone,
      alternatePhone: existing.participant.alternatePhone,
      institution: existing.participant.institution,
      ticketTypeId: existing.ticketTypeId,
      ticketTypeName: existing.ticketType?.name,
      ticketPrice: Number(existing.ticketPrice),
      amountPaid: Number(existing.amountPaid),
      balanceDue: Number(existing.balanceDue),
      isCourtesy: existing.isCourtesy,
      status: existing.status,
      paymentStatus: existing.paymentStatus,
      paymentMethodId: existing.paymentMethodId,
      notes: existing.notes,
    };

    const removed = await prisma.registration.deleteMany({ where: { id: registrationId, eventId, attended: false } });
    if (!removed.count) throw new BadRequestError('Una asistencia confirmada es definitiva y su historial no puede eliminarse.');

    return {
      message: `Registro ${existing.registrationNumber} de ${existing.participant.fullName} eliminado exitosamente`,
    };
  }

  /**
   * Generar al menos 15 registros de prueba (Demo Data) claramente identificados
   */
  static async generateDemoParticipants(eventId: string, count = 15) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true, paymentMethods: true, salesResponsibles: true, ticketTypes: true },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    // Nombres realistas dominicanos y empresas / universidades
    const firstNames = ['Carlos', 'Ana', 'María', 'José', 'Laura', 'Pedro', 'Rosa', 'Juan', 'Emely', 'David', 'Sofía', 'Luis', 'Gabriela', 'Manuel', 'Patricia', 'Alejandro', 'Nicole', 'Francis'];
    const lastNames = ['Rodríguez', 'Pérez', 'García', 'Martínez', 'Hernández', 'Sánchez', 'Díaz', 'Morales', 'Reyes', 'Cruz', 'Jiménez', 'Gómez', 'Almonte', 'Vargas', 'Peña'];
    const institutions = ['Tech Corp', 'Global Solutions', 'Innovación Digital', 'Instituto Tecnológico', 'Universidad Nacional', 'Freelance / Dev'];

    const prefix = event.settings?.registrationPrefix || `BC${String(event.year).slice(-2)}-`;
    const startCount = await prisma.registration.count({ where: { eventId } });

    const generalTicket = officialTicket(event.ticketTypes,event.defaultTicketTypeId);
    if (!generalTicket) throw new BadRequestError('Configure la tarifa oficial de la edición antes de generar registros demo.');
    const presaleTicket = event.ticketTypes.find((t) => t.name.toLowerCase().includes('preventa')) || generalTicket;
    const courtesyTicket = event.ticketTypes.find((t) => Number(t.price) === 0) || null;

    let createdCount = 0;

    for (let i = 0; i < count; i++) {
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const inst = institutions[Math.floor(Math.random() * institutions.length)];
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const email = `demo.${fName.toLowerCase()}.${lName.toLowerCase()}${randSuffix}@eventgrid.demo`;
      const doc = `402-${String(Math.floor(1000000 + Math.random() * 8999999))}-${Math.floor(Math.random() * 9)}`;
      const phone = `809-${String(Math.floor(200 + Math.random() * 700))}-${String(Math.floor(1000 + Math.random() * 8999))}`;
      const regNumber = `${prefix}${String(startCount + i + 1).padStart(4, '0')}`;

      const isCourtesy = i % 5 === 0 && courtesyTicket !== null;
      const selectedTicket = isCourtesy ? courtesyTicket! : (i % 2 === 0 ? presaleTicket : generalTicket);
      const ticketPrice = isCourtesy ? 0 : Number(selectedTicket?.price || 2000);
      const amountPaid = isCourtesy ? 0 : ticketPrice;
      const balanceDue = 0;

      const pm = event.paymentMethods[i % (event.paymentMethods.length || 1)] || null;
      const sr = event.salesResponsibles[i % (event.salesResponsibles.length || 1)] || null;

      const participant = await prisma.participant.create({
        data: {
          firstName: fName,
          lastName: lName,
          fullName: `${fName} ${lName}`,
          email,
          documentId: doc,
          phone,
          institution: inst,
          isDemo: true,
        },
      });

      await prisma.registration.create({
        data: {
          eventId,
          participantId: participant.id,
          registrationNumber: regNumber,
          source: 'MANUAL',
          ticketTypeId: selectedTicket?.id || null,
          ticketPrice,
          amountPaid,
          balanceDue,
          totalAmount: amountPaid,
          isVerified: true,
          isCourtesy,
          courtesyAuthorizedBy: isCourtesy ? 'Comité Organizador del Evento' : null,
          courtesyReason: isCourtesy ? 'Beca de excelencia académica' : null,
          courtesyDate: isCourtesy ? new Date() : null,
          isDemo: true,
          paymentMethodId: isCourtesy ? null : (pm ? pm.id : null),
          salesResponsibleId: sr ? sr.id : null,
          status: 'CONFIRMED',
          notes: 'Participante de prueba generado automáticamente',
        },
      });

      createdCount++;
    }

    return {
      message: `Se generaron exitosamente ${createdCount} participantes de prueba (Demo) identificados.`,
      count: createdCount,
    };
  }

  /**
   * Limpiar todos los registros demo de la edición activa
   */
  static async clearDemoParticipants(eventId: string) {
    const deletedRegistrations = await prisma.registration.deleteMany({
      where: {
        eventId,
        isDemo: true,
      },
    });

    const demoParticipants = await prisma.participant.findMany({
      where: { isDemo: true },
      include: { _count: { select: { registrations: true } } },
    });

    const orphanedIds = demoParticipants.filter((p) => p._count.registrations === 0).map((p) => p.id);
    if (orphanedIds.length > 0) {
      await prisma.participant.deleteMany({
        where: { id: { in: orphanedIds } },
      });
    }

    return {
      message: `Se eliminaron ${deletedRegistrations.count} inscripciones de demostración.`,
      count: deletedRegistrations.count,
    };
  }

  /**
   * Exportar registros a Excel (.xlsx) o CSV con datos enriquecidos
   */
  static async exportData(eventId: string, query: ListParticipantsQueryInput, format: 'xlsx' | 'csv' = 'xlsx') {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const whereClause: any = { eventId };

    if (query.paymentMethodId) whereClause.paymentMethodId = query.paymentMethodId;
    if (query.ticketTypeId) whereClause.ticketTypeId = query.ticketTypeId;
    if (query.salesResponsibleId) whereClause.salesResponsibleId = query.salesResponsibleId;
    if (query.status) whereClause.status = query.status;
    if (query.isVerified !== undefined) whereClause.isVerified = query.isVerified;
    if (query.isCourtesy !== undefined) whereClause.isCourtesy = query.isCourtesy;

    if (query.search && query.search.trim() !== '') {
      const s = query.search.trim();
      whereClause.OR = [
        { participantId: { in: await participantNameIds(prisma, eventId, s) } },
        { registrationNumber: { contains: s } },
        { externalReference: { contains: s } },
        { participant: { fullName: { contains: s } } },
        { participant: { email: { contains: s } } },
        { participant: { documentId: { contains: s } } },
        { participant: { phone: { contains: s } } },
        { participant: { institution: { contains: s } } },
      ];
    }

    const registrations = await prisma.registration.findMany({
      where: whereClause,
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
        attendedByUser: { select: { fullName: true } },
      },
      orderBy: { registrationNumber: 'asc' },
    });

    const attribution = await prisma.user.findMany({ where: { id: { in: [...new Set(registrations.flatMap(r => [r.commercialUserId, r.createdByUserId]).filter((id): id is string => Boolean(id)))] } }, select: { id: true, fullName: true } });
    const attributionNames = new Map(attribution.map(user => [user.id, user.fullName]));
    const rows = registrations.map((r, index) => {
      const p = r.participant;
      return {
        'No.': index + 1,
        'No. Registro': r.registrationNumber,
        'Nombres': p.firstName,
        'Apellidos': p.lastName,
        'Nombre Completo': p.fullName,
        'Doc. Identidad': p.documentId || 'N/A',
        'Correo Electrónico': p.email,
        'Teléfono': p.phone || 'N/A',
        'Teléfono Alternativo': p.alternatePhone || 'N/A',
        'Institución / Empresa': p.institution || 'N/A',
        'Tipo de Entrada': r.ticketType?.name || (r.isCourtesy ? 'Cortesía' : 'General'),
        'Precio Entrada (RD$)': r.isCourtesy ? '0.00' : Number(r.ticketPrice ?? r.totalAmount ?? 0).toFixed(2),
        'Pago Total (RD$)': r.isCourtesy ? '0.00' : Number(r.amountPaid ?? r.totalAmount ?? 0).toFixed(2),
        'Monto Pagado (RD$)': r.isCourtesy ? '0.00' : Number(r.amountPaid ?? r.totalAmount ?? 0).toFixed(2),
        'Balance Pendiente (RD$)': r.isCourtesy ? '0.00' : Number(r.balanceDue ?? 0).toFixed(2),
        'Forma de Pago': r.isCourtesy ? 'Cortesía' : (r.paymentMethod?.name || 'No registrada'),
        'Es Cortesía': r.isCourtesy ? 'SÍ' : 'NO',
        'Autorizado Por': r.courtesyAuthorizedBy || (r.isCourtesy ? 'Comité' : 'N/A'),
        'Pago Verificado': r.isVerified ? 'SÍ' : 'NO',
        'Asistió al Evento': r.attended ? 'SÍ' : 'NO',
        'Hora de Asistencia': r.attendedAt ? new Date(r.attendedAt).toLocaleString('es-DO') : 'No ha llegado',
        'Operador Asistencia': r.attendedByUser?.fullName || 'N/A',
        'Responsable de Venta': r.salesResponsible?.name || (r.commercialUserId ? attributionNames.get(r.commercialUserId) : null) || (r.isCourtesy ? 'No aplica' : 'No especificado'),
        'Registrado / Importado por': r.createdByUserId ? attributionNames.get(r.createdByUserId) || 'No especificado' : 'No especificado',
        'Referencia externa': r.externalReference || '',
        'Plataforma de origen': r.externalPlatform || '',
        'Comprador': r.buyerName || '',
        'Estado de pago externo': r.externalPaymentStatus || '',
        'Fecha y Hora de Venta': new Date(r.saleTimestamp).toLocaleString('es-DO', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        'Estado': r.status,
        'Origen': r.source === 'ONSITE_SALE' ? 'Venta Presencial' : (r.source === 'EXCEL_IMPORT' ? 'Importado Excel' : 'Manual'),
        'Notas': r.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const colWidths = [
      { wch: 6 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 18 },
      { wch: 32 },
      { wch: 16 },
      { wch: 16 },
      { wch: 25 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 12 },
      { wch: 24 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
      { wch: 24 },
      { wch: 26 },
      { wch: 22 },
      { wch: 16 },
      { wch: 18 },
      { wch: 25 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Participantes ${event.year}`);

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `EventGrid_${event.slug}_Participantes_${new Date().toISOString().slice(0, 10)}.csv`,
      };
    } else {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `EventGrid_${event.slug}_Participantes_${new Date().toISOString().slice(0, 10)}.xlsx`,
      };
    }
  }

  static async updateTshirtSize(
    eventId: string,
    registrationId: string,
    tshirtSize: string | null,
    userId: string
  ) {
    return writeTransaction(async tx => {
    const prisma = tx;
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en esta edición');
    }

    if (tshirtSize) {
      tshirtSize = await InventoryService.validateSize(eventId, tshirtSize);
    }
    const oldSize = registration.tshirtSize;
    const isDelivered = registration.tshirtDelivered;
    if (isDelivered && !tshirtSize) throw new BadRequestError('Registre primero la devolución física antes de quitar la talla entregada.');

    // Si ya fue entregada y cambia de talla, ajustar inventario
    let oldInv: any = null;
    let newInv: any = null;

    if (isDelivered && tshirtSize !== oldSize) {
      if (tshirtSize) {
        newInv = await prisma.tshirtInventory.findUnique({
          where: { eventId_size: { eventId, size: tshirtSize } },
        });
        if (!newInv || !newInv.isActive) throw new BadRequestError('No existe inventario activo para esa talla.');
        if (newInv && (newInv.initialQuantity - newInv.deliveredQuantity - newInv.staffReservedQuantity) <= 0) {
          throw new BadRequestError(`TALLA AGOTADA: No quedan unidades disponibles de la talla "${tshirtSize}".`);
        }
      }
      if (oldSize) {
        oldInv = await prisma.tshirtInventory.findUnique({
          where: { eventId_size: { eventId, size: oldSize } },
        });
      }
    }

    const now = new Date();
    const txOps: any[] = [
      prisma.registration.update({
        where: { id: registrationId },
        data: {
          tshirtSize: tshirtSize || null,
          tshirtSizeUpdatedAt: now,
          tshirtSizeUpdatedByUserId: userId,
          updatedByUserId: userId,
        },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
        },
      }),
    ];

    if (isDelivered && tshirtSize !== oldSize) {
      if (oldInv && oldInv.deliveredQuantity > 0) {
        txOps.push(
          prisma.tshirtInventory.update({
            where: { id: oldInv.id },
            data: { deliveredQuantity: { decrement: 1 } },
          })
        );
      }
      if (newInv) {
        txOps.push(
          prisma.tshirtInventory.update({
            where: { id: newInv.id },
            data: { deliveredQuantity: { increment: 1 } },
          })
        );
      }
    }

    const [updated] = await Promise.all(txOps);


    return {
      ...updated,
      previousTshirtSize: oldSize || null,
    };

    });
  }

  /**
   * Entrega física explícita de camiseta
   */
  static async deliverTshirt(eventId: string, registrationId: string, userId: string, size?: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true,ticketType:true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada');
    }

    if(registration.ticketType?.includesTshirt===false)throw new BadRequestError('Esta entrada no incluye camiseta.');
    if(registration.status==='CANCELLED')throw new BadRequestError('La inscripción está cancelada.');
    if (registration.tshirtDelivered) {
      throw new BadRequestError('La camiseta ya fue entregada previamente a este participante.');
    }

    const rawSize = size || registration.tshirtSize;
    if (!rawSize) {
      throw new BadRequestError('Debe seleccionar una talla de T-shirt para realizar la entrega.');
    }

    // QA-06: Validar talla
    const targetSize = await InventoryService.validateSize(eventId, rawSize);
    if (!targetSize) {
      throw new BadRequestError('Debe seleccionar una talla válida.');
    }

    // QA-03: No permitir entregas sin inventario registrado
    const inventoryItem = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId, size: targetSize } },
    });

    if (!inventoryItem || !inventoryItem.isActive) {
      throw new BadRequestError(`INVENTARIO NO ENCONTRADO: No existe inventario configurado o activo para la talla "${targetSize}".`);
    }

    const availableForParticipants = inventoryItem.initialQuantity - inventoryItem.deliveredQuantity - inventoryItem.staffReservedQuantity;
    if (availableForParticipants <= 0) {
      throw new BadRequestError(`TALLA AGOTADA: No quedan unidades disponibles de la talla "${targetSize}" para participantes (reservas de staff protegidas).`);
    }

    const now = new Date();

    const updated = await writeTransaction(async (tx) => {
      const inv = await tx.tshirtInventory.findUnique({
        where: { id: inventoryItem.id },
      });

      if (!inv || !inv.isActive) {
        throw new BadRequestError(`INVENTARIO NO ENCONTRADO: Talla "${targetSize}" no disponible.`);
      }

      const currentAvailable = inv.initialQuantity - inv.deliveredQuantity - inv.staffReservedQuantity;
      if (currentAvailable <= 0) {
        throw new BadRequestError(`TALLA AGOTADA: No quedan unidades disponibles de la talla "${targetSize}" para participantes.`);
      }

      const invUpdate = await tx.tshirtInventory.updateMany({
        where: {
          id: inv.id,
          initialQuantity: inv.initialQuantity,
          deliveredQuantity: inv.deliveredQuantity,
          staffReservedQuantity: inv.staffReservedQuantity,
          staffDeliveredQuantity: inv.staffDeliveredQuantity,
          isActive: true,
        },
        data: { deliveredQuantity: inv.deliveredQuantity + 1 },
      });

      if (invUpdate.count === 0) {
        throw new BadRequestError(`CONCURRENCIA: La disponibilidad para la talla "${targetSize}" cambió durante la operación. Por favor intente nuevamente.`);
      }

      const regUpdate = await tx.registration.updateMany({
        where: { id: registrationId,eventId,status:{not:'CANCELLED'}, tshirtDelivered: false },
        data: {
          tshirtSize: targetSize,
          tshirtSizeUpdatedAt: now,
          tshirtSizeUpdatedByUserId: userId,
          tshirtDelivered: true,
          tshirtDeliveryStatus: 'DELIVERED',
          tshirtDeliveredAt: now,
          tshirtDeliveredByUserId: userId,
          updatedByUserId: userId,
        },
      });

      if (regUpdate.count === 0) {
        throw new BadRequestError('La camiseta ya fue entregada a este participante.');
      }

      const reg = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'TSHIRT_DELIVERY',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'DELIVER_TSHIRT',
            previousDeliveryStatus:registration.tshirtDeliveryStatus,previousNonDeliveryReason:registration.tshirtNonDeliveryReason,
            result: 'SUCCESS',
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            size: targetSize,
            delivered: true,
            inventoryDeducted: 1,
            deliveredAt: now.toISOString(),
          }),
        },
      });

      return reg;
    });

    RealtimeService.emit(eventId, {
      type: 'TSHIRT_DELIVERED',
      data: {
        registrationId,
        tshirtSize: targetSize,
        tshirtDelivered: true,
        registration: updated,
      },
    });

    return updated;
  }

  static async returnTshirt(eventId: string, registrationId: string, userId: string, reason: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Debe especificar un motivo justificado para la devolución de la camiseta.');
    }

    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada');
    }

    if (!registration.tshirtDelivered) {
      throw new BadRequestError('El participante no tiene una camiseta registrada como entregada.');
    }

    const size = registration.tshirtSize;
    let inventoryItem: any = null;
    if (size) {
      inventoryItem = await prisma.tshirtInventory.findUnique({
        where: { eventId_size: { eventId, size } },
      });
    }

    const now = new Date();
    const txOps: any[] = [
      prisma.registration.update({
        where: { id: registrationId },
        data: {
          tshirtDelivered: false,
          tshirtDeliveredAt: null,
          tshirtDeliveredByUserId: null,
          updatedByUserId: userId,
        },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: 'TSHIRT_RETURN',
          entity: 'REGISTRATION',
          entityId: registrationId,
          changes: JSON.stringify({
            action: 'RETURN_TSHIRT',
            result: 'SUCCESS',
            participantName: registration.participant.fullName,
            ticket: registration.registrationNumber,
            size,
            reason: reason.trim(),
            returned: true,
            inventoryRestored: 1,
            returnedAt: now.toISOString(),
          }),
        },
      }),
    ];

    if (inventoryItem && inventoryItem.deliveredQuantity > 0) {
      txOps.push(
        prisma.tshirtInventory.update({
          where: { id: inventoryItem.id },
          data: { deliveredQuantity: { decrement: 1 } },
        })
      );
    }

    const [updated] = await Promise.all(txOps);
    return updated;

    });
  }
  /**
   * Generar número de registro secuencial y único de forma atómica (QA-16)
   */
  static async getNextRegistrationNumber(
    eventId: string,
    eventYear?: number,
    configuredPrefix?: string | null
  ): Promise<string> {
    if (!eventYear || configuredPrefix === undefined) {
      const evt = await prisma.event.findUnique({
        where: { id: eventId },
        include: { settings: true },
      });
      if (evt) {
        eventYear = eventYear ?? evt.year;
        configuredPrefix = configuredPrefix ?? evt.settings?.registrationPrefix;
      }
    }
    const rawPrefix = configuredPrefix || `EV${String(eventYear).slice(-2)}`;
    const prefix = rawPrefix.endsWith('-') ? rawPrefix : `${rawPrefix}-`;

    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await writeTransaction(async (tx) => {
          let seq = await tx.registrationSequence.findUnique({
            where: { eventId },
          });

          if (!seq) {
            // Analizar registros existentes con este prefijo para respetar numeraciones altas importadas
            const existingWithPrefix = await tx.registration.findMany({
              where: {
                eventId,
                registrationNumber: { startsWith: prefix },
              },
              select: { registrationNumber: true },
            });

            let highestNumber = 0;
            for (const r of existingWithPrefix) {
              const suffix = r.registrationNumber.slice(prefix.length);
              const num = parseInt(suffix, 10);
              if (!isNaN(num) && num > highestNumber) {
                highestNumber = num;
              }
            }

            const currentCount = await tx.registration.count({ where: { eventId } });
            const initialBase = Math.max(currentCount, highestNumber, existingWithPrefix.length);

            seq = await tx.registrationSequence.upsert({
              where: { eventId },
              create: { eventId, current: initialBase },
              update: {},
            });

            if (seq.current < initialBase) {
              seq = await tx.registrationSequence.update({
                where: { eventId },
                data: { current: initialBase },
              });
            }
          }

          let nextSeq = await tx.registrationSequence.update({
            where: { eventId },
            data: { current: { increment: 1 } },
          });

          let candidate = `${prefix}${String(nextSeq.current).padStart(4, '0')}`;

          while (
            await tx.registration.findUnique({
              where: {
                eventId_registrationNumber: {
                  eventId,
                  registrationNumber: candidate,
                },
              },
            })
          ) {
            nextSeq = await tx.registrationSequence.update({
              where: { eventId },
              data: { current: { increment: 1 } },
            });
            candidate = `${prefix}${String(nextSeq.current).padStart(4, '0')}`;
          }

          return candidate;
        });
      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 25 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('No se pudo generar un número de inscripción correlativo tras varios reintentos.');
  }

  /**
   * Generar un respaldo JSON completo y recuperable de las inscripciones de una edición
   */
  static async createEditionBackup(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        settings: true,
        registrations: {
          include: {
            participant: true,
            payments: true,
            attendanceLogs: true,
            ticketType: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_edition_${event.slug || eventId}_${timestamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    const backupData = {
      createdAt: new Date().toISOString(),
      platform: 'EventGrid',
      eventId: event.id,
      eventName: event.name,
      totalRegistrations: event.registrations.length,
      event,
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    return {
      fileName: backupFileName,
      filePath: backupFilePath,
      totalRegistrations: event.registrations.length,
    };
  }

  /**
   * Obtener una vista previa detallada del impacto antes de confirmar una eliminación
   */
  static async getDeletionPreview(
    eventId: string,
    scope: 'EXCEL_IMPORT' | 'ALL_EDITION' | 'BATCH' = 'EXCEL_IMPORT',
    batchId?: string
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const batches = await prisma.importBatch.findMany({
      where: { eventId },
      select: {
        id: true,
        fileName: true,
        importedRows: true,
        createdAt: true,
        _count: { select: { registrations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalRegistrations = await prisma.registration.count({ where: { eventId } });
    const importedRegistrations = await prisma.registration.count({
      where: {
        eventId,
        OR: [
          { source: 'EXCEL_IMPORT' },
          { importBatchId: { not: null } },
        ],
      },
    });
    const manualRegistrations = totalRegistrations - importedRegistrations;

    let targetCount = 0;
    let targetPaymentsCount = 0;
    let targetAttendanceCount = 0;

    let whereTarget: any = { eventId };
    if (scope === 'BATCH' && batchId) {
      whereTarget = { eventId, importBatchId: batchId };
    } else if (scope === 'EXCEL_IMPORT') {
      whereTarget = {
        eventId,
        OR: [
          { source: 'EXCEL_IMPORT' },
          { importBatchId: { not: null } },
        ],
      };
    } else if (scope === 'ALL_EDITION') {
      whereTarget = { eventId };
    }

    const targetRegs = await prisma.registration.findMany({
      where: whereTarget,
      select: { id: true, attended: true, _count: { select: { payments: true } } },
    });

    targetCount = targetRegs.length;
    targetAttendanceCount = targetRegs.filter((r) => r.attended).length;
    targetPaymentsCount = targetRegs.reduce((sum, r) => sum + r._count.payments, 0);

    return {
      eventId,
      eventName: event.name,
      scope,
      selectedBatchId: batchId || null,
      totalRegistrations,
      importedRegistrations,
      manualRegistrations,
      targetCount,
      targetPaymentsCount,
      targetAttendanceCount,
      batches: batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        importedRows: b.importedRows,
        registrationsCount: b._count.registrations,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Eliminar participantes importados desde Excel (un lote específico o todos los de la edición)
   */
  static async deleteImported(eventId: string, batchId?: string, operatorUserId?: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    if (await prisma.registration.count({ where: { eventId, attended: true, ...(batchId ? { importBatchId: batchId } : { OR: [{ source: 'EXCEL_IMPORT' }, { importBatchId: { not: null } }] }) } })) throw new BadRequestError('No puede eliminar inscripciones con asistencia confirmada.');

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Edición no encontrada');

    let whereTarget: any = {
      eventId,
      OR: [
        { source: 'EXCEL_IMPORT' },
        { importBatchId: { not: null } },
      ],
    };

    let targetBatch: any = null;
    if (batchId) {
      targetBatch = await prisma.importBatch.findFirst({
        where: { id: batchId, eventId },
      });
      if (!targetBatch) {
        throw new NotFoundError('Lote de importación no encontrado en esta edición');
      }
      whereTarget = { eventId, importBatchId: batchId };
    }

    const regs = await prisma.registration.findMany({
      where: whereTarget,
      select: { id: true, participantId: true },
    });

    const regIds = regs.map((r) => r.id);
    const participantIds = Array.from(new Set(regs.map((r) => r.participantId)));

    let deletedPaymentsCount = 0;
    let deletedAttendanceCount = 0;
    let deletedRegistrationsCount = 0;
    let deletedParticipantsCount = 0;

    if (regIds.length > 0) {
      // 1. Eliminar pagos asociados
      const pRes = await prisma.payment.deleteMany({
        where: { registrationId: { in: regIds } },
      });
      deletedPaymentsCount = pRes.count;

      // 2. Eliminar logs de asistencia asociados
      const aRes = await prisma.attendanceLog.deleteMany({
        where: { registrationId: { in: regIds } },
      });
      deletedAttendanceCount = aRes.count;

      // 3. Desvincular de envíos de email
      await prisma.emailBatchItem.updateMany({
        where: { registrationId: { in: regIds } },
        data: { registrationId: null },
      });
      await prisma.emailLog.updateMany({
        where: { registrationId: { in: regIds } },
        data: { registrationId: null },
      });

      // 4. Eliminar las inscripciones
      const rRes = await prisma.registration.deleteMany({
        where: { id: { in: regIds } },
      });
      deletedRegistrationsCount = rRes.count;
    }

    // 5. Eliminar participantes huérfanos que ya no tengan inscripciones en ningún evento
    for (const pId of participantIds) {
      const remaining = await prisma.registration.count({
        where: { participantId: pId },
      });
      if (remaining === 0) {
        await prisma.participant.delete({ where: { id: pId } }).catch(() => {});
        deletedParticipantsCount++;
      }
    }

    // 6. Eliminar lotes y errores de importación correspondientes
    if (batchId) {
      await prisma.importError.deleteMany({ where: { importBatchId: batchId } });
      await prisma.importBatch.delete({ where: { id: batchId } }).catch(() => {});
    } else {
      const allBatches = await prisma.importBatch.findMany({
        where: { eventId },
        select: { id: true },
      });
      const bIds = allBatches.map((b) => b.id);
      if (bIds.length > 0) {
        await prisma.importError.deleteMany({ where: { importBatchId: { in: bIds } } });
        await prisma.importBatch.deleteMany({ where: { eventId } });
      }
    }

    // 7. Notificación en tiempo real para todos los clientes conectados
    RealtimeService.emit(eventId, {
      type: 'PARTICIPANTS_DELETED',
      data: {
        eventId,
        scope: batchId ? 'BATCH' : 'EXCEL_IMPORT',
        batchId: batchId || null,
        deletedRegistrationsCount,
        deletedParticipantsCount,
      },
    });

    return {
      scope: batchId ? 'BATCH' : 'EXCEL_IMPORT',
      batchId: batchId || null,
      fileName: targetBatch?.fileName || null,
      deletedRegistrationsCount,
      deletedParticipantsCount,
      deletedPaymentsCount,
      deletedAttendanceCount,
      message: batchId
        ? `Lote '${targetBatch?.fileName}' y sus ${deletedRegistrationsCount} participantes importados fueron eliminados.`
        : `Se eliminaron ${deletedRegistrationsCount} participantes importados desde Excel de la edición.`,
    };

    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  /**
   * Vaciar absolutamente todos los participantes de una edición (manuales e importados)
   * Requiere autorización explícita con frase de confirmación y crea un respaldo previo.
   */
  static async purgeEdition(eventId: string, confirmationPhrase: string, operatorUserId?: string) {
    return writeTransaction(async tx => {
    const prisma = tx;
    if (await prisma.registration.count({ where: { eventId, attended: true } })) throw new BadRequestError('No puede eliminar inscripciones con asistencia confirmada.');

    if (!confirmationPhrase || confirmationPhrase.trim().toUpperCase() !== 'ELIMINAR PARTICIPANTES') {
      throw new BadRequestError('Frase de confirmación incorrecta. Debe escribir exactamente: ELIMINAR PARTICIPANTES');
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    // 1. Respaldo previo de seguridad obligatorio
    const backupResult = await ParticipantsService.createEditionBackup(eventId);

    // 2. Obtener todas las inscripciones de esta edición
    const allRegs = await prisma.registration.findMany({
      where: { eventId },
      select: { id: true, participantId: true },
    });

    const regIds = allRegs.map((r) => r.id);
    const participantIds = Array.from(new Set(allRegs.map((r) => r.participantId)));

    let deletedPaymentsCount = 0;
    let deletedAttendanceCount = 0;
    let deletedRegistrationsCount = 0;
    let deletedParticipantsCount = 0;

    if (regIds.length > 0) {
      // Eliminar pagos asociados
      const pRes = await prisma.payment.deleteMany({
        where: { registrationId: { in: regIds } },
      });
      deletedPaymentsCount = pRes.count;

      // Eliminar logs de asistencia asociados
      const aRes = await prisma.attendanceLog.deleteMany({
        where: { registrationId: { in: regIds } },
      });
      deletedAttendanceCount = aRes.count;

      // Desvincular de envíos de email
      await prisma.emailBatchItem.updateMany({
        where: { registrationId: { in: regIds } },
        data: { registrationId: null },
      });
      await prisma.emailLog.updateMany({
        where: { registrationId: { in: regIds } },
        data: { registrationId: null },
      });

      // Eliminar todas las inscripciones de la edición
      const rRes = await prisma.registration.deleteMany({
        where: { id: { in: regIds } },
      });
      deletedRegistrationsCount = rRes.count;
    }

    // Limpiar participantes huérfanos
    for (const pId of participantIds) {
      const remaining = await prisma.registration.count({
        where: { participantId: pId },
      });
      if (remaining === 0) {
        await prisma.participant.delete({ where: { id: pId } }).catch(() => {});
        deletedParticipantsCount++;
      }
    }

    // Limpiar lotes y errores de importación de la edición
    const batches = await prisma.importBatch.findMany({
      where: { eventId },
      select: { id: true },
    });
    const bIds = batches.map((b) => b.id);
    if (bIds.length > 0) {
      await prisma.importError.deleteMany({ where: { importBatchId: { in: bIds } } });
      await prisma.importBatch.deleteMany({ where: { eventId } });
    }

    // Restablecer correlativo de números de inscripción
    await prisma.registrationSequence.upsert({
      where: { eventId },
      update: { current: 0 },
      create: { eventId, current: 0 },
    });

    // Notificación en tiempo real
    RealtimeService.emit(eventId, {
      type: 'PARTICIPANTS_DELETED',
      data: {
        eventId,
        scope: 'ALL_EDITION',
        deletedRegistrationsCount,
        deletedParticipantsCount,
      },
    });

    return {
      scope: 'ALL_EDITION',
      eventName: event.name,
      backupFile: backupResult.fileName,
      deletedRegistrationsCount,
      deletedParticipantsCount,
      deletedPaymentsCount,
      deletedAttendanceCount,
      message: `Se vaciaron exitosamente todos los participantes (${deletedRegistrationsCount}) de la edición '${event.name}'. Respaldo guardado en ${backupResult.fileName}.`,
    };

    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

}
