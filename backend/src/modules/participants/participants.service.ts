import { prisma } from '../../config/db.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors.js';
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

    if (paymentMethodId) whereClause.paymentMethodId = paymentMethodId;
    if (ticketTypeId) whereClause.ticketTypeId = ticketTypeId;
    if (salesResponsibleId) whereClause.salesResponsibleId = salesResponsibleId;
    if (status) whereClause.status = status;
    if (isVerified !== undefined) whereClause.isVerified = isVerified;
    if (isCourtesy !== undefined) whereClause.isCourtesy = isCourtesy;

    if (search && search.trim() !== '') {
      const s = search.trim();
      whereClause.OR = [
        { registrationNumber: { contains: s } },
        { participant: { fullName: { contains: s } } },
        { participant: { email: { contains: s } } },
        { participant: { documentId: { contains: s } } },
        { participant: { phone: { contains: s } } },
        { participant: { institution: { contains: s } } },
      ];
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
        where: { eventId },
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
      if (r.status === 'CONFIRMED' || r.status === 'ATTENDED') confirmedCount++;
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
  static async getById(eventId: string, registrationId: string) {
    const registration = await prisma.registration.findFirst({
      where: {
        id: registrationId,
        eventId,
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
        attendedByUser: { select: { id: true, fullName: true, email: true } },
        courtesyUser: { select: { id: true, fullName: true, email: true } },
        payments: {
          include: {
            paymentMethod: true,
            receivedByUser: { select: { id: true, fullName: true, email: true } },
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

    const otherRegistrations = await prisma.registration.findMany({
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
    });

    let customFields: any = registration.customFields;
    if (typeof customFields === 'string') {
      try {
        customFields = JSON.parse(customFields);
      } catch {
        customFields = {};
      }
    }

    return {
      ...registration,
      customFields,
      editionHistory: otherRegistrations.map((or) => ({
        registrationId: or.id,
        editionId: or.eventId,
        editionName: or.event.name,
        year: or.event.year,
        registrationNumber: or.registrationNumber,
        ticketTypeName: or.ticketType?.name || 'General',
        status: or.status,
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
  static async create(eventId: string, input: CreateRegistrationInput) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true, paymentMethods: true, ticketTypes: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const cleanEmail = input.email.toLowerCase().trim();
    const cleanDoc = input.documentId ? input.documentId.trim() : null;
    const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
    const cleanInstitution = input.institution ? input.institution.trim() : null;

    // 1. Resolver Tipo de Entrada y Precios
    let ticketType = null;
    if (input.ticketTypeId) {
      ticketType = event.ticketTypes.find((t) => t.id === input.ticketTypeId);
    }

    let isCourtesy = input.isCourtesy || false;
    let paymentMethodId = input.paymentMethodId || null;

    if (ticketType && (ticketType.price === 0 || ticketType.name.toLowerCase().includes('cortes'))) {
      isCourtesy = true;
    }

    if (paymentMethodId) {
      const pm = event.paymentMethods.find((m) => m.id === paymentMethodId);
      if (pm && pm.name.toLowerCase().includes('cortes')) {
        isCourtesy = true;
      }
    } else if (isCourtesy) {
      const courtesyMethod = event.paymentMethods.find((m) => m.name.toLowerCase().includes('cortes'));
      if (courtesyMethod) {
        paymentMethodId = courtesyMethod.id;
      }
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

    // 4. Generar número de registro único si no fue suministrado
    let regNumber = input.registrationNumber?.trim();
    if (!regNumber) {
      const prefix = event.settings?.registrationPrefix || `BC${String(event.year).slice(-2)}-`;
      const count = await prisma.registration.count({ where: { eventId } });
      let candidateNum = count + 1;
      let isUnique = false;

      while (!isUnique) {
        regNumber = `${prefix}${String(candidateNum).padStart(4, '0')}`;
        const conflict = await prisma.registration.findUnique({
          where: {
            eventId_registrationNumber: {
              eventId,
              registrationNumber: regNumber,
            },
          },
        });
        if (!conflict) isUnique = true;
        else candidateNum++;
      }
    } else {
      const conflict = await prisma.registration.findUnique({
        where: {
          eventId_registrationNumber: {
            eventId,
            registrationNumber: regNumber,
          },
        },
      });
      if (conflict) {
        throw new ConflictError(`El número de registro '${regNumber}' ya está en uso en esta edición`);
      }
    }

    // 5. Crear inscripción
    const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
    const customFieldsData = input.customFields
      ? (isSqlite ? JSON.stringify(input.customFields) : input.customFields)
      : null;

    const registration = await prisma.registration.create({
      data: {
        eventId,
        participantId: participant.id,
        registrationNumber: regNumber!,
        source: 'MANUAL',
        ticketTypeId: ticketType ? ticketType.id : null,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: isCourtesy ? true : (input.isVerified || (amountPaid > 0)),
        isCourtesy,
        courtesyAuthorizedBy: isCourtesy ? (input.courtesyAuthorizedBy || 'Comité Organizador') : null,
        courtesyReason: isCourtesy ? (input.courtesyReason || null) : null,
        courtesyDate: isCourtesy ? new Date() : null,
        isDemo: input.isDemo || false,
        paymentMethodId,
        salesResponsibleId: input.salesResponsibleId || null,
        saleTimestamp: input.saleTimestamp ? new Date(input.saleTimestamp) : new Date(),
        status: input.status || (balanceDue === 0 || isCourtesy ? 'CONFIRMED' : 'PENDING'),
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
    if (amountPaid > 0 && paymentMethodId) {
      await prisma.payment.create({
        data: {
          registrationId: registration.id,
          amount: amountPaid,
          paymentMethodId,
          notes: 'Pago inicial de inscripción manual',
        },
      });
    }

    return registration;
  }

  /**
   * Actualizar registro existente
   */
  static async update(eventId: string, registrationId: string, input: UpdateRegistrationInput) {
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
      if (ticketType && (ticketType.price === 0 || ticketType.name.toLowerCase().includes('cortes'))) {
        isCourtesy = true;
      }
    }

    if (paymentMethodId) {
      const pm = existing.event.paymentMethods.find((m) => m.id === paymentMethodId);
      if (pm && pm.name.toLowerCase().includes('cortes')) {
        isCourtesy = true;
      }
    }

    let ticketPrice = existing.ticketPrice ? Number(existing.ticketPrice) : Number(existing.totalAmount);
    if (input.ticketPrice !== undefined) {
      ticketPrice = Number(input.ticketPrice);
    } else if (ticketType) {
      ticketPrice = Number(ticketType.price);
    }

    let amountPaid = existing.amountPaid !== undefined && existing.amountPaid !== null
      ? Number(existing.amountPaid)
      : Number(existing.totalAmount);
    if (input.amountPaid !== undefined) {
      amountPaid = Number(input.amountPaid);
    } else if (input.totalAmount !== undefined) {
      amountPaid = Number(input.totalAmount);
    }

    let balanceDue = Math.max(0, ticketPrice - amountPaid);
    if (isCourtesy) {
      ticketPrice = 0;
      amountPaid = 0;
      balanceDue = 0;
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
        ticketTypeId,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: isCourtesy ? true : (input.isVerified !== undefined ? input.isVerified : existing.isVerified),
        isCourtesy,
        courtesyAuthorizedBy: isCourtesy
          ? (input.courtesyAuthorizedBy !== undefined ? input.courtesyAuthorizedBy : existing.courtesyAuthorizedBy)
          : null,
        courtesyReason: isCourtesy
          ? (input.courtesyReason !== undefined ? input.courtesyReason : existing.courtesyReason)
          : null,
        paymentMethodId,
        salesResponsibleId: input.salesResponsibleId !== undefined ? input.salesResponsibleId : undefined,
        saleTimestamp: input.saleTimestamp ? new Date(input.saleTimestamp) : undefined,
        status: input.status !== undefined ? input.status : undefined,
        notes: input.notes !== undefined ? input.notes : undefined,
        customFields: customFieldsData as any,
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        salesResponsible: true,
      },
    });

    return updated;
  }

  /**
   * Venta presencial en recepción ("Nueva venta")
   */
  static async onsiteSale(eventId: string, input: OnsiteSaleInput, operatorUserId: string) {
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
      ticketType.price === 0 ||
      ticketType.name.toLowerCase().includes('cortes') ||
      !!input.courtesyAuthorizedBy;

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

    // 3. Generar número de registro único
    const prefix = event.settings?.registrationPrefix || `BC${String(event.year).slice(-2)}-`;
    const count = await prisma.registration.count({ where: { eventId } });
    let candidateNum = count + 1;
    let regNumber = `${prefix}${String(candidateNum).padStart(4, '0')}`;

    while (await prisma.registration.findUnique({ where: { eventId_registrationNumber: { eventId, registrationNumber: regNumber } } })) {
      candidateNum++;
      regNumber = `${prefix}${String(candidateNum).padStart(4, '0')}`;
    }

    const now = new Date();

    // 4. Crear la inscripción
    const registration = await prisma.registration.create({
      data: {
        eventId,
        participantId: participant.id,
        registrationNumber: regNumber,
        source: 'ONSITE_SALE',
        ticketTypeId: ticketType.id,
        ticketPrice,
        amountPaid,
        balanceDue,
        totalAmount: amountPaid,
        isVerified: true,
        isCourtesy,
        courtesyAuthorizedBy: isCourtesy ? (input.courtesyAuthorizedBy || 'Comité Organizador') : null,
        courtesyReason: isCourtesy ? (input.courtesyReason || 'Cortesía presencial en recepción') : null,
        courtesyDate: isCourtesy ? now : null,
        courtesyUserId: isCourtesy ? operatorUserId : null,
        paymentMethodId: isCourtesy ? null : input.paymentMethodId || null,
        status: balanceDue === 0 || isCourtesy ? 'CONFIRMED' : 'PENDING',
        notes: input.notes || null,
        saleTimestamp: now,
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
      },
    });

    // 5. Registrar abono en el libro de pagos si amountPaid > 0
    let recordedPayment = null;
    if (amountPaid > 0 && input.paymentMethodId) {
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
  }

  /**
   * Registrar abono o pago adicional
   */
  static async recordPayment(eventId: string, registrationId: string, input: RecordPaymentInput, userId: string) {
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

    const paymentAmount = Number(input.amount);
    const currentPaid = Number(registration.amountPaid ?? registration.totalAmount ?? 0);
    const ticketPrice = Number(registration.ticketPrice ?? registration.totalAmount ?? 0);
    const newAmountPaid = currentPaid + paymentAmount;
    const newBalanceDue = Math.max(0, ticketPrice - newAmountPaid);

    const [payment, updatedRegistration] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          registrationId,
          amount: paymentAmount,
          paymentMethodId: input.paymentMethodId,
          notes: input.notes || null,
          receivedByUserId: userId,
        },
        include: {
          paymentMethod: true,
          receivedByUser: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.registration.update({
        where: { id: registrationId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          totalAmount: newAmountPaid,
          isVerified: true,
          status: newBalanceDue === 0 && registration.status === 'PENDING' ? 'CONFIRMED' : registration.status,
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

    return {
      payment,
      registration: updatedRegistration,
    };
  }

  /**
   * Cancelar inscripción (Solo ADMIN)
   * REGLA: No borra datos ni pagos históricos, ni genera reembolsos automáticos.
   */
  static async cancelRegistration(eventId: string, registrationId: string, reason: string, adminUserId: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    if (registration.status === 'CANCELLED') {
      throw new BadRequestError('La inscripción ya se encuentra cancelada');
    }

    const noteEntry = `[CANCELACIÓN ${new Date().toLocaleString('es-DO')}]: ${reason}`;
    const newNotes = registration.notes ? `${registration.notes}\n${noteEntry}` : noteEntry;

    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: 'CANCELLED',
        notes: newNotes,
      },
      include: {
        participant: true,
        ticketType: true,
      },
    });

    return updated;
  }

  /**
   * Reactivar inscripción cancelada (Solo ADMIN)
   */
  static async reactivateRegistration(eventId: string, registrationId: string, reason: string, adminUserId: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

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
      },
      include: {
        participant: true,
        ticketType: true,
      },
    });

    return updated;
  }

  /**
   * Asignar cortesía a un participante
   */
  static async assignCourtesy(eventId: string, registrationId: string, input: AssignCourtesyInput, adminUserId: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      include: { participant: true },
    });

    if (!registration) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

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
        courtesyAuthorizedBy: input.authorizedBy,
        courtesyReason: input.reason,
        courtesyDate: new Date(),
        courtesyUserId: adminUserId,
        ticketTypeId: courtesyTicketType ? courtesyTicketType.id : registration.ticketTypeId,
        ticketPrice: 0,
        balanceDue: 0,
        isVerified: true,
        status: registration.attended ? 'ATTENDED' : 'CONFIRMED',
      },
      include: {
        participant: true,
        ticketType: true,
        courtesyUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    return updated;
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
      include: { participant: true },
    });

    if (!existing) {
      throw new NotFoundError('Inscripción no encontrada en la edición activa');
    }

    await prisma.registration.delete({
      where: { id: registrationId },
    });

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
    const institutions = ['PUCMM', 'ITLA', 'INTEC', 'UASD', 'Banco BHD', 'Claro Dominicana', 'Altice', 'Popular', 'Freelance / Dev'];

    const prefix = event.settings?.registrationPrefix || `BC${String(event.year).slice(-2)}-`;
    const startCount = await prisma.registration.count({ where: { eventId } });

    const generalTicket = event.ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa')) || event.ticketTypes[0];
    const presaleTicket = event.ticketTypes.find((t) => t.name.toLowerCase().includes('preventa')) || generalTicket;
    const courtesyTicket = event.ticketTypes.find((t) => t.price === 0) || null;

    let createdCount = 0;

    for (let i = 0; i < count; i++) {
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const inst = institutions[Math.floor(Math.random() * institutions.length)];
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const email = `demo.${fName.toLowerCase()}.${lName.toLowerCase()}${randSuffix}@barcampdemo.do`;
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
          courtesyAuthorizedBy: isCourtesy ? 'Dirección BarCamp RD' : null,
          courtesyReason: isCourtesy ? 'Beca institucional PUCMM' : null,
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
        { registrationNumber: { contains: s } },
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
        'Responsable de Venta': r.salesResponsible?.name || 'Comité Organizador',
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
}
