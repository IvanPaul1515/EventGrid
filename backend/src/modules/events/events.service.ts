import { prisma } from '../../config/db.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';

export class EventsService {
  static async getAll() {
    const events = await prisma.event.findMany({
      orderBy: { year: 'desc' },
      include: {
        settings: true,
        _count: {
          select: {
            registrations: true,
            importBatches: true,
          },
        },
      },
    });

    return events;
  }

  static async getById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        settings: true,
        ticketTypes: { where: { isActive: true }, orderBy: { price: 'desc' } },
        paymentMethods: { where: { isActive: true } },
        salesResponsibles: { where: { isActive: true } },
        customFieldDefinitions: true,
        _count: {
          select: {
            registrations: true,
            importBatches: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundError(`Edición no encontrada`);
    }

    return event;
  }

  static async create(data: any) {
    const existingSlug = await prisma.event.findUnique({
      where: { slug: data.slug },
    });

    if (existingSlug) {
      throw new ConflictError(`El identificador slug '${data.slug}' ya existe`);
    }

    // Si se marca como default, desmarcar los demás
    if (data.isDefault) {
      await prisma.event.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const event = await prisma.event.create({
      data: {
        name: data.name,
        slug: data.slug,
        year: data.year,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        venue: data.venue || 'PUCMM — Campus Santiago de los Caballeros, RD',
        description: data.description,
        status: data.status || 'PLANNING',
        isDefault: data.isDefault || false,
        settings: {
          create: {
            primaryColor: '#e11d48',
            secondaryColor: '#881337',
            backgroundColor: '#09090b',
            themeMode: 'dark',
            currencyCode: 'DOP',
            currencySymbol: 'RD$',
            subtitle: 'PUCMM — Santiago de los Caballeros',
            registrationPrefix: `BC${String(data.year).slice(-2)}-`,
          },
        },
      },
      include: {
        settings: true,
      },
    });

    // Métodos de pago base para la nueva edición
    const baseMethods = ['Efectivo', 'Transferencia Banco Popular', 'Transferencia Banco BHD', 'Tarjeta de Crédito / Débito'];
    for (const name of baseMethods) {
      await prisma.paymentMethod.create({
        data: {
          eventId: event.id,
          name,
        },
      });
    }

    return event;
  }

  static async update(id: string, data: any) {
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Edición no encontrada');

    if (data.isDefault) {
      await prisma.event.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      include: {
        settings: true,
      },
    });

    return updated;
  }

  static async updateSettings(eventId: string, settingsData: any) {
    const existing = await prisma.eventSettings.findUnique({ where: { eventId } });
    if (!existing) throw new NotFoundError('Ajustes de edición no encontrados');

    const updated = await prisma.eventSettings.update({
      where: { eventId },
      data: settingsData,
    });

    return updated;
  }

  static async cloneEdition(sourceEventId: string, cloneData: any) {
    const sourceEvent = await prisma.event.findUnique({
      where: { id: sourceEventId },
      include: {
        settings: true,
        ticketTypes: true,
        paymentMethods: true,
        salesResponsibles: true,
        customFieldDefinitions: true,
      },
    });

    if (!sourceEvent) {
      throw new NotFoundError('Edición de origen no encontrada');
    }

    const existingSlug = await prisma.event.findUnique({
      where: { slug: cloneData.slug },
    });
    if (existingSlug) {
      throw new ConflictError(`El identificador slug '${cloneData.slug}' ya existe`);
    }

    // Crear la nueva edición
    const newEvent = await prisma.event.create({
      data: {
        name: cloneData.name,
        slug: cloneData.slug,
        year: cloneData.year,
        startDate: new Date(cloneData.startDate),
        endDate: new Date(cloneData.endDate),
        venue: cloneData.venue || sourceEvent.venue,
        description: cloneData.description || `Edición clonada a partir de ${sourceEvent.name}`,
        status: 'PLANNING',
        isDefault: false,
        settings: cloneData.copySettings && sourceEvent.settings ? {
          create: {
            primaryColor: sourceEvent.settings.primaryColor,
            secondaryColor: sourceEvent.settings.secondaryColor,
            backgroundColor: sourceEvent.settings.backgroundColor,
            themeMode: sourceEvent.settings.themeMode,
            currencyCode: sourceEvent.settings.currencyCode,
            currencySymbol: sourceEvent.settings.currencySymbol,
            subtitle: sourceEvent.settings.subtitle,
            registrationPrefix: `BC${String(cloneData.year).slice(-2)}-`,
          },
        } : {
          create: {
            primaryColor: '#e11d48',
            secondaryColor: '#881337',
            registrationPrefix: `BC${String(cloneData.year).slice(-2)}-`,
          },
        },
      },
      include: { settings: true },
    });

    // Copiar Tipos de Entrada
    if (sourceEvent.ticketTypes && sourceEvent.ticketTypes.length > 0) {
      for (const tt of sourceEvent.ticketTypes) {
        await prisma.ticketType.create({
          data: {
            eventId: newEvent.id,
            name: tt.name,
            price: tt.price,
            description: tt.description,
            isActive: tt.isActive,
          },
        });
      }
    }

    // Copiar Métodos de Pago si se solicitó
    if (cloneData.copyPaymentMethods && sourceEvent.paymentMethods.length > 0) {
      for (const pm of sourceEvent.paymentMethods) {
        await prisma.paymentMethod.create({
          data: {
            eventId: newEvent.id,
            name: pm.name,
            code: pm.code,
            isActive: pm.isActive,
          },
        });
      }
    }

    // Copiar Responsables de Venta si se solicitó
    if (cloneData.copySalesResponsibles && sourceEvent.salesResponsibles.length > 0) {
      for (const sr of sourceEvent.salesResponsibles) {
        await prisma.salesResponsible.create({
          data: {
            eventId: newEvent.id,
            name: sr.name,
            email: sr.email,
            role: sr.role,
            isActive: sr.isActive,
          },
        });
      }
    }

    // Copiar Definiciones de Campos Personalizados si se solicitó
    if (cloneData.copyCustomFields && sourceEvent.customFieldDefinitions.length > 0) {
      for (const cf of sourceEvent.customFieldDefinitions) {
        await prisma.customFieldDefinition.create({
          data: {
            eventId: newEvent.id,
            key: cf.key,
            label: cf.label,
            fieldType: cf.fieldType,
            options: cf.options || undefined,
          },
        });
      }
    }

    return newEvent;
  }

  static async getTicketTypes(eventId: string) {
    return prisma.ticketType.findMany({
      where: { eventId, isActive: true },
      orderBy: { price: 'desc' },
    });
  }

  static async createTicketType(eventId: string, data: { name: string; price: number; description?: string }) {
    return prisma.ticketType.create({
      data: {
        eventId,
        name: data.name.trim(),
        price: data.price,
        description: data.description?.trim(),
      },
    });
  }

  static async updateTicketType(
    eventId: string,
    ticketTypeId: string,
    data: { name?: string; price?: number; description?: string; isActive?: boolean }
  ) {
    const existing = await prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
    });
    if (!existing) throw new NotFoundError('Tipo de entrada no encontrado en la edición activa');

    return prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: {
        name: data.name ? data.name.trim() : undefined,
        price: data.price !== undefined ? data.price : undefined,
        description: data.description !== undefined ? data.description.trim() : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      },
    });
  }
}
