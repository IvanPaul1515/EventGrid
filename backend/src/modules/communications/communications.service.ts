import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import {
  UpdateSmtpConfigInput,
  SendEmailInput,
  SendBulkEmailInput,
  UpdateTemplateInput,
} from './communications.dto.js';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

export class CommunicationsService {
  /**
   * Obtener configuración SMTP (ocultando credenciales sensibles)
   */
  static async getConfig(eventId?: string | null) {
    let config = null;

    if (eventId) {
      config = await prisma.emailConfig.findFirst({
        where: { eventId },
      });
    }

    if (!config) {
      config = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });
    }

    if (!config) {
      return {
        isConfigured: false,
        isEnabled: false,
        host: '',
        port: 587,
        secure: false,
        user: '',
        fromEmail: '',
        fromName: 'EventGrid Notificaciones',
        replyToEmail: '',
        hasPassword: false,
      };
    }

    return {
      id: config.id,
      eventId: config.eventId,
      isConfigured: true,
      isEnabled: config.isEnabled,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user || '',
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail || '',
      hasPassword: !!(config.password && config.password.length > 0),
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Guardar configuración SMTP
   */
  static async saveConfig(input: UpdateSmtpConfigInput) {
    const existing = input.eventId
      ? await prisma.emailConfig.findFirst({ where: { eventId: input.eventId } })
      : await prisma.emailConfig.findFirst({ where: { eventId: null } });

    // Mantener la contraseña anterior si no se envía una nueva
    let passwordToStore = input.password;
    if ((!passwordToStore || passwordToStore.trim() === '') && existing?.password) {
      passwordToStore = existing.password;
    }

    let config;
    if (existing) {
      config = await prisma.emailConfig.update({
        where: { id: existing.id },
        data: {
          host: input.host,
          port: input.port,
          secure: input.secure,
          user: input.user || null,
          password: passwordToStore || null,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyToEmail: input.replyToEmail || null,
          isEnabled: input.isEnabled,
        },
      });
    } else {
      config = await prisma.emailConfig.create({
        data: {
          eventId: input.eventId || null,
          host: input.host,
          port: input.port,
          secure: input.secure,
          user: input.user || null,
          password: passwordToStore || null,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyToEmail: input.replyToEmail || null,
          isEnabled: input.isEnabled,
        },
      });
    }

    return this.getConfig(input.eventId);
  }

  /**
   * Probar conexión y envío de correo de prueba
   */
  static async testConnection(recipientEmail: string, eventId?: string | null, userId?: string) {
    const config = await prisma.emailConfig.findFirst({
      where: eventId ? { eventId } : { eventId: null },
    });

    if (!config || !config.isEnabled) {
      throw new BadRequestError('El servicio de correos está deshabilitado o no está configurado.');
    }

    const isTestOrDemo = process.env.NODE_ENV === 'test' || !config.password;

    if (isTestOrDemo) {
      // Simulación segura sin envío real en pruebas o entorno demo
      const log = await prisma.emailLog.create({
        data: {
          eventId: eventId || null,
          recipientEmail,
          recipientName: 'Prueba de Conexión',
          templateCode: 'TEST_CONNECTION',
          subject: 'Prueba de Configuración de Correo — EventGrid',
          status: 'SIMULATED',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        simulated: true,
        message: 'Conexión probada exitosamente (Modo Simulación seguro activo).',
        log,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
      });

      await transporter.verify();

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: recipientEmail,
        replyTo: config.replyToEmail || undefined,
        subject: 'Prueba de Configuración de Correo — EventGrid',
        text: 'Este es un correo de prueba generado desde la plataforma EventGrid para verificar la conectividad SMTP.',
        html: `
          <div style="font-family: sans-serif; padding: 20px; background: #0f172a; color: #fff; border-radius: 12px;">
            <h2 style="color: #10b981;">Conexión Exitosa con EventGrid</h2>
            <p>La configuración del servidor SMTP está funcionando correctamente.</p>
            <p style="font-size: 12px; color: #94a3b8;">Servidor: ${config.host}:${config.port}</p>
          </div>
        `,
      });

      const log = await prisma.emailLog.create({
        data: {
          eventId: eventId || null,
          recipientEmail,
          recipientName: 'Prueba SMTP',
          templateCode: 'TEST_CONNECTION',
          subject: 'Prueba de Configuración de Correo — EventGrid',
          status: 'SENT',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        simulated: false,
        message: `Correo de prueba enviado exitosamente a ${recipientEmail}`,
        log,
      };
    } catch (err: any) {
      await prisma.emailLog.create({
        data: {
          eventId: eventId || null,
          recipientEmail,
          recipientName: 'Prueba Fallida',
          templateCode: 'TEST_CONNECTION',
          subject: 'Prueba Fallida de Correo',
          status: 'FAILED',
          errorMessage: err.message || 'Error en servidor SMTP',
          sentByUserId: userId || null,
        },
      });

      throw new BadRequestError(`Error en el servidor de correo: ${err.message}`);
    }
  }

  /**
   * Listar plantillas de correo para un evento
   */
  static async getTemplates(eventId?: string | null) {
    const templates = await prisma.emailTemplate.findMany({
      where: eventId ? { OR: [{ eventId }, { eventId: null }] } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    return templates.map((t) => {
      let vars: string[] = [];
      if (typeof t.variables === 'string') {
        try {
          vars = JSON.parse(t.variables);
        } catch {
          vars = [];
        }
      } else if (Array.isArray(t.variables)) {
        vars = t.variables as string[];
      }

      return {
        ...t,
        variables: vars,
      };
    });
  }

  /**
   * Actualizar contenido de una plantilla de correo
   */
  static async updateTemplate(templateId: string, input: UpdateTemplateInput) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) throw new NotFoundError('Plantilla no encontrada');

    const updated = await prisma.emailTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name || template.name,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText || null,
      },
    });

    return updated;
  }

  /**
   * Enviar correo individual a un participante
   */
  static async sendSingleEmail(input: SendEmailInput, userId?: string) {
    const registration = await prisma.registration.findFirst({
      where: { id: input.registrationId, eventId: input.eventId },
      include: {
        participant: true,
        ticketType: true,
        event: { include: { settings: true } },
      },
    });

    if (!registration) throw new NotFoundError('Inscripción no encontrada');

    const template = await prisma.emailTemplate.findFirst({
      where: {
        code: input.templateCode,
        OR: [{ eventId: input.eventId }, { eventId: null }],
      },
    });

    if (!template) throw new NotFoundError(`Plantilla '${input.templateCode}' no encontrada`);

    // Generar código QR en Base64 Data URL para incrustarlo en la plantilla
    const secureToken = registration.qrCode || `eg_qr_${registration.id}`;
    const qrDataUrl = await QRCode.toDataURL(`https://eventgrid.app/t/${secureToken}`, {
      width: 280,
      margin: 2,
    });

    // Mapeo dinámico de variables
    const variables: Record<string, string> = {
      participantName: registration.participant.fullName,
      eventName: registration.event.name,
      eventDate: registration.event.startDate
        ? new Date(registration.event.startDate).toLocaleDateString('es-DO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Por anunciar',
      eventVenue: registration.event.venue,
      registrationNumber: registration.registrationNumber,
      ticketType: registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
      ticketPrice: Number(registration.ticketPrice ?? registration.totalAmount ?? 0).toFixed(2),
      amountPaid: Number(registration.amountPaid ?? registration.totalAmount ?? 0).toFixed(2),
      balanceDue: Number(registration.balanceDue || 0).toFixed(2),
      qrUrl: `https://eventgrid.app/t/${secureToken}`,
      qrDataUrl,
      messageContent: input.customMessage || '',
    };

    let subject = template.subject;
    let html = template.bodyHtml;
    let text = template.bodyText || '';

    // Reemplazar variables dinámicas
    for (const [key, val] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, val);
      html = html.replace(regex, val);
      text = text.replace(regex, val);
    }

    // Regla de seguridad: En modo demo, pruebas unitarias o si el participante es demo, NUNCA enviar a un correo real
    const isDemo = registration.isDemo || registration.event.settings?.demoModeEnabled || process.env.NODE_ENV === 'test';
    const config = await prisma.emailConfig.findFirst({
      where: { OR: [{ eventId: input.eventId }, { eventId: null }] },
    });

    if (isDemo || !config?.isEnabled) {
      const log = await prisma.emailLog.create({
        data: {
          eventId: input.eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: template.code,
          subject,
          status: 'SIMULATED',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        simulated: true,
        message: `Envío simulado correctamente a ${registration.participant.email} (Modo Demo/Simulación seguro).`,
        log,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
      });

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: registration.participant.email,
        replyTo: config.replyToEmail || undefined,
        subject,
        text,
        html,
      });

      const log = await prisma.emailLog.create({
        data: {
          eventId: input.eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: template.code,
          subject,
          status: 'SENT',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        simulated: false,
        message: `Correo enviado exitosamente a ${registration.participant.email}`,
        log,
      };
    } catch (err: any) {
      await prisma.emailLog.create({
        data: {
          eventId: input.eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: template.code,
          subject,
          status: 'FAILED',
          errorMessage: err.message,
          sentByUserId: userId || null,
        },
      });

      throw new BadRequestError(`Error al enviar correo: ${err.message}`);
    }
  }

  /**
   * Enviar correos masivos a grupos de participantes
   */
  static async sendBulkEmail(input: SendBulkEmailInput, userId?: string) {
    const event = await prisma.event.findUnique({
      where: { id: input.eventId },
      include: { settings: true },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    const template = await prisma.emailTemplate.findFirst({
      where: {
        code: input.templateCode,
        OR: [{ eventId: input.eventId }, { eventId: null }],
      },
    });

    if (!template) throw new NotFoundError(`Plantilla '${input.templateCode}' no encontrada`);

    // Filtros de grupo destino
    const whereClause: any = {
      eventId: input.eventId,
      status: { not: 'CANCELLED' },
    };

    if (!event.settings?.demoModeEnabled) {
      whereClause.isDemo = false;
    }

    if (input.targetGroup === 'CONFIRMED') {
      whereClause.status = 'CONFIRMED';
    } else if (input.targetGroup === 'PENDING_PAYMENT') {
      whereClause.balanceDue = { gt: 0 };
    } else if (input.targetGroup === 'ATTENDED') {
      whereClause.attended = true;
    }

    const targetRegistrations = await prisma.registration.findMany({
      where: whereClause,
      include: { participant: true, ticketType: true },
      take: 200, // Límite por lote para estabilidad
    });

    let sentCount = 0;
    let simulatedCount = 0;
    let failedCount = 0;

    for (const reg of targetRegistrations) {
      try {
        const res = await this.sendSingleEmail(
          {
            eventId: input.eventId,
            registrationId: reg.id,
            templateCode: input.templateCode,
            customMessage: input.customMessage,
          },
          userId
        );

        if (res.simulated) simulatedCount++;
        else sentCount++;
      } catch {
        failedCount++;
      }
    }

    return {
      totalTargeted: targetRegistrations.length,
      sentCount,
      simulatedCount,
      failedCount,
      targetGroup: input.targetGroup,
      templateCode: input.templateCode,
    };
  }

  /**
   * Consultar historial de correos con paginación y filtros
   */
  static async getLogs(eventId?: string | null, query: { page?: number; limit?: number; status?: string; search?: string } = {}) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (eventId) where.eventId = eventId;
    if (query.status) where.status = query.status;

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { recipientEmail: { contains: s } },
        { recipientName: { contains: s } },
        { subject: { contains: s } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        include: {
          sentByUser: { select: { id: true, fullName: true, email: true } },
          registration: { select: { id: true, registrationNumber: true } },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
