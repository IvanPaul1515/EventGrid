import { prisma } from '../../config/db.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import {
  CreateScheduleItemInput,
  UpdateScheduleItemInput,
  QueryScheduleInput,
  PublishKeynoteInput,
  NotifyScheduleChangeInput,
  CreateAnnouncementInput,
} from './schedule.dto.js';
import { CommunicationsService } from '../communications/communications.service.js';
import * as XLSX from 'xlsx';

export class ScheduleService {
  private static async validateTimes(eventId: string, data: any, excludeId?: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.endTime) || data.endTime <= data.startTime) {
      throw new BadRequestError('Indique horas completas HH:MM y una hora final posterior al inicio.');
    }
    if (data.room && data.status !== 'CANCELLED') {
      const conflict = await prisma.scheduleItem.findFirst({ where: {
        eventId, room: data.room, day: data.day || 'Día 1', status: { not: 'CANCELLED' },
        ...(excludeId ? { id: { not: excludeId } } : {}), startTime: { lt: data.endTime }, endTime: { gt: data.startTime },
      } });
      if (conflict) throw new BadRequestError('Existe otra actividad en esa sala durante el horario indicado.');
    }
  }
  /**
   * Obtener lista de ítems de cronograma para un evento con filtros
   */
  static async getItems(eventId: string, query?: QueryScheduleInput) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoMode = Boolean(event?.settings?.demoModeEnabled);

    const where: any = { eventId };

    if (!isDemoMode) {
      where.isDemo = false;
      where.NOT = [
        { category: 'Demostración' },
        { category: 'Demostracion' },
      ];
    }

    if (query?.day && query.day !== 'ALL') {
      where.day = query.day;
    }

    if (query?.room && query.room !== 'ALL') {
      where.room = query.room;
    }

    if (query?.category && query.category !== 'ALL') {
      where.category = query.category;
    }

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query?.search && query.search.trim() !== '') {
      const q = query.search.trim();
      where.OR = [
        { title: { contains: q } },
        { speakerName: { contains: q } },
        { speakerCompany: { contains: q } },
        { description: { contains: q } },
        { room: { contains: q } },
      ];
    }

    const items = await prisma.scheduleItem.findMany({
      where,
      orderBy: [
        { day: 'asc' },
        { startTime: 'asc' },
        { order: 'asc' },
      ],
    });

    // Obtener días, salones y categorías únicos para facilitar navegación
    const allItems = await prisma.scheduleItem.findMany({
      where: { eventId },
      select: { day: true, room: true, category: true },
    });

    const days = Array.from(new Set(allItems.map((i) => i.day).filter(Boolean)));
    const rooms = Array.from(new Set(allItems.map((i) => i.room).filter(Boolean))) as string[];
    const categories = Array.from(new Set(allItems.map((i) => i.category).filter(Boolean))) as string[];

    const settings = await prisma.eventSettings.findUnique({
      where: { eventId },
      select: { schedulePdfUrl: true },
    });

    return {
      total: items.length,
      days,
      rooms,
      categories,
      pdfUrl: settings?.schedulePdfUrl || null,
      items,
    };
  }

  /**
   * Obtener un ítem específico por ID
   */
  static async getItemById(eventId: string, id: string) {
    const item = await prisma.scheduleItem.findFirst({
      where: { id, eventId },
    });

    if (!item) {
      throw new NotFoundError('Charla o actividad de cronograma no encontrada');
    }

    return item;
  }

  /**
   * Crear nuevo ítem en el cronograma
   */
  static async createItem(eventId: string, input: CreateScheduleItemInput) {
    await this.validateTimes(eventId, input);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundError('Edición no encontrada');
    }

    const created = await prisma.scheduleItem.create({
      data: {
        eventId,
        title: input.title.trim(),
        speakerName: input.speakerName?.trim() || null,
        speakerBio: input.speakerBio?.trim() || null,
        speakerCompany: input.speakerCompany?.trim() || null,
        room: input.room?.trim() || null,
        day: input.day?.trim() || 'Día 1',
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        category: input.category?.trim() || (input.isKeynote ? 'Keynote' : null),
        status: input.status || 'CONFIRMED',
        description: input.description?.trim() || null,
        order: input.order ?? 0,
        isKeynote: Boolean(input.isKeynote),
        visibility: input.visibility || 'PUBLISHED',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        imageUrl: input.imageUrl?.trim() || null,
        announcementText: input.announcementText?.trim() || null,
      },
    });

    return created;
  }

  /**
   * Actualizar ítem existente con detección de cambios y bitácora
   */
  static async updateItem(eventId: string, id: string, input: UpdateScheduleItemInput, userId?: string) {
    const existing = await this.getItemById(eventId, id);
    await this.validateTimes(eventId, { ...existing, ...input }, id);

    // Detectar modificaciones en campos de impacto
    const changedFields: string[] = [];
    const previousValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    const fieldsToTrack: Array<keyof UpdateScheduleItemInput> = [
      'title', 'speakerName', 'speakerCompany', 'room', 'day', 'startTime', 'endTime', 'category', 'status', 'visibility'
    ];

    for (const field of fieldsToTrack) {
      if (input[field] !== undefined) {
        const oldVal = (existing as any)[field];
        const newVal = input[field];
        if (oldVal !== newVal && String(oldVal ?? '').trim() !== String(newVal ?? '').trim()) {
          changedFields.push(String(field));
          previousValues[String(field)] = oldVal;
          newValues[String(field)] = newVal;
        }
      }
    }

    const hasRelevantChanges = changedFields.length > 0;
    let changeLog: any = null;

    if (hasRelevantChanges) {
      const summaries: string[] = [];
      if (newValues.startTime || newValues.endTime) {
        summaries.push(`Horario: ${previousValues.startTime || existing.startTime}-${previousValues.endTime || existing.endTime} → ${newValues.startTime || existing.startTime}-${newValues.endTime || existing.endTime}`);
      }
      if (newValues.room) {
        summaries.push(`Salón: "${previousValues.room || 'Sin salón'}" → "${newValues.room}"`);
      }
      if (newValues.speakerName) {
        summaries.push(`Ponente: "${previousValues.speakerName || 'Sin ponente'}" → "${newValues.speakerName}"`);
      }
      if (newValues.day) {
        summaries.push(`Día: "${previousValues.day || existing.day}" → "${newValues.day}"`);
      }
      if (newValues.status) {
        summaries.push(`Estado: ${previousValues.status} → ${newValues.status}`);
      }
      if (newValues.title) {
        summaries.push(`Título: "${previousValues.title}" → "${newValues.title}"`);
      }
      if (newValues.visibility) {
        summaries.push(`Visibilidad: ${previousValues.visibility} → ${newValues.visibility}`);
      }

      const changeSummary = summaries.length > 0 ? summaries.join(' | ') : `Modificación de ${changedFields.join(', ')}`;

      changeLog = await prisma.scheduleChangeLog.create({
        data: {
          eventId,
          scheduleItemId: id,
          changedByUserId: userId || null,
          changeSummary,
          previousValues: JSON.stringify(previousValues),
          newValues: JSON.stringify(newValues),
          notified: false,
          deliveryStatus: 'NONE',
        },
      });
    }

    const updated = await prisma.scheduleItem.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.speakerName !== undefined ? { speakerName: input.speakerName?.trim() || null } : {}),
        ...(input.speakerBio !== undefined ? { speakerBio: input.speakerBio?.trim() || null } : {}),
        ...(input.speakerCompany !== undefined ? { speakerCompany: input.speakerCompany?.trim() || null } : {}),
        ...(input.room !== undefined ? { room: input.room?.trim() || null } : {}),
        ...(input.day !== undefined ? { day: input.day?.trim() || 'Día 1' } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime.trim() } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.isKeynote !== undefined ? { isKeynote: Boolean(input.isKeynote) } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.publishAt !== undefined ? { publishAt: input.publishAt ? new Date(input.publishAt) : null } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
        ...(input.announcementText !== undefined ? { announcementText: input.announcementText?.trim() || null } : {}),
      },
    });

    const diffs = changedFields.map((field) => ({
      field,
      oldValue: previousValues[field],
      newValue: newValues[field],
    }));

    return {
      item: updated,
      hasRelevantChanges,
      changeLog,
      diffs,
    };
  }

  /**
   * Eliminar ítem del cronograma
   */
  static async deleteItem(eventId: string, id: string) {
    await this.getItemById(eventId, id);

    await prisma.scheduleItem.delete({
      where: { id },
    });

    return { success: true, message: 'Charla eliminada del cronograma correctamente' };
  }

  /**
   * Actualizar enlace o archivo PDF del cronograma
   */
  static async updatePdfUrl(eventId: string, pdfUrl: string) {
    const settings = await prisma.eventSettings.findUnique({
      where: { eventId },
    });

    if (settings) {
      await prisma.eventSettings.update({
        where: { eventId },
        data: { schedulePdfUrl: pdfUrl },
      });
    } else {
      await prisma.eventSettings.create({
        data: {
          eventId,
          schedulePdfUrl: pdfUrl,
        },
      });
    }

    return { success: true, pdfUrl };
  }

  /**
   * Importar masivamente desde buffer Excel / CSV
   */
  static async importFromBuffer(eventId: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestError('El archivo no contiene ninguna hoja válida');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      throw new BadRequestError('El archivo no contiene filas para importar');
    }

    let importedCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    const normalizeHeader = (r: any, keys: string[]): string | undefined => {
      for (const key of keys) {
        const cleanKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        for (const rKey of Object.keys(r)) {
          const cleanRKey = rKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
          if (cleanRKey === cleanKey) {
            const val = r[rKey];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return String(val).trim();
            }
          }
        }
      }
      return undefined;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const title = normalizeHeader(row, ['titulo', 'title', 'charla', 'tema', 'conferencia', 'nombre']);
      if (!title) {
        errors.push({ row: rowNum, error: 'Fila sin título de la charla' });
        continue;
      }

      const speakerName = normalizeHeader(row, ['expositor', 'ponente', 'speaker', 'disertante', 'facilitador']);
      const speakerBio = normalizeHeader(row, ['bio', 'biografia', 'perfil']);
      const speakerCompany = normalizeHeader(row, ['empresa', 'company', 'institucion', 'organizacion']);
      const room = normalizeHeader(row, ['aula', 'salon', 'sala', 'auditorio', 'room', 'ubicacion', 'lugar']);
      const day = normalizeHeader(row, ['dia', 'day', 'fecha']) || 'Día 1';
      let startTime = normalizeHeader(row, ['inicio', 'start', 'horainicio', 'hora_inicio', 'desde']) || '09:00';
      let endTime = normalizeHeader(row, ['fin', 'end', 'horafin', 'hora_fin', 'hasta']) || '10:00';
      const category = normalizeHeader(row, ['categoria', 'category', 'track', 'area', 'tipo']);
      const statusRaw = normalizeHeader(row, ['estado', 'status']);
      const description = normalizeHeader(row, ['descripcion', 'description', 'resumen', 'abstract']);

      // Formatear horas si vienen en formato H:MM o H
      const formatTime = (t: string) => {
        t = t.trim();
        if (/^\d{1,2}:\d{2}$/.test(t)) {
          const [h, m] = t.split(':');
          return `${h.padStart(2, '0')}:${m}`;
        }
        if (/^\d{1,2}$/.test(t)) {
          return `${t.padStart(2, '0')}:00`;
        }
        return '09:00';
      };

      startTime = formatTime(startTime);
      endTime = formatTime(endTime);

      let status = 'CONFIRMED';
      if (statusRaw) {
        const s = statusRaw.toUpperCase();
        if (s.includes('REAGEND') || s.includes('RESCHED')) status = 'RESCHEDULED';
        else if (s.includes('CANCEL') || s.includes('SUSPEND')) status = 'CANCELLED';
      }

      try {
        await prisma.scheduleItem.create({
          data: {
            eventId,
            title,
            speakerName: speakerName || null,
            speakerBio: speakerBio || null,
            speakerCompany: speakerCompany || null,
            room: room || null,
            day,
            startTime,
            endTime,
            category: category || null,
            status,
            description: description || null,
            order: i,
          },
        });
        importedCount++;
      } catch (e: any) {
        errors.push({ row: rowNum, error: e.message || 'Error al guardar ítem' });
      }
    }

    return {
      totalRows: rows.length,
      importedCount,
      errorCount: errors.length,
      errors,
    };
  }

  /**
   * Vista pública optimizada para participantes y móviles
   * Incluye detección dinámica de charlas "NOW" (en curso) y "NEXT" (próxima)
   */
  static async getPublicSchedule(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });
    const isDemoMode = Boolean(event?.settings?.demoModeEnabled);

    const where: any = {
      eventId,
      status: { not: 'CANCELLED' },
      OR: [
        { visibility: 'PUBLISHED' },
        {
          visibility: 'SCHEDULED',
          publishAt: { lte: new Date() },
        },
      ],
    };

    if (!isDemoMode) {
      where.isDemo = false;
      where.NOT = [
        { category: 'Demostración' },
        { category: 'Demostracion' },
      ];
    }

    const items = await prisma.scheduleItem.findMany({
      where,
      orderBy: [
        { day: 'asc' },
        { startTime: 'asc' },
        { order: 'asc' },
      ],
    });

    const settings = await prisma.eventSettings.findUnique({
      where: { eventId },
      select: { schedulePdfUrl: true },
    });

    // Detectar hora actual local (formato HH:MM)
    const now = new Date();
    const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Agrupar por días
    const daysMap = new Map<string, typeof items>();
    for (const item of items) {
      if (!daysMap.has(item.day)) {
        daysMap.set(item.day, []);
      }
      daysMap.get(item.day)!.push(item);
    }

    const groupedByDay = Array.from(daysMap.entries()).map(([day, dayItems]) => {
      // Identificar charla en curso y siguiente dentro de este día
      const nowItems = dayItems.filter((i) => i.startTime <= currentHourMin && i.endTime >= currentHourMin);
      const nextItems = dayItems.filter((i) => i.startTime > currentHourMin).slice(0, 3);

      return {
        day,
        total: dayItems.length,
        nowItems,
        nextItems,
        items: dayItems,
      };
    });

    return {
      total: items.length,
      currentTime: currentHourMin,
      pdfUrl: settings?.schedulePdfUrl || null,
      groupedByDay,
      items,
    };
  }

  public static readonly DEMO_ACTIVITIES = [
    {
      title: 'Registro y acreditación de participantes',
      speakerName: null,
      speakerBio: null,
      speakerCompany: null,
      room: 'Lobby Principal',
      day: 'Día 1',
      startTime: '08:00',
      endTime: '08:45',
      category: 'Registro',
      status: 'CONFIRMED',
      description: 'Acreditación, entrega de gafetes y kits de bienvenida para participantes.',
      order: 0,
    },
    {
      title: 'Inteligencia artificial aplicada al desarrollo de software',
      speakerName: 'Dra. Sofía Valerio',
      speakerBio: 'Investigadora en Inteligencia Artificial y arquitecturas de software.',
      speakerCompany: 'Tech Innovations Lab',
      room: 'Auditorio A',
      day: 'Día 1',
      startTime: '08:45',
      endTime: '09:15',
      category: 'Demostración',
      status: 'CONFIRMED',
      description: 'Charla demostrativa sobre agentes autónomos, pair programming y optimización de flujos de desarrollo.',
      order: 1,
    },
    {
      title: 'Ciberseguridad: amenazas y buenas prácticas',
      speakerName: 'Ing. Alejandro Morales',
      speakerBio: 'Especialista en seguridad ofensiva y auditoría de infraestructuras críticas.',
      speakerCompany: 'CyberShield Security',
      room: 'Auditorio B',
      day: 'Día 1',
      startTime: '09:15',
      endTime: '09:50',
      category: 'Demostración',
      status: 'CONFIRMED',
      description: 'Estrategias prácticas de seguridad defensiva, autenticación robusta y protección de endpoints.',
      order: 2,
    },
    {
      title: 'Desarrollo web moderno y aplicaciones progresivas',
      speakerName: 'Lic. Mariana Reyes',
      speakerBio: 'Desarrolladora frontend y conferencista internacional en tecnologías web.',
      speakerCompany: 'Cloud Web Solutions',
      room: 'Auditorio A',
      day: 'Día 1',
      startTime: '09:50',
      endTime: '10:30',
      category: 'Demostración',
      status: 'CONFIRMED',
      description: 'Arquitecturas frontend desacopladas, rendimiento web y experiencias nativas con PWAs.',
      order: 3,
    },
  ];

  static async seedDemoSchedule(eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const createdItems = [];
    for (const act of this.DEMO_ACTIVITIES) {
      const exists = await prisma.scheduleItem.findFirst({
        where: { eventId, title: act.title },
      });
      if (!exists) {
        const item = await prisma.scheduleItem.create({
          data: {
            eventId,
            ...act,
            isDemo: true,
          },
        });
        createdItems.push(item);
      }
    }

    return {
      success: true,
      createdCount: createdItems.length,
      items: createdItems,
      message: createdItems.length > 0
        ? `Se agregaron ${createdItems.length} actividades de demostración al cronograma.`
        : 'Las actividades de prueba ya existían en el cronograma.',
    };
  }

  static async clearDemoSchedule(eventId: string) {
    const demoTitles = this.DEMO_ACTIVITIES.map((a) => a.title);
    const deleteResult = await prisma.scheduleItem.deleteMany({
      where: {
        eventId,
        OR: [
          { isDemo: true },
          { title: { in: demoTitles } },
          { category: 'Demostración' },
          { category: 'Demostracion' },
        ],
      },
    });

    return {
      success: true,
      deletedCount: deleteResult.count,
      message: `Se eliminaron ${deleteResult.count} actividades de demostración.`,
    };
  }


  /**
   * Publicar y/o anunciar Keynote
   */
  static async publishKeynote(
    eventId: string,
    id: string,
    input: PublishKeynoteInput,
    userId?: string
  ) {
    const item = await this.getItemById(eventId, id);
    const action = (input as any).action;
    const scheduledFor = (input as any).scheduledFor || input.scheduleNotificationAt || input.schedulePublicationAt;
    const isPublishOnly = Boolean(input.publishOnly || action === 'PUBLISH_ONLY' || (!action && !input.sendNow && !input.schedulePublicationAt && !input.scheduleNotificationAt));
    const isSchedule = Boolean(action === 'SCHEDULE_PUBLISH_AND_NOTIFY' || input.schedulePublicationAt || input.scheduleNotificationAt);
    const shouldSendNow = Boolean(input.sendNow || action === 'PUBLISH_AND_NOTIFY');

    // 1. Solo publicar (hacer visible en cronograma sin enviar correos)
    if (isPublishOnly) {
      const updated = await prisma.scheduleItem.update({
        where: { id },
        data: { visibility: 'PUBLISHED', isKeynote: true },
      });
      return {
        success: true,
        item: updated,
        message: 'Keynote publicado en el cronograma exitosamente sin envío de correos.',
      };
    }

    // 2. Programar publicación y/o envío
    if (isSchedule && scheduledFor) {
      const pubDate = new Date(input.schedulePublicationAt || scheduledFor);
      if (isNaN(pubDate.getTime())) throw new BadRequestError('Fecha de publicación inválida');

      const notifDate = new Date(input.scheduleNotificationAt || scheduledFor);
      if (isNaN(notifDate.getTime())) throw new BadRequestError('Fecha de notificación inválida');

      await prisma.scheduleItem.update({
        where: { id },
        data: {
          isKeynote: true,
          visibility: pubDate && pubDate > new Date() ? 'SCHEDULED' : 'PUBLISHED',
          publishAt: pubDate || null,
        },
      });

      const scheduledNotif = await prisma.scheduledNotification.create({
        data: {
          eventId,
          title: input.customSubject || `¡Ya tenemos keynote! — ${item.title}`,
          message: input.customMessage || (input as any).customNote || item.announcementText || item.description || '',
          targetGroup: input.targetGroup,
          templateCode: 'KEYNOTE_ANNOUNCEMENT',
          scheduledFor: notifDate,
          status: 'SCHEDULED',
          mode: input.mode,
          scheduleItemId: id,
          createdByUserId: userId || null,
        },
      });

      return {
        success: true,
        scheduled: true,
        notification: scheduledNotif,
        scheduledNotification: scheduledNotif,
        message: 'Registro programado conservado. El envío requiere una nueva confirmación explícita; no se ejecutará automáticamente.',
      };
    }

    if (!shouldSendNow) throw new BadRequestError('Debe autorizar expresamente Publicar y enviar ahora.');
    // 3. Publicar y enviar ahora
    const updated = await prisma.scheduleItem.update({
      where: { id },
      data: { visibility: 'PUBLISHED', isKeynote: true },
    });

    let batchResult: any = null;
    if (shouldSendNow) {
      batchResult = await CommunicationsService.sendBulkEmail(
        {
          eventId,
          targetGroup: input.targetGroup as any,
          templateCode: 'KEYNOTE_ANNOUNCEMENT',
          customSubject: input.customSubject || undefined,
          customMessage: input.customMessage || (input as any).customNote || item.announcementText || undefined,
          mode: input.mode as any,
          simulateOnly: input.mode === 'SIMULATION',
          activityTitle: item.title,
          speakerName: item.speakerName || 'Invitado Especial',
          speakerCompany: item.speakerCompany || '',
          activityTime: `${item.startTime} - ${item.endTime}`,
          activityDay: item.day,
          activityRoom: item.room || 'Principal',
          keynoteDescriptionHtml: item.description ? `<p style="margin: 8px 0; color: #cbd5e1; font-size: 13px;">${item.description}</p>` : '',
        } as any,
        userId
      );
    }

    return {
      success: true,
      item: updated,
      batchId: batchResult?.batchId || null,
      batchJobId: batchResult?.batchId || null,
      totalRecipients: (batchResult as any)?.totalTargeted || 0,
      totalTargeted: (batchResult as any)?.totalTargeted || 0,
      message: shouldSendNow
        ? `Keynote publicado y campaña de anuncio enviada a ${(batchResult as any)?.totalTargeted || 0} asistentes.`
        : 'Keynote publicado exitosamente en el cronograma.',
    };
  }

  /**
   * Notificar cambio de cronograma a los asistentes
   */
  static async notifyScheduleChange(
    eventId: string,
    input: NotifyScheduleChangeInput,
    userId?: string
  ) {
    let changeLogId = input.changeLogId;
    if (!changeLogId && (input as any).scheduleItemId) {
      const latest = await prisma.scheduleChangeLog.findFirst({
        where: { scheduleItemId: (input as any).scheduleItemId, eventId },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        changeLogId = latest.id;
      }
    }

    if (!changeLogId) {
      throw new NotFoundError('Registro de cambio no encontrado');
    }

    const changeLog = await prisma.scheduleChangeLog.findFirst({
      where: { id: changeLogId, eventId },
      include: { scheduleItem: true },
    });

    if (!changeLog) {
      throw new NotFoundError('Registro de cambio no encontrado');
    }

    const item = changeLog.scheduleItem;
    const prev = JSON.parse(changeLog.previousValues || '{}');
    const curr = JSON.parse(changeLog.newValues || '{}');

    // Construir tabla HTML con los cambios exactos
    const diffRows: string[] = [];
    if (curr.startTime || curr.endTime || prev.startTime || prev.endTime) {
      diffRows.push(`
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; color: #94a3b8;">Horario</td>
          <td style="padding: 6px 12px; color: #ef4444; text-decoration: line-through;">${prev.startTime || item.startTime} - ${prev.endTime || item.endTime}</td>
          <td style="padding: 6px 12px; color: #22c55e; font-weight: bold;">${curr.startTime || item.startTime} - ${curr.endTime || item.endTime}</td>
        </tr>
      `);
    }
    if (curr.room && curr.room !== prev.room) {
      diffRows.push(`
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; color: #94a3b8;">Salón</td>
          <td style="padding: 6px 12px; color: #ef4444; text-decoration: line-through;">${prev.room || 'Sin salón'}</td>
          <td style="padding: 6px 12px; color: #22c55e; font-weight: bold;">${curr.room}</td>
        </tr>
      `);
    }
    if (curr.day && curr.day !== prev.day) {
      diffRows.push(`
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; color: #94a3b8;">Día</td>
          <td style="padding: 6px 12px; color: #ef4444; text-decoration: line-through;">${prev.day || item.day}</td>
          <td style="padding: 6px 12px; color: #22c55e; font-weight: bold;">${curr.day}</td>
        </tr>
      `);
    }
    if (curr.status && curr.status !== prev.status) {
      diffRows.push(`
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; color: #94a3b8;">Estado</td>
          <td style="padding: 6px 12px; color: #ef4444; text-decoration: line-through;">${prev.status || item.status}</td>
          <td style="padding: 6px 12px; color: #22c55e; font-weight: bold;">${curr.status}</td>
        </tr>
      `);
    }
    if (curr.speakerName && curr.speakerName !== prev.speakerName) {
      diffRows.push(`
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; color: #94a3b8;">Ponente</td>
          <td style="padding: 6px 12px; color: #ef4444; text-decoration: line-through;">${prev.speakerName || 'Sin ponente'}</td>
          <td style="padding: 6px 12px; color: #22c55e; font-weight: bold;">${curr.speakerName}</td>
        </tr>
      `);
    }

    const changeSummaryHtml = diffRows.length > 0
      ? `<table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
           <thead>
             <tr style="text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase;">
               <th style="padding: 4px 12px;">Campo</th>
               <th style="padding: 4px 12px;">Anterior</th>
               <th style="padding: 4px 12px;">Nuevo</th>
             </tr>
           </thead>
           <tbody>${diffRows.join('')}</tbody>
         </table>`
      : `<p style="margin: 8px 0; color: #cbd5e1;">${changeLog.changeSummary}</p>`;

    const action = (input as any).action;
    const isSchedule = action === 'SCHEDULE' || Boolean(input.scheduleAt) || Boolean((input as any).scheduledFor);
    const scheduleDateStr = input.scheduleAt || (input as any).scheduledFor;

    // Si es programación diferida
    if (isSchedule && scheduleDateStr) {
      const scheduledDate = new Date(scheduleDateStr);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestError('Fecha de programación inválida');
      }

      const scheduled = await prisma.scheduledNotification.create({
        data: {
          eventId,
          title: input.customSubject || `Actualización del cronograma — ${item.title}`,
          message: input.customMessage || (input as any).customNote || changeLog.changeSummary,
          targetGroup: input.targetGroup,
          templateCode: 'SCHEDULE_CHANGE_ALERT',
          scheduledFor: scheduledDate,
          status: 'SCHEDULED',
          mode: input.mode,
          scheduleItemId: item.id,
          createdByUserId: userId || null,
        },
      });

      await prisma.scheduleChangeLog.update({
        where: { id: changeLog.id },
        data: { deliveryStatus: 'SCHEDULED' },
      });

      return {
        success: true,
        scheduled: true,
        action: 'SCHEDULED',
        notification: scheduled,
        scheduledNotification: scheduled,
        message: `Notificación de cambio programada exitosamente para ${scheduledDate.toLocaleString()}`,
      };
    }

    // Envío inmediato
    const batch = await CommunicationsService.sendBulkEmail(
      {
        eventId,
        targetGroup: input.targetGroup as any,
        templateCode: 'SCHEDULE_CHANGE_ALERT',
        customSubject: input.customSubject || `Actualización del cronograma — ${item.title}`,
        customMessage: input.customMessage || (input as any).customNote || undefined,
        mode: input.mode as any,
        simulateOnly: input.mode === 'SIMULATION',
        activityTitle: item.title,
        changeSummaryHtml,
      } as any,
      userId
    );

    await prisma.scheduleChangeLog.update({
      where: { id: changeLog.id },
      data: {
        notified: true,
        notifiedAt: new Date(),
        batchJobId: batch.batchId,
        deliveryStatus: input.mode === 'SIMULATION' ? 'SIMULATED' : 'SENT',
      },
    });

    return {
      success: true,
      action: 'SENT_NOW',
      batchId: batch.batchId,
      batchJobId: batch.batchId,
      totalRecipients: (batch as any)?.totalTargeted || 0,
      totalTargeted: (batch as any)?.totalTargeted || 0,
      message: `Notificación enviada a ${(batch as any)?.totalTargeted || 0} asistentes (${input.mode === 'SIMULATION' ? 'Modo Simulación' : 'Enviado'}).`,
    };
  }

  /**
   * Crear anuncio durante las pausas del evento
   */
  static async createAnnouncement(
    eventId: string,
    input: CreateAnnouncementInput,
    userId?: string
  ) {
    const title = input.title || (input as any).subject || 'Anuncio Oficial del Evento';
    const message = input.message;
    const action = (input as any).action;
    const isSchedule = action === 'SCHEDULE' || Boolean(input.scheduleAt) || Boolean((input as any).scheduledFor);
    const scheduleDateStr = input.scheduleAt || (input as any).scheduledFor;

    if (isSchedule && scheduleDateStr) {
      const scheduledDate = new Date(scheduleDateStr);
      if (isNaN(scheduledDate.getTime())) throw new BadRequestError('Fecha de programación inválida');

      const scheduled = await prisma.scheduledNotification.create({
        data: {
          eventId,
          title,
          message,
          targetGroup: input.targetGroup,
          templateCode: 'GENERAL_ANNOUNCEMENT',
          scheduledFor: scheduledDate,
          status: 'SCHEDULED',
          mode: input.mode,
          scheduleItemId: input.scheduleItemId || null,
          createdByUserId: userId || null,
        },
      });

      return {
        success: true,
        scheduled: true,
        notification: scheduled,
        scheduledNotification: scheduled,
        message: `Anuncio programado para ${scheduledDate.toLocaleString()}`,
      };
    }

    const batch = await CommunicationsService.sendBulkEmail(
      {
        eventId,
        targetGroup: input.targetGroup as any,
        templateCode: 'GENERAL_ANNOUNCEMENT',
        customSubject: title,
        customMessage: message,
        mode: input.mode as any,
        simulateOnly: input.mode === 'SIMULATION',
      },
      userId
    );

    return {
      success: true,
      batchId: batch.batchId,
      batchJobId: batch.batchId,
      totalRecipients: (batch as any)?.totalTargeted || 0,
      totalTargeted: (batch as any)?.totalTargeted || 0,
      message: `Anuncio enviado exitosamente a ${(batch as any)?.totalTargeted || 0} destinatarios.`,
    };
  }

  /**
   * Historial de cambios y modificaciones del cronograma
   */
  static async getChangeHistory(eventId: string) {
    return await prisma.scheduleChangeLog.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        scheduleItem: {
          select: { id: true, title: true, speakerName: true, room: true },
        },
      },
      take: 50,
    });
  }

  /**
   * Consultar notificaciones programadas
   */
  static async getScheduledNotifications(eventId: string) {
    return await prisma.scheduledNotification.findMany({
      where: { eventId },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * Cancelar notificación programada
   */
  static async cancelScheduledNotification(eventId: string, id: string, userId?: string) {
    const notif = await prisma.scheduledNotification.findFirst({
      where: { id, eventId },
    });
    if (!notif) throw new NotFoundError('Notificación programada no encontrada');
    if (notif.status !== 'SCHEDULED' && notif.status !== 'PENDING') {
      throw new BadRequestError(`No se puede cancelar una notificación en estado ${notif.status}`);
    }

    const cancelled = await prisma.scheduledNotification.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return {
      success: true,
      notification: cancelled,
      message: 'Notificación programada cancelada exitosamente.',
    };
  }

}
