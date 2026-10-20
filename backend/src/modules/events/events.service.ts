import { prisma } from '../../config/db.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  static async getTicketTypes(eventId: string, includeInactive = false) {
    return prisma.ticketType.findMany({
      where: {
        eventId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { price: 'desc' },
    });
  }

  static async createTicketType(
    eventId: string,
    data: {
      name: string;
      price: number;
      description?: string | null;
      isActive?: boolean;
      presaleStartDate?: string | Date | null;
      presaleEndDate?: string | Date | null;
      totalCapacity?: number | null;
    }
  ) {
    return prisma.ticketType.create({
      data: {
        eventId,
        name: data.name.trim(),
        price: data.price,
        description: data.description?.trim(),
        isActive: data.isActive ?? true,
        presaleStartDate: data.presaleStartDate ? new Date(data.presaleStartDate) : null,
        presaleEndDate: data.presaleEndDate ? new Date(data.presaleEndDate) : null,
        totalCapacity: data.totalCapacity ?? null,
      },
    });
  }

  static async updateTicketType(
    eventId: string,
    ticketTypeId: string,
    data: {
      name?: string;
      price?: number;
      description?: string | null;
      isActive?: boolean;
      presaleStartDate?: string | Date | null;
      presaleEndDate?: string | Date | null;
      totalCapacity?: number | null;
    }
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
        description: data.description !== undefined ? data.description?.trim() : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
        presaleStartDate: data.presaleStartDate !== undefined ? (data.presaleStartDate ? new Date(data.presaleStartDate) : null) : undefined,
        presaleEndDate: data.presaleEndDate !== undefined ? (data.presaleEndDate ? new Date(data.presaleEndDate) : null) : undefined,
        totalCapacity: data.totalCapacity !== undefined ? data.totalCapacity : undefined,
      },
    });
  }

  static async uploadLogo(
    eventId: string,
    fileData: { base64Data: string; fileName: string; mimeType?: string }
  ) {
    const existing = await prisma.eventSettings.findUnique({ where: { eventId } });
    if (!existing) throw new NotFoundError('Ajustes de edición no encontrados');

    let base64Content = fileData.base64Data;
    let mimeType = fileData.mimeType;

    const matches = fileData.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Content = matches[2];
    }

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (mimeType && !allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestError('Formato de imagen no permitido. Utilice PNG, JPG, WEBP o SVG.');
    }

    const buffer = Buffer.from(base64Content, 'base64');
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (buffer.length > maxSize) {
      throw new BadRequestError('El tamaño del logotipo excede el límite permitido de 2 MB.');
    }

    let ext = 'png';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') ext = 'jpg';
    else if (mimeType === 'image/webp') ext = 'webp';
    else if (mimeType === 'image/svg+xml') ext = 'svg';
    else if (fileData.fileName && fileData.fileName.includes('.')) {
      ext = fileData.fileName.split('.').pop()?.toLowerCase() || 'png';
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const logosDir = path.resolve(__dirname, '../../../uploads/logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
    }

    const filename = `logo_${eventId}_${Date.now()}.${ext}`;
    const filePath = path.join(logosDir, filename);
    fs.writeFileSync(filePath, buffer);

    if (existing.logoUrl && existing.logoUrl.startsWith('/uploads/logos/')) {
      const oldFilename = path.basename(existing.logoUrl);
      const oldFilePath = path.join(logosDir, oldFilename);
      if (fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
        } catch (e) {
          console.warn('No se pudo eliminar el logo anterior:', e);
        }
      }
    }

    const logoUrl = `/uploads/logos/${filename}`;
    const updated = await prisma.eventSettings.update({
      where: { eventId },
      data: { logoUrl },
    });

    return { settings: updated, logoUrl };
  }

  static async removeLogo(eventId: string) {
    const existing = await prisma.eventSettings.findUnique({ where: { eventId } });
    if (!existing) throw new NotFoundError('Ajustes de edición no encontrados');

    if (existing.logoUrl && existing.logoUrl.startsWith('/uploads/logos/')) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const logosDir = path.resolve(__dirname, '../../../uploads/logos');
      const filename = path.basename(existing.logoUrl);
      const filePath = path.join(logosDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('No se pudo eliminar el logo del disco:', e);
        }
      }
    }

    const updated = await prisma.eventSettings.update({
      where: { eventId },
      data: { logoUrl: null },
    });

    return { settings: updated, logoUrl: null };
  }
}
