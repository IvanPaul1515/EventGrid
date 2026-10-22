import { EmailQueueWorker } from './communications.queue.js';
import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import {
  UpdateSmtpConfigInput,
  SendEmailInput,
  SendBulkEmailInput,
  UpdateTemplateInput,
  EmailPreviewInput,
  QueryLogsInput,
  ValidateRecipientsInput,
} from './communications.dto.js';
import { encryptSecret, decryptSecret } from '../../utils/crypto.js';
import { QrService } from '../qr/qr.service.js';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import crypto from 'crypto';

export class CommunicationsService {
  private static customTransporterFactory: ((config: any) => any) | null = null;

  static setTransporterFactory(factory: ((config: any) => any) | null) {
    this.customTransporterFactory = factory;
    EmailQueueWorker.setTransporterFactory(factory);
  }

  static createTransporter(config: any) {
    if (this.customTransporterFactory) {
      return this.customTransporterFactory(config);
    }
    const rawPassword = config.password ? decryptSecret(config.password) : '';
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: rawPassword } : undefined,
    });
  }
  /**
   * Obtener configuración SMTP (ocultando credenciales sensibles) (QA-12)
   */
  /**
   * QA-24: Obtener configuración SMTP cruda con prioridad estricta:
   * 1. Configuración de la edición específica
   * 2. Configuración global (eventId: null)
   */
  static async getRawConfig(eventId?: string | null) {
    if (eventId) {
      const editionConfig = await prisma.emailConfig.findFirst({
        where: { eventId },
      });
      if (editionConfig && editionConfig.isEnabled) {
        return editionConfig;
      }
      const globalConfig = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });
      if (globalConfig && globalConfig.isEnabled) {
        return globalConfig;
      }
      return editionConfig || globalConfig || null;
    }

    return await prisma.emailConfig.findFirst({
      where: { eventId: null },
    });
  }

  /**
   * QA-24: Obtener plantilla con prioridad estricta:
   * 1. Plantilla específica de la edición
   * 2. Plantilla global (eventId: null)
   * 3. Plantilla predeterminada del sistema
   */
  static async findTemplate(code: string, eventId?: string | null) {
    if (eventId) {
      const editionTemplate = await prisma.emailTemplate.findFirst({
        where: { code, eventId },
      });
      if (editionTemplate) return editionTemplate;
    }

    const globalTemplate = await prisma.emailTemplate.findFirst({
      where: { code, eventId: null },
    });
    if (globalTemplate) return globalTemplate;

    const def = this.DEFAULT_TEMPLATES.find((t) => t.code === code);
    if (def) {
      return {
        ...def,
        id: `default-${code}`,
        eventId: null,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    }

    return null;
  }

  static async getConfig(eventId?: string | null) {
    let config = null;

    if (eventId) {
      config = await prisma.emailConfig.findFirst({
        where: { eventId },
      });
      if (!config || !config.isEnabled) {
        const globalConfig = await prisma.emailConfig.findFirst({
          where: { eventId: null },
        });
        if (globalConfig && globalConfig.isEnabled) {
          config = globalConfig;
        }
      }
    }

    // Si no hay configuración específica para la edición, buscar la configuración global
    if (!config) {
      config = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });
    }

    if (!config) {
      return {
        isConfigured: false,
        isEnabled: false,
        isGlobal: true,
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
      isGlobal: !config.eventId,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user || '',
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail || '',
      hasPassword: Boolean(config.password && config.password.length > 0),
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Guardar configuración SMTP con cifrado seguro en reposo (QA-12)
   */
  static async saveConfig(input: UpdateSmtpConfigInput) {
    const existing = input.eventId
      ? await prisma.emailConfig.findFirst({ where: { eventId: input.eventId } })
      : await prisma.emailConfig.findFirst({ where: { eventId: null } });

    // Mantener la contraseña cifrada anterior si no se envía una nueva (QA-12)
    let passwordToStore: string | null = null;
    if (input.password && input.password.trim() !== '') {
      passwordToStore = encryptSecret(input.password);
    } else if (existing?.password) {
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
          password: passwordToStore,
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
          password: passwordToStore,
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
   * Probar conexión y envío de correo de prueba (QA-07, QA-12)
   */
  static async testConnection(recipientEmail: string, eventId?: string | null, userId?: string) {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new BadRequestError('Correo de destinatario de prueba inválido.');
    }

    // Buscar configuración de la edición o global
    let config = eventId
      ? await prisma.emailConfig.findFirst({ where: { eventId } })
      : null;

    if (!config) {
      config = await prisma.emailConfig.findFirst({ where: { eventId: null } });
    }

    if (!config || !config.isEnabled) {
      throw new BadRequestError(
        'El servicio de correos está deshabilitado o no está configurado. Configure y active el servidor SMTP en Administración.'
      );
    }

    const rawPassword = decryptSecret(config.password);

    const isTestOrDemo =
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      !rawPassword ||
      config.host.includes('mailtrap') ||
      config.host.includes('example') ||
      recipientEmail.includes('@eventgrid.test');

    if (isTestOrDemo) {
      // Simulación explícita y segura sin envío real en pruebas o entorno demo
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
        message: 'Conexión verificada en modo simulación segura (entorno de pruebas/demo activo).',
        log,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && rawPassword ? { user: config.user, pass: rawPassword } : undefined,
      });

      await transporter.verify();

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: recipientEmail,
        replyTo: config.replyToEmail || undefined,
        subject: 'Prueba de Configuración de Correo — EventGrid',
        text: 'Este es un correo de prueba generado desde la plataforma EventGrid para verificar la conectividad SMTP.',
        html: `
          <div style="font-family: sans-serif; padding: 24px; background: #09090b; color: #ffffff; border-radius: 12px; border: 1px solid #27272a;">
            <h2 style="color: #10b981; margin-top: 0;">Conexión Exitosa con EventGrid</h2>
            <p>La configuración del servidor SMTP está funcionando correctamente.</p>
            <p style="font-size: 13px; color: #a1a1aa;">Servidor: <strong>${config.host}:${config.port}</strong></p>
            <p style="font-size: 13px; color: #a1a1aa;">Remitente: <strong>${config.fromEmail}</strong></p>
            <p style="font-size: 11px; color: #71717a; margin-top: 20px;">EventGrid Platform — Sistema de Gestión de Eventos</p>
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
          status: 'ACCEPTED_BY_SMTP',
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
   * Semillas de plantillas estándar del sistema
   */
  public static readonly DEFAULT_TEMPLATES = [
    {
      code: 'REGISTRATION_CONFIRMATION',
      name: 'Confirmación de Registro',
      subject: '¡Registro confirmado para {{eventName}}!',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #38bdf8;">¡Hola, {{participantName}}!</h2>
          <p>Tu registro para <strong>{{eventName}}</strong> ha sido completado con éxito.</p>
          <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Número de Registro:</strong> {{registrationNumber}}</p>
            <p><strong>Tipo de Entrada:</strong> {{ticketType}}</p>
            <p><strong>Lugar:</strong> {{eventVenue}}</p>
            <p><strong>Fecha:</strong> {{eventDate}}</p>
          </div>
          {{messageContent}}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Nos vemos pronto en el evento.</p>
        </div>
      `,
      bodyText: 'Hola {{participantName}}, tu registro para {{eventName}} ha sido completado. Registro: {{registrationNumber}}.',
      variables: [
        'participantName',
        'eventName',
        'registrationNumber',
        'ticketType',
        'eventVenue',
        'eventDate',
        'messageContent',
      ],
    },
    {
      code: 'DIGITAL_TICKET',
      name: 'Entrada Digital con QR',
      subject: 'Tu entrada digital para {{eventName}} ({{registrationNumber}})',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #09090b; color: #fafafa; padding: 32px; border-radius: 16px; border: 1px solid #27272a; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #f43f5e; margin-top: 0;">Entrada Oficial — {{eventName}}</h2>
          <p>Presenta este código QR en la mesa de recepción al momento de ingresar:</p>
          <div style="text-align: center; margin: 24px 0; background: #ffffff; padding: 20px; border-radius: 12px; display: inline-block;">
            <img src="{{qrDataUrl}}" alt="Código QR de Acceso" style="width: 240px; height: 240px; display: block;" />
            <p style="color: #000000; font-family: monospace; font-weight: bold; margin-top: 8px;">{{registrationNumber}}</p>
          </div>
          <div style="background: #18181b; padding: 16px; border-radius: 8px; font-size: 13px;">
            <p style="margin: 4px 0;"><strong>Participante:</strong> {{participantName}}</p>
            <p style="margin: 4px 0;"><strong>Entrada:</strong> {{ticketType}}</p>
            <p style="margin: 4px 0;"><strong>Lugar:</strong> {{eventVenue}}</p>
            <p style="margin: 4px 0;"><strong>Fecha:</strong> {{eventDate}}</p>
          </div>
          {{messageContent}}
          <p style="color: #71717a; font-size: 11px; margin-top: 24px; text-align: center;">Este código QR es personal e intransferible. Válido para un único acceso.</p>
        </div>
      `,
      bodyText: 'Hola {{participantName}}, aquí tienes tu entrada para {{eventName}}. Código: {{registrationNumber}}. Enlace de acceso: {{qrUrl}}',
      variables: [
        'participantName',
        'eventName',
        'registrationNumber',
        'ticketType',
        'eventVenue',
        'eventDate',
        'qrUrl',
        'qrDataUrl',
        'messageContent',
      ],
    },
    {
      code: 'EVENT_REMINDER',
      name: 'Recordatorio del Evento',
      subject: 'Recordatorio: ¡{{eventName}} comienza pronto!',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #fbbf24;">¡Falta poco, {{participantName}}!</h2>
          <p>Te recordamos que <strong>{{eventName}}</strong> se llevará a cabo en:</p>
          <p><strong>Lugar:</strong> {{eventVenue}}</p>
          <p><strong>Fecha:</strong> {{eventDate}}</p>
          <p>Tu entrada registrada es: <strong>{{registrationNumber}}</strong> ({{ticketType}}).</p>
          {{messageContent}}
          <p>¡Esperamos contar con tu presencia!</p>
        </div>
      `,
      bodyText: 'Hola {{participantName}}, te recordamos que {{eventName}} se llevará a cabo en {{eventVenue}} el {{eventDate}}.',
      variables: [
        'participantName',
        'eventName',
        'registrationNumber',
        'ticketType',
        'eventVenue',
        'eventDate',
        'messageContent',
      ],
    },
    {
      code: 'PAYMENT_CONFIRMATION',
      name: 'Confirmación de Pago',
      subject: 'Recibo de pago confirmado — {{eventName}}',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #34d399;">Pago Confirmado</h2>
          <p>Estimado(a) {{participantName}}, hemos confirmado el pago de tu entrada para <strong>{{eventName}}</strong>.</p>
          <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Monto Pagado:</strong> {{currencySymbol}} {{amountPaid}}</p>
            <p><strong>Balance Pendiente:</strong> {{currencySymbol}} {{balanceDue}}</p>
            <p><strong>Ticket:</strong> {{registrationNumber}}</p>
          </div>
          {{messageContent}}
        </div>
      `,
      bodyText: 'Estimado(a) {{participantName}}, confirmamos el pago de {{currencySymbol}} {{amountPaid}} para {{eventName}}.',
      variables: [
        'participantName',
        'eventName',
        'registrationNumber',
        'amountPaid',
        'balanceDue',
        'currencySymbol',
        'messageContent',
      ],
    },
    {
      code: 'PENDING_BALANCE',
      name: 'Saldo Pendiente',
      subject: 'Saldo pendiente de pago — {{eventName}}',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #f87171;">Aviso de Saldo Pendiente</h2>
          <p>Hola {{participantName}}, tu inscripción para <strong>{{eventName}}</strong> tiene un balance pendiente:</p>
          <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Tarifa de Entrada:</strong> {{currencySymbol}} {{ticketPrice}}</p>
            <p><strong>Monto Abonado:</strong> {{currencySymbol}} {{amountPaid}}</p>
            <p style="color: #f87171; font-size: 16px;"><strong>Balance Pendiente:</strong> {{currencySymbol}} {{balanceDue}}</p>
          </div>
          <p>Puedes completar tu pago en taquilla el día del evento o vía transferencia previa.</p>
          {{messageContent}}
        </div>
      `,
      bodyText: 'Hola {{participantName}}, tu inscripción para {{eventName}} tiene un saldo pendiente de {{currencySymbol}} {{balanceDue}}.',
      variables: [
        'participantName',
        'eventName',
        'registrationNumber',
        'ticketPrice',
        'amountPaid',
        'balanceDue',
        'currencySymbol',
        'messageContent',
      ],
    },
    {
      code: 'CANCELLATION',
      name: 'Cancelación de Inscripción',
      subject: 'Inscripción cancelada — {{eventName}}',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #94a3b8;">Notificación de Cancelación</h2>
          <p>Estimado(a) {{participantName}}, te informamos que la inscripción <strong>{{registrationNumber}}</strong> para <strong>{{eventName}}</strong> ha sido cancelada.</p>
          {{messageContent}}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Si crees que esto es un error, por favor contáctanos.</p>
        </div>
      `,
      bodyText: 'Hola {{participantName}}, tu inscripción {{registrationNumber}} para {{eventName}} ha sido cancelada.',
      variables: ['participantName', 'eventName', 'registrationNumber', 'messageContent'],
    },
    {
      code: 'GENERAL_ANNOUNCEMENT',
      name: 'Comunicado General',
      subject: 'Aviso importante sobre {{eventName}}',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px;">
          <h2 style="color: #38bdf8;">Comunicado Oficial</h2>
          <p>Estimado(a) {{participantName}},</p>
          {{messageContent}}
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8;">
            <p>{{eventName}} — {{eventVenue}}</p>
          </div>
        </div>
      `,
      bodyText: 'Estimado(a) {{participantName}}, comunicado oficial de {{eventName}}.',
      variables: ['participantName', 'eventName', 'registrationNumber', 'messageContent'],
    },
  ];

  /**
   * Listar plantillas de correo para un evento (garantizando inicialización de las 7 estándar)
   */
  static async getTemplates(eventId?: string | null): Promise<any[]> {
    const existing = await prisma.emailTemplate.findMany({
      where: eventId ? { OR: [{ eventId }, { eventId: null }] } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    // Si aún no existen plantillas en la base de datos, inicializar las plantillas predeterminadas
    if (existing.length === 0) {
      for (const t of this.DEFAULT_TEMPLATES) {
        await prisma.emailTemplate.create({
          data: {
            eventId: eventId || null,
            code: t.code,
            name: t.name,
            subject: t.subject,
            bodyHtml: t.bodyHtml.trim(),
            bodyText: t.bodyText,
            variables: JSON.stringify(t.variables),
            isSystem: true,
          },
        }).catch(() => {});
      }

      return this.getTemplates(eventId);
    }

    return existing.map((t) => {
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
   * Renderizar plantilla sustituyendo variables oficiales (QA-08)
   */
  static async renderTemplateContent(
    template: { subject: string; bodyHtml: string; bodyText?: string | null },
    registration: any,
    overrides?: {
      customSubject?: string | null;
      customBodyHtml?: string | null;
      customMessage?: string | null;
    }
  ) {
    // QA-08: Obtener o generar token QR oficial y persistente
    let qrToken = registration.qrCode;
    if (!qrToken) {
      const ticketInfo = await QrService.getTicketQr(registration.id);
      qrToken = ticketInfo.qrToken;
    }

    const publicUrlBase = process.env.PUBLIC_APP_URL || 'https://eventgrid.app';
    const qrUrl = `${publicUrlBase}/t/${qrToken}`;

    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    const currencySymbol = registration.event?.settings?.currencySymbol || 'RD$';

    const variables: Record<string, string> = {
      participantName: registration.participant?.fullName || 'Participante',
      participantFirstName: registration.participant?.firstName || 'Participante',
      participantEmail: registration.participant?.email || '',
      eventName: registration.event?.name || 'Evento Oficial',
      eventYear: String(registration.event?.year || new Date().getFullYear()),
      eventDate: registration.event?.startDate
        ? new Date(registration.event.startDate).toLocaleDateString('es-DO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Por anunciar',
      eventVenue: registration.event?.venue || 'Sede Principal',
      registrationNumber: registration.registrationNumber || 'REG-0001',
      ticketType: registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
      ticketPrice: Number(registration.ticketPrice ?? registration.totalAmount ?? 0).toFixed(2),
      amountPaid: Number(registration.amountPaid ?? registration.totalAmount ?? 0).toFixed(2),
      balanceDue: Number(registration.balanceDue || 0).toFixed(2),
      currencySymbol,
      qrUrl,
      qrDataUrl,
      messageContent: overrides?.customMessage
        ? `<div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.05); border-left: 3px solid #f43f5e; border-radius: 4px;">${overrides.customMessage}</div>`
        : '',
    };

    let subject = overrides?.customSubject && overrides.customSubject.trim() !== ''
      ? overrides.customSubject
      : template.subject;

    let html = overrides?.customBodyHtml && overrides.customBodyHtml.trim() !== ''
      ? overrides.customBodyHtml
      : template.bodyHtml;

    let text = template.bodyText || '';

    // Sustitución de variables
    for (const [key, val] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, val);
      html = html.replace(regex, val);
      text = text.replace(regex, val);
    }

    return {
      subject,
      html,
      text,
      qrUrl,
      qrDataUrl,
      variables,
    };
  }

  /**
   * Vista previa real del correo (QA-11: Sin efectos secundarios)
   */
  static async previewEmail(input: EmailPreviewInput) {
    let registration: any = null;

    if (input.registrationId) {
      registration = await prisma.registration.findUnique({
        where: { id: input.registrationId },
        include: {
          participant: true,
          ticketType: true,
          event: { include: { settings: true } },
        },
      });
    }

    if (!registration && input.eventId) {
      // Tomar una inscripción real de muestra de esa edición si existe
      registration = await prisma.registration.findFirst({
        where: { eventId: input.eventId, status: { not: 'CANCELLED' } },
        include: {
          participant: true,
          ticketType: true,
          event: { include: { settings: true } },
        },
      });
    }

    // Si aún no hay participante real, generar datos de muestra realistas y explícitos
    if (!registration) {
      const event = input.eventId
        ? await prisma.event.findUnique({ where: { id: input.eventId }, include: { settings: true } })
        : null;

      registration = {
        id: 'sample-preview-id',
        registrationNumber: 'EVT-PREV-001',
        ticketPrice: 1750,
        amountPaid: 1750,
        balanceDue: 0,
        totalAmount: 1750,
        isCourtesy: false,
        qrCode: 'sample_qr_token_preview_only',
        participant: {
          id: 'sample-participant-id',
          fullName: 'Juan Pérez (Muestra)',
          firstName: 'Juan',
          lastName: 'Pérez',
          email: 'destinatario.muestra@ejemplo.com',
          documentId: '001-0000000-0',
          institution: 'Institución de Muestra',
        },
        ticketType: { name: 'Entrada General' },
        event: event || {
          name: 'Conferencia Principal 2026',
          year: 2026,
          venue: 'Auditorio Central',
          startDate: new Date(),
          settings: {
            currencySymbol: 'RD$',
            fromName: 'EventGrid Notificaciones',
            fromEmail: 'notificaciones@eventgrid.com',
          },
        },
      };
    }

    // QA-24: Buscar plantilla con prioridad estricta de edición
    const template = await this.findTemplate(input.templateCode, input.eventId);
    if (!template) {
      throw new NotFoundError(`Plantilla '${input.templateCode}' no encontrada.`);
    }

    const rendered = await this.renderTemplateContent(template, registration, {
      customSubject: input.customSubject ?? undefined,
      customBodyHtml: input.customBodyHtml ?? undefined,
      customMessage: input.customMessage ?? undefined,
    });

    const config = await this.getConfig(input.eventId || registration.event?.id);

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromName: config.fromName || 'EventGrid Notificaciones',
      fromEmail: config.fromEmail || 'notificaciones@eventgrid.com',
      recipientName: registration.participant.fullName,
      recipientEmail: registration.participant.email,
      registrationNumber: registration.registrationNumber,
      eventName: registration.event?.name || 'Evento Oficial',
      qrUrl: rendered.qrUrl,
      qrDataUrl: rendered.qrDataUrl,
    };
  }

  /**
   * Enviar correo individual a un participante (QA-07, QA-08)
   */
  static async sendSingleEmail(input: SendEmailInput, userId?: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: input.registrationId },
      include: {
        participant: true,
        ticketType: true,
        event: { include: { settings: true } },
      },
    });

    if (!registration) throw new NotFoundError('Inscripción no encontrada');

    // QA-07: Si eventId no venía en el payload, usar el de la inscripción
    const eventId = input.eventId || registration.eventId;

    // Verificar aislamiento de edición si se especificó un eventId discordante
    if (input.eventId && input.eventId !== registration.eventId) {
      throw new BadRequestError('La inscripción indicada no pertenece a la edición seleccionada.');
    }

    // QA-24: Buscar plantilla con prioridad estricta de edición
    const template = await this.findTemplate(input.templateCode, eventId);
    if (!template) {
      throw new NotFoundError(`Plantilla '${input.templateCode}' no encontrada.`);
    }

    // QA-07, QA-08: Renderizar con customSubject y customBodyHtml si fueron proporcionados
    const rendered = await this.renderTemplateContent(template, registration, {
      customSubject: input.customSubject || undefined,
      customBodyHtml: input.customBodyHtml || undefined,
      customMessage: input.customMessage || undefined,
    });

    // Determinar modo de envío solicitado: REAL vs SIMULATION
    const isSimulationRequested =
      input.mode === 'SIMULATION' || input.simulateOnly === true;

    // QA-24: Obtener configuración de correo con prioridad estricta de edición
    const config = await this.getRawConfig(eventId);
    const isSmtpConfiguredAndActive = Boolean(config && config.isEnabled && config.host);

    if (isSimulationRequested) {
      const log = await prisma.emailLog.create({
        data: {
          eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: input.templateCode,
          subject: rendered.subject,
          status: 'SIMULATED',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        log,
        simulated: true,
        message: 'Envío simulado correctamente (modo simulación solicitado).',
      };
    }

    // Modo REAL: Validar estrictamente configuración SMTP activa y no nula
    if (!config || !isSmtpConfiguredAndActive) {
      throw new BadRequestError(
        'El servidor SMTP no está configurado o está deshabilitado. No se puede realizar un envío real.'
      );
    }

    const rawPassword = config?.password ? decryptSecret(config.password) : '';
    if (config?.user && (!rawPassword || rawPassword.trim() === '')) {
      throw new BadRequestError(
        'Configuración SMTP incompleta: se especificó usuario pero la contraseña está ausente.'
      );
    }

    // Validar modo demostración
    const isDemoContext = Boolean(registration.isDemo || registration.event.settings?.demoModeEnabled);
    if (isDemoContext && !input.confirmedDemoSending) {
      throw new BadRequestError(
        'El evento o la inscripción se encuentra en modo demostración. Debe confirmar explícitamente el envío real hacia destinatarios externos.'
      );
    }

    // Envío real mediante transporte configurado o fábrica de pruebas
    try {
      const transporter = this.createTransporter(config);

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: registration.participant.email,
        replyTo: config.replyToEmail || undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      const log = await prisma.emailLog.create({
        data: {
          eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: input.templateCode,
          subject: rendered.subject,
          status: 'SENT',
          sentByUserId: userId || null,
        },
      });

      return {
        success: true,
        log,
        simulated: false,
        message: `Correo enviado exitosamente a ${registration.participant.email}`,
      };
    } catch (err: any) {
      const log = await prisma.emailLog.create({
        data: {
          eventId,
          registrationId: registration.id,
          recipientEmail: registration.participant.email,
          recipientName: registration.participant.fullName,
          templateCode: input.templateCode,
          subject: rendered.subject,
          status: 'FAILED',
          errorMessage: err.message || 'Error de envío',
          sentByUserId: userId || null,
        },
      });

      throw new BadRequestError(`Fallo al enviar correo: ${err.message}`);
    }
  }

  /**
   * Enviar correos masivos por lotes sin límite silencioso de 200 (QA-09)
   */
  static async sendBulkEmail(input: SendBulkEmailInput, userId?: string) {
    const event = await prisma.event.findUnique({
      where: { id: input.eventId },
      include: { settings: true },
    });

    if (!event) throw new NotFoundError('Edición no encontrada');

    // Construir filtro de destinatarios elegibles
    const where: any = {
      eventId: input.eventId,
      status: { not: 'CANCELLED' }, // QA-09: Excluir cancelados por defecto
    };

    // Excluir registros demo salvo que la edición esté en modo demo
    if (!event.settings?.demoModeEnabled) {
      where.isDemo = false;
    }

    if (input.targetGroup === 'CONFIRMED') {
      where.status = 'CONFIRMED';
    } else if (input.targetGroup === 'PAID') {
      where.paymentStatus = { in: ['PAID', 'COURTESY'] };
    } else if (input.targetGroup === 'PENDING' || input.targetGroup === 'PENDING_PAYMENT') {
      where.paymentStatus = { in: ['PENDING', 'PARTIAL'] };
    } else if (input.targetGroup === 'ATTENDED') {
      where.attended = true;
    } else if (input.targetGroup === 'NOT_ATTENDED') {
      where.attended = false;
    } else if (input.targetGroup === 'SELECTED' && input.selectedRegistrationIds?.length) {
      where.id = { in: input.selectedRegistrationIds };
    }

    // QA-09: Obtener TODOS los destinatarios elegibles (sin límite artificial de 200)
    const registrations = await prisma.registration.findMany({
      where,
      include: {
        participant: true,
        ticketType: true,
        event: { include: { settings: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (registrations.length === 0) {
      return {
        batchId: null,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        excludedCount: 0,
        message: 'No se encontraron destinatarios que cumplan con los filtros seleccionados.',
      };
    }

    // QA-24: Buscar plantilla con prioridad estricta de edición
    const template = await this.findTemplate(input.templateCode, input.eventId);
    if (!template) {
      throw new NotFoundError(`Plantilla '${input.templateCode}' no encontrada.`);
    }

    // QA-24: Configuración SMTP con prioridad estricta de edición
    const config = await this.getRawConfig(input.eventId);

    const isSimulationRequested =
      input.mode === 'SIMULATION' || input.simulateOnly === true;

    const isConfigActive = Boolean(config && config.isEnabled && config.host);

    if (!isSimulationRequested && !isConfigActive) {
      throw new BadRequestError('El servidor SMTP no está configurado o está deshabilitado. No se puede realizar un envío real.');
    }

    if (!isSimulationRequested && event.settings?.demoModeEnabled && !input.confirmedDemoSending) {
      throw new BadRequestError('El evento está en modo demostración. Debe confirmar explícitamente el envío masivo real en modo demo.');
    }

    const isGlobalSimulation = isSimulationRequested;

    const rawPassword = config ? decryptSecret(config.password) : '';
    let transporter: any = null;

    if (!isGlobalSimulation && config && rawPassword) {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user || '', pass: rawPassword },
      });
    }

    // Registrar EmailBatchJob persistente en estado PENDING
    const batchId = `BATCH-${crypto.randomUUID()}`;
    // QA-20 & QA-23: Persistir versión inmutable del contenido de la campaña
    const mode = (input.mode === 'SIMULATION' || input.simulateOnly) ? 'SIMULATION' : 'REAL';
    const approvedSubject = input.customSubject?.trim() || template.subject;
    const approvedBodyHtml = input.customBodyHtml?.trim() || template.bodyHtml;
    const approvedBodyText = template.bodyText || null;
    const templateSnapshot = JSON.stringify({
      code: template.code,
      name: template.name,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
    });

    await prisma.emailBatchJob.create({
      data: {
        id: batchId,
        eventId: input.eventId,
        templateCode: input.templateCode,
        subject: approvedSubject,
        bodyHtml: approvedBodyHtml,
        bodyText: approvedBodyText,
        customSubject: input.customSubject || null,
        customBodyHtml: input.customBodyHtml || null,
        customMessage: input.customMessage || null,
        templateSnapshot,
        mode,
        totalCount: registrations.length,
        status: 'PENDING',
        filterCriteria: JSON.stringify({
          targetGroup: input.targetGroup,
          simulateOnly: Boolean(input.simulateOnly),
          snapshotRecipientIds: registrations.map((r) => r.id),
        }),
        createdById: userId || null,
      },
    });

    // QA-20: Pre-renderizar cada destinatario para que la recuperación tras reinicio produzca el resultado idéntico
    const batchItemsData = await Promise.all(
      registrations.map(async (reg) => {
        const rendered = await this.renderTemplateContent(
          {
            subject: template.subject,
            bodyHtml: template.bodyHtml,
            bodyText: template.bodyText,
          } as any,
          reg,
          {
            customSubject: input.customSubject || undefined,
            customBodyHtml: input.customBodyHtml || undefined,
            customMessage: input.customMessage || undefined,
          }
        );
        const messageId = `<batch-${batchId}.${reg.id}@eventgrid.io>`;
        return {
          jobId: batchId,
          registrationId: reg.id,
          recipientEmail: reg.participant.email?.trim() || '',
          recipientName: reg.participant.fullName,
          status: 'PENDING',
          attempts: 0,
          idempotencyKey: `${batchId}:${reg.id}`,
          messageId,
          renderedSubject: rendered.subject,
          renderedHtml: rendered.html,
        };
      })
    );

    await prisma.emailBatchItem.createMany({
      data: batchItemsData,
    });

    // Disparar procesamiento asíncrono en cola sin bloquear la respuesta HTTP
    setImmediate(() => {
      EmailQueueWorker.processBatch(batchId, {
        customSubject: input.customSubject || undefined,
        customBodyHtml: input.customBodyHtml || undefined,
        customMessage: input.customMessage || undefined,
      }).catch((err) => {
        console.error('[EmailQueueWorker] Error procesando lote ' + batchId + ':', err);
      });
    });

    return {
      batchId,
      totalTargeted: registrations.length,
      sentCount: 0,
      simulatedCount: 0,
      failedCount: 0,
      excludedCount: 0,
      status: 'PENDING',
      message: `Lote de ${registrations.length} correos encolado exitosamente para procesamiento en segundo plano.`,
    };
  }

  /**
   * Obtener historial de comunicaciones con filtros, búsqueda y paginación (QA-10)
   */
  static async getLogs(eventId?: string | null, query: QueryLogsInput = { page: 1, limit: 20 }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.batchId) {
      where.batchId = query.batchId;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { recipientEmail: { contains: term } },
        { recipientName: { contains: term } },
        { subject: { contains: term } },
        { templateCode: { contains: term } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          sentByUser: { select: { id: true, fullName: true, email: true } },
          event: { select: { id: true, name: true, year: true } },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: logs,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      total,
      page,
      totalPages,
    };
  }

  /**
   * Conteo y prevalidación exacta de destinatarios (Sección 8)
   */
  static async getRecipientStats(input: ValidateRecipientsInput) {
    const event = await prisma.event.findUnique({
      where: { id: input.eventId },
      include: { settings: true },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const baseWhere: any = { eventId: input.eventId };

    if (input.targetGroup === 'CONFIRMED') {
      baseWhere.status = 'CONFIRMED';
    } else if (input.targetGroup === 'PAID') {
      baseWhere.paymentStatus = { in: ['PAID', 'COURTESY'] };
    } else if (input.targetGroup === 'PENDING' || input.targetGroup === 'PENDING_PAYMENT') {
      baseWhere.paymentStatus = { in: ['PENDING', 'PARTIAL'] };
    } else if (input.targetGroup === 'ATTENDED') {
      baseWhere.attended = true;
    } else if (input.targetGroup === 'NOT_ATTENDED') {
      baseWhere.attended = false;
    } else if (input.targetGroup === 'SELECTED' && input.selectedRegistrationIds?.length) {
      baseWhere.id = { in: input.selectedRegistrationIds };
    }

    const allRegistrations = await prisma.registration.findMany({
      where: baseWhere,
      include: {
        participant: true,
        ticketType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalSelected = allRegistrations.length;
    let cancelledCount = 0;
    let demoCount = 0;
    let invalidEmailsCount = 0;
    let validEmailsCount = 0;
    const seenEmails = new Set<string>();
    let duplicateCount = 0;
    const eligibleRegistrations: any[] = [];

    const isDemoMode = event.settings?.demoModeEnabled ?? false;

    for (const reg of allRegistrations) {
      if (reg.status === 'CANCELLED') {
        cancelledCount++;
        continue;
      }
      if (!isDemoMode && reg.isDemo) {
        demoCount++;
        continue;
      }
      const email = reg.participant?.email?.trim().toLowerCase();
      if (!email || !email.includes('@') || email.length < 5) {
        invalidEmailsCount++;
        continue;
      }
      validEmailsCount++;
      if (seenEmails.has(email)) {
        duplicateCount++;
        continue;
      }
      seenEmails.add(email);
      eligibleRegistrations.push(reg);
    }

    const eligibleCount = eligibleRegistrations.length;
    const sampleRecipients = eligibleRegistrations.slice(0, 10).map((r) => ({
      id: r.id,
      fullName: r.participant.fullName,
      email: r.participant.email,
      registrationNumber: r.registrationNumber,
      ticketType: r.ticketType?.name || (r.isCourtesy ? 'Cortesía' : 'General'),
      paymentStatus: r.paymentStatus,
    }));

    return {
      totalSelected,
      eligibleCount,
      validEmailsCount,
      invalidEmailsCount,
      cancelledCount,
      demoCount,
      duplicateCount,
      sampleRecipients,
    };
  }

  /**
   * Consultar historial de lotes persistentes de envío masivo (Sección 7)
   */
  static async getBatchJobs(eventId: string) {
    return await prisma.emailBatchJob.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        createdByUser: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  /**
   * Consultar estado y detalle de un lote de envío persistente (Sección 7)
   */
  static async getBatchJob(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      include: {
        createdByUser: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          take: 100,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!job) throw new NotFoundError('Lote de correo no encontrado');
    if (eventId && job.eventId !== eventId) {
      throw new NotFoundError('Lote de correo no encontrado en esta edición');
    }
    return job;
  }

  /**
   * Cancelar envíos pendientes de un lote persistente (Sección 7 / Fase 4)
   */
  static async cancelBatchJob(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Lote no encontrado');
    if (eventId && job.eventId !== eventId) {
      throw new NotFoundError('Lote no encontrado en esta edición');
    }

    const updatedJob = await EmailQueueWorker.cancelBatch(jobId, eventId);
    return updatedJob;
  }

  /**
   * Reintentar envíos fallidos de un lote persistente (Fase 4 / QA-31)
   */
  /**
   * QA-33: El endpoint genérico retryBatchJob solo reintenta fallos confirmados (status: 'FAILED').
   * Bajo NINGUNA circunstancia autoriza o reintenta envíos con estado incierto (UNKNOWN_DELIVERY_STATUS).
   * Los envíos ambiguos requieren obligatoriamente el endpoint específico retryUncertainBatchJob con
   * confirmación explícita de riesgo, motivo justificado y registro transaccional en auditoría.
   */
  static async retryBatchJob(jobId: string, eventId?: string) {
    return this.retryFailedBatchJob(jobId, eventId);
  }

  /**
   * QA-31: Reintentar ÚNICAMENTE envíos fallidos (status: 'FAILED')
   */
  static async retryFailedBatchJob(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Lote no encontrado');
    if (eventId && job.eventId !== eventId) {
      throw new NotFoundError('Lote no encontrado en esta edición');
    }

    const updatedJob = await EmailQueueWorker.retryFailed(jobId, eventId);
    return updatedJob;
  }

  /**
   * QA-31: Reintentar envíos con resultado incierto (status: 'UNKNOWN_DELIVERY_STATUS')
   * Requiere confirmación explícita de riesgo de duplicación y justificación.
   */
  static async retryUncertainBatchJob(
    jobId: string,
    eventId?: string,
    confirmation?: { confirmedDuplicateRisk?: boolean; reason?: string },
    userId?: string
  ) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Lote no encontrado');
    if (eventId && job.eventId !== eventId) {
      throw new NotFoundError('Lote no encontrado en esta edición');
    }

    const updatedJob = await EmailQueueWorker.retryUncertain(jobId, eventId, {
      confirmedDuplicateRisk: confirmation?.confirmedDuplicateRisk,
      reason: confirmation?.reason,
      userId,
    });
    return updatedJob;
  }
}
