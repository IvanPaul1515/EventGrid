import { prisma } from '../../config/db.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import {
  CreateScheduleItemInput,
  UpdateScheduleItemInput,
  QueryScheduleInput,
} from './schedule.dto.js';
import * as XLSX from 'xlsx';

export class ScheduleService {
  /**
   * Obtener lista de ítems de cronograma para un evento con filtros
   */
  static async getItems(eventId: string, query?: QueryScheduleInput) {
    const where: any = { eventId };

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
        category: input.category?.trim() || null,
        status: input.status || 'CONFIRMED',
        description: input.description?.trim() || null,
        order: input.order ?? 0,
      },
    });

    return created;
  }

  /**
   * Actualizar ítem existente
   */
  static async updateItem(eventId: string, id: string, input: UpdateScheduleItemInput) {
    await this.getItemById(eventId, id);

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
      },
    });

    return updated;
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
    const items = await prisma.scheduleItem.findMany({
      where: {
        eventId,
        status: { not: 'CANCELLED' },
      },
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
          { title: { in: demoTitles } },
          { category: 'Demostración' },
        ],
      },
    });

    return {
      success: true,
      deletedCount: deleteResult.count,
      message: `Se eliminaron ${deleteResult.count} actividades de demostración.`,
    };
  }

}
