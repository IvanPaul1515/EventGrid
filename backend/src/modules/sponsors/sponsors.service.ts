import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError, ConflictError } from '../../utils/errors.js';
import {
  CreateSponsorInput,
  UpdateSponsorInput,
  CreatePaymentInput,
  AnnullPaymentInput,
  QuerySponsorsInput,
} from './sponsors.dto.js';

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function resolveStatus(
  contributionType: string,
  committedAmount: number,
  receivedAmount: number,
  manualStatus?: string
): string {
  if (manualStatus === 'CANCELLED') return 'CANCELLED';
  if (contributionType === 'IN_KIND') {
    return manualStatus || 'PAID';
  }
  const committed = roundMoney(committedAmount);
  const received = roundMoney(receivedAmount);
  if (received >= committed && committed > 0) {
    return 'PAID';
  }
  if (received > 0) {
    return 'PARTIALLY_PAID';
  }
  return 'PENDING';
}

export class SponsorsService {
  /**
   * Obtener resumen de KPIs de patrocinadores y colaboradores para la edición
   */
  static async getSummary(eventId: string) {
    const sponsors = await prisma.sponsor.findMany({
      where: { eventId, isArchived: false },
      include: {
        payments: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    let totalSponsors = 0;
    let totalCollaborators = 0;
    let totalCommitted = 0;
    let totalReceived = 0;
    let inKindCount = 0;
    let paidCount = 0;
    let partiallyPaidCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;

    for (const s of sponsors) {
      if (s.type === 'SPONSOR') totalSponsors++;
      if (s.type === 'COLLABORATOR') totalCollaborators++;
      if (s.contributionType === 'IN_KIND' || s.contributionType === 'MIXED') inKindCount++;

      if (s.status !== 'CANCELLED') {
        totalCommitted += Number(s.committedAmount);
      }

      // Sumar pagos activos
      const activePaymentsTotal = s.payments.reduce((acc, p) => acc + Number(p.amount), 0);
      totalReceived += activePaymentsTotal;

      if (s.status === 'PAID') paidCount++;
      else if (s.status === 'PARTIALLY_PAID') partiallyPaidCount++;
      else if (s.status === 'CANCELLED') cancelledCount++;
      else pendingCount++;
    }

    totalCommitted = roundMoney(totalCommitted);
    totalReceived = roundMoney(totalReceived);
    const totalPending = Math.max(0, roundMoney(totalCommitted - totalReceived));

    return {
      totalSponsors,
      totalCollaborators,
      totalCount: sponsors.length,
      totalCommitted,
      totalReceived,
      totalPending,
      inKindCount,
      paidCount,
      partiallyPaidCount,
      pendingCount,
      cancelledCount,
    };
  }

  /**
   * Listar patrocinadores y colaboradores con filtros, búsqueda y paginación
   */
  static async getSponsors(eventId: string, query: QuerySponsorsInput) {
    const where: any = { eventId };

    if (!query.includeArchived) {
      where.isArchived = false;
    }

    if (query.type && query.type !== 'ALL') {
      where.type = query.type;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.contributionType && query.contributionType !== 'ALL') {
      where.contributionType = query.contributionType;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term } },
        { contactName: { contains: term } },
        { contactEmail: { contains: term } },
        { category: { contains: term } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [total, items, summary] = await Promise.all([
      prisma.sponsor.count({ where }),
      prisma.sponsor.findMany({
        where,
        include: {
          payments: {
            where: { status: 'ACTIVE' },
            orderBy: { paymentDate: 'desc' },
          },
          _count: {
            select: { payments: true },
          },
        },
        orderBy: [{ isArchived: 'asc' }, { committedAmount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.getSummary(eventId),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
    };
  }

  /**
   * Obtener detalle completo de un patrocinador con su historial de pagos
   */
  static async getSponsorById(id: string, eventId?: string) {
    const where: any = { id };
    if (eventId) where.eventId = eventId;

    const sponsor = await prisma.sponsor.findFirst({
      where,
      include: {
        event: {
          select: { id: true, name: true, year: true },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!sponsor) {
      throw new NotFoundError('Patrocinador no encontrado');
    }

    return sponsor;
  }

  /**
   * Registrar nuevo patrocinador o colaborador
   */
  static async createSponsor(eventId: string, input: CreateSponsorInput, userId?: string) {
    // Validar existencia de la edición
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundError('Edición del evento no encontrada');
    }

    // Protección contra duplicados accidentales por nombre en la misma edición
    const existing = await prisma.sponsor.findFirst({
      where: {
        eventId,
        name: { equals: input.name.trim() },
      },
    });

    if (existing) {
      throw new ConflictError(
        `Ya existe un patrocinador o colaborador con el nombre "${input.name.trim()}" en esta edición.`
      );
    }

    const committed = roundMoney(input.committedAmount || 0);
    const initialReceived = 0;
    const pending = Math.max(0, committed);
    const status = resolveStatus(input.contributionType, committed, initialReceived, input.status);

    const sponsor = await prisma.sponsor.create({
      data: {
        eventId,
        name: input.name.trim(),
        type: input.type,
        category: input.category?.trim() || null,
        contactName: input.contactName?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        contributionType: input.contributionType,
        inKindDescription: input.inKindDescription?.trim() || null,
        committedAmount: committed,
        receivedAmount: initialReceived,
        pendingBalance: pending,
        commitmentDate: input.commitmentDate || new Date(),
        status,
        createdByUserId: userId || null,
      },
      include: {
        payments: true,
      },
    });

    return sponsor;
  }

  /**
   * Actualizar patrocinador o colaborador
   */
  static async updateSponsor(id: string, input: UpdateSponsorInput, userId?: string, eventId?: string) {
    const existing = await this.getSponsorById(id, eventId);

    // Si cambia el nombre, validar duplicado en la misma edición
    if (input.name && input.name.trim() !== existing.name) {
      const duplicate = await prisma.sponsor.findFirst({
        where: {
          eventId: existing.eventId,
          name: { equals: input.name.trim() },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new BadRequestError(
          `Ya existe otro patrocinador o colaborador con el nombre "${input.name.trim()}" en esta edición.`
        );
      }
    }

    // Calcular montos y estados actualizados
    const activePayments = await prisma.sponsorPayment.findMany({
      where: { sponsorId: id, status: 'ACTIVE' },
    });
    const receivedAmount = roundMoney(activePayments.reduce((acc, p) => acc + Number(p.amount), 0));
    const committedAmount = input.committedAmount !== undefined
      ? roundMoney(input.committedAmount)
      : roundMoney(Number(existing.committedAmount));

    const pendingBalance = Math.max(0, roundMoney(committedAmount - receivedAmount));
    const contributionType = input.contributionType || existing.contributionType;
    const status = resolveStatus(contributionType, committedAmount, receivedAmount, input.status || existing.status);

    const updated = await prisma.sponsor.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName?.trim() || null } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone?.trim() || null } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail?.trim() || null } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.contributionType !== undefined ? { contributionType: input.contributionType } : {}),
        ...(input.inKindDescription !== undefined ? { inKindDescription: input.inKindDescription?.trim() || null } : {}),
        committedAmount,
        receivedAmount,
        pendingBalance,
        ...(input.commitmentDate !== undefined ? { commitmentDate: input.commitmentDate } : {}),
        status,
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        updatedByUserId: userId || null,
      },
      include: {
        payments: {
          where: { status: 'ACTIVE' },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    return updated;
  }

  /**
   * Archivar / Desarchivar patrocinador sin eliminar datos históricos
   */
  static async archiveSponsor(id: string, isArchived: boolean, userId?: string, eventId?: string) {
    await this.getSponsorById(id, eventId);

    const updated = await prisma.sponsor.update({
      where: { id },
      data: {
        isArchived,
        updatedByUserId: userId || null,
      },
    });

    return updated;
  }

  /**
   * Registrar pago a un patrocinador o colaborador
   */
  static async registerPayment(sponsorId: string, input: CreatePaymentInput, userId?: string, eventId?: string) {
    const sponsor = await this.getSponsorById(sponsorId, eventId);

    if (sponsor.status === 'CANCELLED') {
      throw new BadRequestError('No se pueden registrar pagos a un patrocinador con estado Cancelado.');
    }

    const paymentAmount = roundMoney(input.amount);
    if (paymentAmount <= 0) {
      throw new BadRequestError('El monto del pago debe ser mayor que cero.');
    }

    // Transacción para registrar el pago y recalcular balances atómicamente
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.sponsorPayment.create({
        data: {
          sponsorId,
          amount: paymentAmount,
          paymentDate: input.paymentDate || new Date(),
          paymentMethod: input.paymentMethod,
          reference: input.reference?.trim() || null,
          receiptNumber: input.receiptNumber?.trim() || null,
          notes: input.notes?.trim() || null,
          recordedByUserId: userId || null,
          status: 'ACTIVE',
        },
      });

      // Recalcular montos de pagos activos
      const activePayments = await tx.sponsorPayment.findMany({
        where: { sponsorId, status: 'ACTIVE' },
      });
      const totalReceived = roundMoney(activePayments.reduce((acc, p) => acc + Number(p.amount), 0));
      const committed = roundMoney(Number(sponsor.committedAmount));
      const pendingBalance = Math.max(0, roundMoney(committed - totalReceived));
      const newStatus = resolveStatus(sponsor.contributionType, committed, totalReceived, sponsor.status);

      const updatedSponsor = await tx.sponsor.update({
        where: { id: sponsorId },
        data: {
          receivedAmount: totalReceived,
          pendingBalance,
          status: newStatus,
          updatedByUserId: userId || null,
        },
        include: {
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
        },
      });

      return { payment, sponsor: updatedSponsor };
    });

    return result;
  }

  /**
   * Anular un pago conservando trazabilidad histórica (sin eliminación física silenciosa)
   */
  static async annullPayment(paymentId: string, input: AnnullPaymentInput, userId?: string, eventId?: string) {
    const payment = await prisma.sponsorPayment.findUnique({
      where: { id: paymentId },
      include: { sponsor: true },
    });

    if (!payment) {
      throw new NotFoundError('Pago no encontrado');
    }

    if (eventId && payment.sponsor.eventId !== eventId) {
      throw new NotFoundError('El pago no pertenece a esta edición');
    }

    if (payment.status === 'ANNULLED') {
      throw new BadRequestError('Este pago ya fue anulado previamente.');
    }

    // Transacción para anular el pago y recalcular balances
    const result = await prisma.$transaction(async (tx) => {
      const annulledPayment = await tx.sponsorPayment.update({
        where: { id: paymentId },
        data: {
          status: 'ANNULLED',
          annulledAt: new Date(),
          annulledReason: input.reason.trim(),
          annulledByUserId: userId || null,
        },
      });

      const sponsorId = payment.sponsorId;
      const activePayments = await tx.sponsorPayment.findMany({
        where: { sponsorId, status: 'ACTIVE' },
      });
      const totalReceived = roundMoney(activePayments.reduce((acc, p) => acc + Number(p.amount), 0));
      const committed = roundMoney(Number(payment.sponsor.committedAmount));
      const pendingBalance = Math.max(0, roundMoney(committed - totalReceived));
      const newStatus = resolveStatus(
        payment.sponsor.contributionType,
        committed,
        totalReceived,
        payment.sponsor.status
      );

      const updatedSponsor = await tx.sponsor.update({
        where: { id: sponsorId },
        data: {
          receivedAmount: totalReceived,
          pendingBalance,
          status: newStatus,
          updatedByUserId: userId || null,
        },
        include: {
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
        },
      });

      return { payment: annulledPayment, sponsor: updatedSponsor };
    });

    return result;
  }
}
