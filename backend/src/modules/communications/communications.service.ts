import { recipientIneligibility } from './recipient-policy.js';
import { responsiveEmailHtml } from '../../utils/emailDocument.js';
import { safeCommunicationError } from '../../utils/communicationError.js';
import { uncertainMailFailure, mailFailureMessage } from '../../utils/mailFailure.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { brevoTransport, usesBrevoHttps } from './brevo.transport.js';
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
import fs from 'fs';
import path from 'path';

const emailText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

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

    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const isBlocked = process.env.BLOCK_REAL_EMAIL === 'true';
    const isDev = process.env.NODE_ENV === 'development';
    const allowRealInDev = process.env.ALLOW_REAL_EMAIL_IN_DEV === 'true';

    // Salvaguarda absoluta contra envíos de correo accidentales en pruebas o desarrollo
    if (isTest || isBlocked || (isDev && !allowRealInDev)) {
      console.warn('[CommunicationsService] 🛡️ SAFEGUARD ACTIVE: Real external SMTP is blocked in this environment (test/dev/safeguard). Using safe mock transport.');
      return {
        sendMail: async (mailOptions: any) => {
          return {
            messageId: `<mock-safeguard-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@eventgrid.test>`,
            response: '250 2.0.0 OK (SAFEGUARD_MOCK_TRANSPORT)',
            accepted: [mailOptions.to],
            rejected: [],
            pending: [],
          };
        },
        verify: async () => true,
        close: () => {},
      };
    }

    if (usesBrevoHttps()) return brevoTransport();
    const rawPassword = config.password ? decryptSecret(config.password) : '';
    const isExternalSmtp = Boolean(
      config.host &&
      !config.host.includes('localhost') &&
      !config.host.includes('127.0.0.1') &&
      !config.host.includes('test')
    );
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: Boolean(config.secure),
      auth: config.user ? { user: config.user, pass: rawPassword } : undefined,
      pool: isExternalSmtp,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
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
      if (editionConfig) {
        return editionConfig;
      }
      const globalConfig = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });
      return globalConfig || null;
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
    const aliasMap: Record<string, string> = {
      INSCRIPTION_CONFIRMATION: 'REGISTRATION_CONFIRMATION',
      REGISTRATION_CONFIRMATION: 'INSCRIPTION_CONFIRMATION',
      INSCRIPTION_CANCELLED: 'CANCELLATION',
      CANCELLATION: 'INSCRIPTION_CANCELLED',
    };
    const codesToTry = [code];
    if (aliasMap[code]) codesToTry.push(aliasMap[code]);

    for (const c of codesToTry) {
      if (eventId) {
        const editionTemplate = await prisma.emailTemplate.findFirst({
          where: { code: c, eventId },
        });
        if (editionTemplate) return editionTemplate;
      }

      const globalTemplate = await prisma.emailTemplate.findFirst({
        where: { code: c, eventId: null },
      });
      if (globalTemplate) return globalTemplate;

      const def = this.DEFAULT_TEMPLATES.find((t) => t.code === c);
      if (def) {
        return {
          ...def,
          id: `default-${c}`,
          eventId: null,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      }
    }

    return null;
  }

  static async getConfig(eventId?: string | null) {
    let config = null;

    if (eventId) {
      config = await prisma.emailConfig.findFirst({
        where: { eventId },
      });
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

    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const isBlocked = process.env.BLOCK_REAL_EMAIL === 'true';
    const isDev = process.env.NODE_ENV === 'development';
    const allowRealInDev = process.env.ALLOW_REAL_EMAIL_IN_DEV === 'true';

    const isTestOrDemo =
      isTest ||
      isBlocked ||
      (isDev && !allowRealInDev) ||
      (!rawPassword && !usesBrevoHttps()) ||
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
        message: 'Conexión verificada en modo simulación segura (entorno de pruebas/desarrollo activo sin llamadas externas).',
        log,
      };
    }

    try {
      const transporter = this.createTransporter(config);

      if (typeof (transporter as any).verify === 'function') {
        await (transporter as any).verify();
      }

      if (typeof (transporter as any).close === 'function') (transporter as any).close();
      return {
        success: true,
        simulated: false,
        message: 'Conexión SMTP verificada. No se envió ningún correo.',
        log: null,
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
    subject: '¡Registro recibido para {{eventName}}! — {{participantName}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <!-- Franja Superior Roja -->
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <!-- Encabezado del Evento -->
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                CONFIRMACIÓN OFICIAL • EVENTGRID
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <!-- Cuerpo del Mensaje -->
    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Hola, {{participantName}}!
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Tu registro para <strong>{{eventName}}</strong> ha sido recibido satisfactoriamente en el sistema oficial de inscripciones.
        </p>

        <!-- Tarjeta de Detalles de Inscripción -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Número de Registro:</td>
                  <td align="right" style="padding-bottom: 10px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 14px; font-weight: 800; color: #ED2917;">
                    {{registrationNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Participante:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{participantName}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Tipo de Entrada:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    <span style="display: inline-block; background-color: #261a1a; border: 1px solid #3d2424; padding: 2px 8px; border-radius: 4px;">{{ticketType}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a8a09a;">Estado de Pago:</td>
                  <td align="right" style="font-size: 12px;">
                    {{paymentStatusBadgeHtml}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Mensaje Personalizado Adicional (opcional) -->
        {{messageContent}}

        <!-- Botón de Acción -->
        <div style="text-align: center; margin: 24px 0 16px 0;">
          <a href="{{scheduleUrl}}" style="display: inline-block; background-color: #ED2917; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 12px 28px; border-radius: 8px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(237, 41, 23, 0.35);">
            Consultar Agenda del Evento
          </a>
        </div>

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #a8a09a; text-align: center;">
          Conserva este correo como comprobante de tu registro. Si tu entrada incluye código QR, podrás consultarla en el correo de Entrada Digital.
        </p>
      </td>
    </tr>

    <!-- Pie de Página Oficial -->
    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0 0 10px 0; font-size: 11px; color: #6b6460; line-height: 1.4;">
          Pontificia Universidad Católica Madre y Maestra (PUCMM) • Santiago de los Caballeros, Rep. Dom.
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>. Para consultas o asistencia, responde a este correo.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, tu registro para {{eventName}} ha sido recibido. Registro: {{registrationNumber}}. Tipo: {{ticketType}}. Estado de pago: {{paymentStatusText}}.',
    variables: [
      'participantName',
      'eventName',
      'registrationNumber',
      'ticketType',
      'eventVenue',
      'eventDate',
      'paymentStatusText',
      'paymentStatusBadgeHtml',
      'scheduleUrl',
      'messageContent',
    ],
  },
    {
    code: 'DIGITAL_TICKET',
    name: 'Entrada Digital con QR',
    subject: 'Tu Entrada Digital para {{eventName}} — Ticket {{registrationNumber}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <!-- Franja Superior de Color de la Edicion -->
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>

    <!-- Encabezado del Evento -->
    <tr>
      <td style="padding: 24px 28px 16px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(237, 41, 23, 0.3);">
                ENTRADA OFICIAL EVENTGRID
              </span>
              <h1 style="margin: 10px 0 6px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <!-- Separador -->
    <tr>
      <td style="padding: 0 28px;">
        <div style="border-top: 1px solid #261a1a; font-size: 1px; line-height: 1px;">&nbsp;</div>
      </td>
    </tr>

    <!-- Datos del Participante y Registro -->
    <tr>
      <td style="padding: 18px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <!-- Columna Participante -->
            <td width="55%" valign="top" style="text-align: left; padding-right: 12px;">
              <p style="margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #a8a09a;">
                PARTICIPANTE
              </p>
              <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 700; color: #f5f1ec; line-height: 1.2;">
                {{participantName}}
              </p>
              {{institutionHtml}}
            </td>

            <!-- Columna Registro y Entrada -->
            <td width="45%" valign="top" style="text-align: left;">
              <p style="margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #a8a09a;">
                NO. REGISTRO &amp; TIPO
              </p>
              <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 900; font-family: 'SF Mono', Consolas, Monaco, monospace; color: #ED2917; line-height: 1.2;">
                {{registrationNumber}}
              </p>
              <div style="margin-top: 5px;">
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #f5f1ec; background-color: #261a1a; padding: 2px 8px; border-radius: 4px; border: 1px solid #3d2424;">
                  {{ticketType}}
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Mensaje Personalizado Adicional (opcional) -->
    {{messageContent}}

    <!-- Codigo QR Individual Central -->
    <tr>
      <td style="padding: 8px 28px 20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #160f0f; border: 1px dashed #3d2424; border-radius: 14px;">
          <tr>
            <td align="center" style="padding: 24px 16px;">
              <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                <img src="{{qrDataUrl}}" alt="Código QR de Acceso" width="200" height="200" style="display: block; width: 200px; height: 200px; border: 0;" />
              </div>
              <p style="margin: 14px auto 0 auto; max-width: 380px; font-size: 12px; font-weight: 600; color: #e5dfd8; text-align: center; line-height: 1.4;">
                Presente este código QR en el módulo de recepción para registrar su entrada.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Pie del Ticket -->
    <tr>
      <td style="padding: 0 28px 24px 28px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #6b6460; line-height: 1.4;">
          Este ticket es oficial, personal e intransferible. Válido para el acceso a <strong>{{eventName}}</strong>.<br/>
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, tu Entrada Digital para {{eventName}} ha sido emitida. Ticket: {{registrationNumber}}. Tipo: {{ticketType}}. Fecha: {{eventDate}}. Lugar: {{eventVenue}}. Presenta tu código QR en la mesa de recepción.',
    variables: [
      'participantName',
      'nombre',
      'eventName',
      'evento',
      'registrationNumber',
      'numero_registro',
      'ticketType',
      'tipo_entrada',
      'eventVenue',
      'lugar',
      'eventDate',
      'fecha',
      'institucion',
      'institutionHtml',
      'eventLogoHtml',
      'primaryColor',
      'qrUrl',
      'qrDataUrl',
      'qr',
      'messageContent',
    ],
  },
    {
    code: 'EVENT_REMINDER',
    name: 'Recordatorio del Evento',
    subject: 'Recordatorio: ¡Nos vemos pronto en {{eventName}}!',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                RECORDATORIO OFICIAL
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Falta muy poco para vernos, {{participantName}}!
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Te recordamos los datos clave de tu participación en <strong>{{eventName}}</strong>:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Lugar:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{eventVenue}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Fecha:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{eventDate}}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a8a09a;">Tu Ticket:</td>
                  <td align="right" style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 14px; font-weight: 800; color: #ED2917;">
                    {{registrationNumber}} ({{ticketType}})
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Recomendaciones para Asistir -->
        <div style="background-color: #160f0f; border-left: 3px solid #ED2917; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #f5f1ec;">
            Recomendaciones para tu Asistencia
          </h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.6; color: #a8a09a;">
            <li>Llega con tiempo a la mesa de acreditación para retirar tu kit oficial.</li>
            <li>Ten a mano en tu celular el código QR de tu Entrada Digital.</li>
            <li>Trae tus dispositivos con carga completa y actitud participativa.</li>
          </ul>
        </div>

        {{messageContent}}

        <div style="text-align: center; margin: 24px 0 16px 0;">
          <a href="{{scheduleUrl}}" style="display: inline-block; background-color: #ED2917; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 12px 28px; border-radius: 8px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(237, 41, 23, 0.35);">
            Ver Agenda y Cronograma
          </a>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, te recordamos que {{eventName}} se llevará a cabo en {{eventVenue}} el {{eventDate}}. Ticket: {{registrationNumber}}.',
    variables: [
      'participantName',
      'eventName',
      'registrationNumber',
      'ticketType',
      'eventVenue',
      'eventDate',
      'scheduleUrl',
      'messageContent',
    ],
  },
    {
    code: 'PAYMENT_CONFIRMATION',
    name: 'Confirmación de Pago',
    subject: 'Comprobante de pago confirmado — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #10b981; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #34d399; background-color: rgba(16, 185, 129, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
                COMPROBANTE DE PAGO
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #34d399; letter-spacing: -0.3px;">
          ¡Pago Confirmado!
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Estimado(a) <strong>{{participantName}}</strong>, confirmamos que el pago de tu entrada para <strong>{{eventName}}</strong> ha sido procesado y registrado con éxito.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Ticket / Referencia:</td>
                  <td align="right" style="padding-bottom: 10px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 14px; font-weight: 800; color: #ED2917;">
                    {{registrationNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Monto Acreditado:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 15px; font-weight: 900; color: #34d399;">
                    {{currencySymbol}} {{amountPaid}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Balance Pendiente:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{currencySymbol}} {{balanceDue}}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a8a09a;">Estado:</td>
                  <td align="right" style="font-size: 12px;">
                    <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #34d399; background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); padding: 2px 8px; border-radius: 4px;">Confirmado</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        {{messageContent}}

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #a8a09a; text-align: center;">
          Tu participación queda formalmente acreditada. Podrás presentar tu código QR en recepción el día del evento.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Estimado(a) {{participantName}}, confirmamos el pago de {{currencySymbol}} {{amountPaid}} para {{eventName}}. Ticket: {{registrationNumber}}.',
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
    subject: 'Aviso de saldo pendiente — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #f59e0b; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #fbbf24; background-color: rgba(245, 158, 11, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.3);">
                SALDO PENDIENTE
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #fbbf24; letter-spacing: -0.3px;">
          Aviso de Saldo Pendiente
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Hola <strong>{{participantName}}</strong>, te informamos que tu inscripción para <strong>{{eventName}}</strong> registra un balance pendiente de pago:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Ticket / Inscripción:</td>
                  <td align="right" style="padding-bottom: 10px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 14px; font-weight: 800; color: #ED2917;">
                    {{registrationNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Tarifa de Entrada:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{currencySymbol}} {{ticketPrice}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Monto Abonado:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{currencySymbol}} {{amountPaid}}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a8a09a;">Balance Pendiente:</td>
                  <td align="right" style="font-size: 15px; font-weight: 900; color: #fbbf24;">
                    {{currencySymbol}} {{balanceDue}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #a8a09a;">
          Puedes completar tu pago en la mesa de recepción el día del evento o vía transferencia bancaria previa comunicándote con la organización.
        </p>

        {{messageContent}}
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, tu inscripción para {{eventName}} registra un balance pendiente de {{currencySymbol}} {{balanceDue}}.',
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
    subject: 'Inscripción cancelada — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #6b6460; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #a8a09a; background-color: rgba(255, 255, 255, 0.08); padding: 3px 10px; border-radius: 6px; border: 1px solid #332222;">
                AVISO DE CANCELACIÓN
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block;">📍 {{eventVenue}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #a8a09a; letter-spacing: -0.3px;">
          Notificación de Cancelación
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Estimado(a) <strong>{{participantName}}</strong>, te informamos que la inscripción <strong>{{registrationNumber}}</strong> para <strong>{{eventName}}</strong> ha sido cancelada en el sistema.
        </p>

        {{messageContent}}

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #a8a09a;">
          Si consideras que esto ocurrió por error o deseas reactivar tu registro, por favor responde a este correo para asistirte.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, la inscripción {{registrationNumber}} para {{eventName}} ha sido cancelada.',
    variables: ['participantName', 'eventName', 'registrationNumber', 'messageContent'],
  },
    {
    code: 'GENERAL_ANNOUNCEMENT',
    name: 'Comunicado General',
    subject: 'Aviso importante sobre {{eventName}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                COMUNICADO OFICIAL
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          Comunicado Oficial
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Estimado(a) <strong>{{participantName}}</strong>,
        </p>

        {{messageContent}}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #261a1a; font-size: 12px; color: #a8a09a;">
          <p style="margin: 0;">{{eventName}} — {{eventVenue}}</p>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Estimado(a) {{participantName}}, comunicado oficial de {{eventName}}.',
    variables: ['participantName', 'eventName', 'registrationNumber', 'messageContent'],
  },
    {
    code: 'SCHEDULE_ANNOUNCEMENT',
    name: 'Cronograma Oficial del Evento',
    subject: 'Cronograma Oficial y Charlas — {{eventName}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                AGENDA &amp; CRONOGRAMA
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Hola, {{participantName}}!
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Te compartimos la agenda y cronograma oficial de conferencias y actividades para <strong>{{eventName}}</strong>:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 14px 18px;">
              <span style="font-size: 12px; color: #a8a09a;">Tu entrada registrada: </span>
              <strong style="font-family: 'SF Mono', Consolas, Monaco, monospace; color: #ED2917; font-size: 13px;">{{registrationNumber}}</strong>
              <span style="color: #6b6460;"> • </span>
              <span style="font-size: 12px; color: #f5f1ec;">{{ticketType}}</span>
            </td>
          </tr>
        </table>

        {{messageContent}}

        <div style="margin-top: 24px;">
          <h3 style="color: #ED2917; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #261a1a; padding-bottom: 8px; margin: 0 0 12px 0;">
            Charlas y Actividades Confirmadas
          </h3>
          {{scheduleHtml}}
        </div>

        <p style="margin: 20px 0 0 0; font-size: 11px; line-height: 1.5; color: #6b6460; text-align: center;">
          Las actividades pueden estar sujetas a ajustes menores de última hora. Te recomendamos llegar con anticipación.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, consulta el cronograma oficial de {{eventName}} en {{eventVenue}}.',
    variables: [
      'participantName',
      'eventName',
      'registrationNumber',
      'ticketType',
      'eventVenue',
      'eventDate',
      'scheduleHtml',
      'messageContent',
    ],
  },
    {
    code: 'SCHEDULE_CHANGE_ALERT',
    name: 'Actualización del Cronograma (Cambio de Horario/Actividad)',
    subject: 'Actualización del cronograma — {{activityTitle}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                CAMBIO DE CRONOGRAMA
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Hola, {{participantName}}!
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Te informamos sobre una actualización en el cronograma oficial de <strong>{{eventName}}</strong>:
        </p>

        <div style="background-color: #181111; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ED2917; border: 1px solid #2d1c1c;">
          <h3 style="color: #f5f1ec; margin-top: 0; font-size: 16px; font-weight: 800;">{{activityTitle}}</h3>
          {{changeSummaryHtml}}
        </div>

        {{messageContent}}

        <div style="text-align: center; margin: 24px 0;">
          <a href="{{scheduleUrl}}" style="background-color: #ED2917; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 13px; display: inline-block;">
            Consultar Cronograma Actualizado
          </a>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, la conferencia {{activityTitle}} en {{eventName}} ha sido actualizada. Consulta el cronograma en {{scheduleUrl}}',
    variables: [
      'participantName',
      'eventName',
      'activityTitle',
      'changeSummaryHtml',
      'scheduleUrl',
      'messageContent',
    ],
  },
    {
    code: 'KEYNOTE_ANNOUNCEMENT',
    name: 'Anuncio de Keynote / Conferencia Magistral',
    subject: '¡Ya tenemos keynote! — {{eventName}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                KEYNOTE OFICIAL
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Llegó el momento de anunciar nuestra conferencia magistral!
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Hola, <strong>{{participantName}}</strong>:
        </p>

        <div style="background-color: #181111; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ED2917; border: 1px solid #2d1c1c;">
          <span style="background-color: #ED2917; color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; font-family: 'SF Mono', Consolas, monospace;">Keynote Oficial</span>
          <h3 style="color: #f5f1ec; margin: 12px 0 8px 0; font-size: 18px; font-weight: 800;">{{activityTitle}}</h3>
          <p style="margin: 4px 0; color: #a8a09a; font-size: 13px;"><strong>Ponente:</strong> <span style="color: #f5f1ec;">{{speakerName}}</span> {{speakerCompany}}</p>
          <p style="margin: 4px 0; color: #a8a09a; font-size: 13px;"><strong>Horario:</strong> <span style="color: #f5f1ec;">{{activityTime}} ({{activityDay}})</span></p>
          <p style="margin: 4px 0; color: #a8a09a; font-size: 13px;"><strong>Lugar:</strong> <span style="color: #f5f1ec;">{{activityRoom}}</span></p>
          {{keynoteDescriptionHtml}}
        </div>

        {{messageContent}}

        <div style="text-align: center; margin: 24px 0;">
          <a href="{{scheduleUrl}}" style="background-color: #ED2917; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 13px; display: inline-block;">
            Ver Cronograma Completo
          </a>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, ¡Llegó el momento de anunciar el Keynote de {{eventName}}! {{activityTitle}} por {{speakerName}}.',
    variables: [
      'participantName',
      'eventName',
      'activityTitle',
      'speakerName',
      'speakerCompany',
      'activityTime',
      'activityDay',
      'activityRoom',
      'keynoteDescriptionHtml',
      'scheduleUrl',
      'messageContent',
    ],
  },
    {
    code: 'INSCRIPTION_CONFIRMATION',
    name: 'Confirmación de Registro',
    subject: '¡Registro recibido para {{eventName}}! — {{participantName}}',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <!-- Franja Superior Roja -->
    <tr>
      <td style="height: 6px; background-color: #ED2917; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <!-- Encabezado del Evento -->
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #ED2917; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3);">
                CONFIRMACIÓN OFICIAL • EVENTGRID
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block; margin-right: 14px;">📍 {{eventVenue}}</span>
                <span style="display: inline-block;">📅 {{eventDate}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <!-- Cuerpo del Mensaje -->
    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #f5f1ec; letter-spacing: -0.3px;">
          ¡Hola, {{participantName}}!
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Tu registro para <strong>{{eventName}}</strong> ha sido recibido satisfactoriamente en el sistema oficial de inscripciones.
        </p>

        <!-- Tarjeta de Detalles de Inscripción -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Número de Registro:</td>
                  <td align="right" style="padding-bottom: 10px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 14px; font-weight: 800; color: #ED2917;">
                    {{registrationNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Participante:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    {{participantName}}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px; font-size: 12px; color: #a8a09a;">Tipo de Entrada:</td>
                  <td align="right" style="padding-bottom: 10px; font-size: 13px; font-weight: 700; color: #f5f1ec;">
                    <span style="display: inline-block; background-color: #261a1a; border: 1px solid #3d2424; padding: 2px 8px; border-radius: 4px;">{{ticketType}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a8a09a;">Estado de Pago:</td>
                  <td align="right" style="font-size: 12px;">
                    {{paymentStatusBadgeHtml}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Mensaje Personalizado Adicional (opcional) -->
        {{messageContent}}

        <!-- Botón de Acción -->
        <div style="text-align: center; margin: 24px 0 16px 0;">
          <a href="{{scheduleUrl}}" style="display: inline-block; background-color: #ED2917; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 12px 28px; border-radius: 8px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(237, 41, 23, 0.35);">
            Consultar Agenda del Evento
          </a>
        </div>

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #a8a09a; text-align: center;">
          Conserva este correo como comprobante de tu registro. Si tu entrada incluye código QR, podrás consultarla en el correo de Entrada Digital.
        </p>
      </td>
    </tr>

    <!-- Pie de Página Oficial -->
    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0 0 10px 0; font-size: 11px; color: #6b6460; line-height: 1.4;">
          Pontificia Universidad Católica Madre y Maestra (PUCMM) • Santiago de los Caballeros, Rep. Dom.
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>. Para consultas o asistencia, responde a este correo.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, tu registro para {{eventName}} ha sido recibido. Registro: {{registrationNumber}}. Tipo: {{ticketType}}. Estado de pago: {{paymentStatusText}}.',
    variables: [
      'participantName',
      'eventName',
      'registrationNumber',
      'ticketType',
      'eventVenue',
      'eventDate',
      'paymentStatusText',
      'paymentStatusBadgeHtml',
      'scheduleUrl',
      'messageContent',
    ],
  },
    {
    code: 'INSCRIPTION_CANCELLED',
    name: 'Cancelación de Inscripción',
    subject: 'Inscripción cancelada — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `<div style="background-color: #0a0707; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #110c0c; border-radius: 16px; border: 1px solid #261a1a; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6);">
    <tr>
      <td style="height: 6px; background-color: #6b6460; line-height: 6px; font-size: 1px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding: 24px 28px 18px 28px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="text-align: left;">
              <span style="display: inline-block; font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #a8a09a; background-color: rgba(255, 255, 255, 0.08); padding: 3px 10px; border-radius: 6px; border: 1px solid #332222;">
                AVISO DE CANCELACIÓN
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 20px; font-weight: 800; color: #f5f1ec; line-height: 1.25; letter-spacing: -0.3px;">
                {{eventName}}
              </h1>
              <div style="font-size: 12px; color: #a8a09a; margin-top: 4px; line-height: 1.5;">
                <span style="display: inline-block;">📍 {{eventVenue}}</span>
              </div>
            </td>
            {{eventLogoHtml}}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px 28px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #a8a09a; letter-spacing: -0.3px;">
          Notificación de Cancelación
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
          Estimado(a) <strong>{{participantName}}</strong>, te informamos que la inscripción <strong>{{registrationNumber}}</strong> para <strong>{{eventName}}</strong> ha sido cancelada en el sistema.
        </p>

        {{messageContent}}

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #a8a09a;">
          Si consideras que esto ocurrió por error o deseas reactivar tu registro, por favor responde a este correo para asistirte.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 20px 28px; background-color: #0c0808; border-top: 1px solid #261a1a; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #f5f1ec;">
          BarCamp República Dominicana 2026
        </p>
        <p style="margin: 0; font-size: 10px; color: #6b6460; line-height: 1.4;">
          Emitido por el sistema <strong>EventGrid</strong>.
        </p>
      </td>
    </tr>
  </table>
</div>`,
    bodyText: 'Hola {{participantName}}, la inscripción {{registrationNumber}} para {{eventName}} ha sido cancelada.',
    variables: ['participantName', 'eventName', 'registrationNumber', 'messageContent'],
  }
  , ...[
    { code: 'PAYMENT_REMINDER', name: 'Recordatorio de pago', title: 'Tu inscripción tiene un saldo pendiente', copy: 'Completa el pago por los canales oficiales de la universidad. Este aviso no confirma un pago.' },
    { code: 'NONPAYMENT_CANCELLATION', name: 'Anulación por impago', title: 'Entrada anulada por impago', copy: 'La entrada fue anulada después de la revisión administrativa del plazo de pago. El QR ya no permite acceder.' },
    { code: 'VOLUNTARY_CANCELLATION', name: 'Cancelación voluntaria', title: 'Cancelación de tu entrada', copy: 'Se registró la cancelación de tu entrada. Una cancelación no implica que se haya realizado una devolución.' },
    { code: 'REFUND_REQUESTED_NOTICE', name: 'Solicitud de reembolso recibida', title: 'Solicitud de reembolso recibida', copy: 'La solicitud está pendiente de revisión administrativa. No se ha confirmado una devolución de dinero.' },
    { code: 'REFUND_APPROVED_NOTICE', name: 'Reembolso aprobado', title: 'Reembolso aprobado, pendiente de gestión', copy: 'La administración aprobó la solicitud. La aprobación no significa que el dinero ya haya sido devuelto.' },
    { code: 'REFUND_PENDING_NOTICE', name: 'Reembolso pendiente de devolución', title: 'Devolución pendiente de confirmación', copy: 'La devolución está pendiente de ejecución o confirmación por su canal de origen. El dinero todavía no figura como devuelto en EventGrid.' },
    { code: 'REFUND_NOTICE', name: 'Devolución confirmada', title: 'Devolución registrada', copy: 'La administración registró una devolución efectivamente realizada por el canal de origen. EventGrid registra la operación y no ejecuta transferencias.' },
  ].map(t => ({ code: t.code, name: t.name, subject: t.title + ' — {{eventName}} · {{registrationNumber}}', bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;line-height:1.6;border-top:4px solid {{primaryColor}}"><table role="presentation"><tr>{{eventLogoHtml}}</tr></table><h1 style="font-size:22px">${t.title}</h1><p>Hola {{participantName}},</p><p>${t.copy}</p><p>{{eventName}} · Entrada {{registrationNumber}} · Referencia externa: {{externalReference}}</p>${t.code === 'PAYMENT_REMINDER' ? '<p>Saldo pendiente: {{currencySymbol}} {{balanceDue}}</p><p>Fecha límite: {{paymentDeadline}}</p><p>{{paymentInstructions}}</p>' : ''}${t.code === 'REFUND_NOTICE' ? '<p>Importe devuelto: {{currencySymbol}} {{refundAmount}} · Método: {{refundMethod}} · Referencia: {{refundReference}}</p>' : ''}<p>Contacto: {{paymentSupportContact}}</p><p>{{messageContent}}</p></div>`, bodyText: t.title + ' · {{eventName}} · {{registrationNumber}}. ' + t.copy, variables: ['participantName','eventName','registrationNumber','externalReference','balanceDue','currencySymbol','paymentDeadline','paymentInstructions','paymentSupportContact','refundAmount','refundMethod','refundReference','messageContent'] }))
  ];

  /**
   * Listar plantillas de correo para un evento (garantizando inicialización de las 7 estándar)
   */
  static async getTemplates(eventId?: string | null): Promise<any[]> {
    const existing = await prisma.emailTemplate.findMany({
      where: eventId ? { OR: [{ eventId }, { eventId: null }] } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    // Asegurar que todas las plantillas estándar del sistema existan
    const existingCodes = new Set(existing.map((t) => t.code));
    let hasInsertedMissing = false;

    for (const t of this.DEFAULT_TEMPLATES) {
      if (!existingCodes.has(t.code)) {
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
        hasInsertedMissing = true;
      }
    }

    if (hasInsertedMissing) {
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

    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'H',
    });
    const qrDataUrl = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const eventId = registration.eventId || registration.event?.id;
    let scheduleHtml = '';
    if (eventId) {
      try {
        const scheduleItems = await prisma.scheduleItem.findMany({
          where: { eventId, status: { not: 'CANCELLED' }, OR: [{ visibility: 'PUBLISHED' }, { visibility: 'SCHEDULED', publishAt: { lte: new Date() } }] },
          orderBy: [{ day: 'asc' }, { startTime: 'asc' }, { order: 'asc' }],
        });
        if (scheduleItems.length > 0) {
          scheduleHtml = `
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; font-size: 14px;">
              <thead>
                <tr style="background: #181010; color: #a8a09a; border-bottom: 2px solid #ED2917; text-align: left;">
                  <th style="padding: 10px 12px; border-radius: 6px 0 0 6px;">Hora</th>
                  <th style="padding: 10px 12px;">Actividad / Charla</th>
                  <th style="padding: 10px 12px;">Salón</th>
                  <th style="padding: 10px 12px; border-radius: 0 6px 6px 0;">Expositor</th>
                </tr>
              </thead>
              <tbody>
                ${scheduleItems.map((item, idx) => `
                  <tr style="border-bottom: 1px solid #334155; background: ${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'};">
                    <td style="padding: 10px 12px; color: #ED2917; font-weight: bold; font-family: monospace; white-space: nowrap;">${item.startTime} - ${item.endTime}</td>
                    <td style="padding: 10px 12px; color: #f8fafc;">
                      <div style="font-weight: 600;">${item.title}</div>
                      ${item.category ? `<span style="display: inline-block; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #334155; color: #cbd5e1; margin-top: 4px;">${item.category}</span>` : ''}
                    </td>
                    <td style="padding: 10px 12px; color: #cbd5e1;">${item.room || 'Principal'}</td>
                    <td style="padding: 10px 12px; color: #cbd5e1;">${item.speakerName || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        } else {
          scheduleHtml = '<p style="color: #94a3b8; font-style: italic;">El cronograma detallado de actividades será anunciado próximamente.</p>';
        }
      } catch {}
    }

    const currencySymbol = registration.event?.settings?.currencySymbol || 'RD$';
    const institution = registration.participant?.institution?.trim();
    const institutionHtml = institution
      ? `<p style="margin: 3px 0 0 0; font-size: 12px; color: #64748b;">${institution}</p>`
      : '';
    const rawLogoUrl = registration.event?.settings?.logoUrl || (registration.event as any)?.logoUrl || '';
    const logoUrl = rawLogoUrl ? (rawLogoUrl.startsWith('http') ? rawLogoUrl : `${publicUrlBase}${rawLogoUrl.startsWith('/') ? '' : '/'}${rawLogoUrl}`) : '';
    const eventLogoHtml = logoUrl
      ? `<td valign="top" align="right" style="width: 60px; padding-left: 12px;"><img src="${logoUrl}" alt="${registration.event?.name || 'Evento'}" width="52" height="52" style="display: block; width: 52px; height: 52px; object-fit: contain; border-radius: 10px; border: 1px solid #261a1a; padding: 2px; background-color: #1a1212;" /></td>`
      : `<td valign="top" align="right" style="width: 60px; padding-left: 12px;"><div style="background-color: #1a1212; border: 1px solid #2b1b1b; border-radius: 10px; padding: 6px 8px; text-align: center; display: inline-block;"><span style="font-family: Arial, sans-serif; font-weight: 900; font-size: 15px; color: #ED2917; letter-spacing: -0.5px;">BC</span><span style="font-family: monospace; font-weight: 800; font-size: 13px; color: #f5f1ec;">26</span></div></td>`;

    const scheduleUrl = `${publicUrlBase}/schedule`;
    const primaryColor = registration.event?.settings?.primaryColor || '#ED2917';

    const variables: Record<string, string> = {
      primaryColor,
      eventColor: primaryColor,
      logoUrl,
      eventLogo: logoUrl,
      scheduleUrl,
      activityTitle: (overrides as any)?.activityTitle || '',
      changeSummaryHtml: (overrides as any)?.changeSummaryHtml || '',
      speakerName: (overrides as any)?.speakerName || '',
      speakerCompany: (overrides as any)?.speakerCompany ? `(${(overrides as any).speakerCompany})` : '',
      activityTime: (overrides as any)?.activityTime || '',
      activityDay: (overrides as any)?.activityDay || '',
      activityRoom: (overrides as any)?.activityRoom || '',
      keynoteDescriptionHtml: (overrides as any)?.keynoteDescriptionHtml || '',
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
      externalReference: emailText(registration.externalReference || 'No disponible'),
      paymentDeadline: registration.event?.settings?.paymentDeadlineAt ? new Date(registration.event.settings.paymentDeadlineAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }) : 'No configurada',
      paymentInstructions: emailText(registration.event?.settings?.paymentInstructions || 'Consulta los canales oficiales de pago de la universidad.'),
      paymentSupportContact: emailText(registration.event?.settings?.paymentSupportContact || 'Administración del evento'),
      refundAmount: (registration.refunds || []).filter((r: any) => r.status === 'REFUNDED').reduce((n: number, r: any) => n + Number(r.refundedAmount), 0).toFixed(2),
      refundReference: (registration.refunds || []).filter((r: any) => r.status === 'REFUNDED').map((r: any) => emailText(r.reference)).filter(Boolean).join(', ') || 'No disponible',
      refundMethod: (registration.refunds || []).filter((r: any) => r.status === 'REFUNDED').map((r: any) => emailText(r.method)).filter(Boolean).join(', ') || 'No disponible',
      currencySymbol,
      scheduleHtml,
      qrUrl,
      qrDataUrl,
      // Variables y alias en español y semánticos
      nombre: registration.participant?.fullName || 'Participante',
      primer_nombre: registration.participant?.firstName || 'Participante',
      email: registration.participant?.email || '',
      correo: registration.participant?.email || '',
      institucion: institution || '',
      institution: institution || '',
      institutionHtml,
      evento: registration.event?.name || 'Evento Oficial',
      fecha: registration.event?.startDate
        ? new Date(registration.event.startDate).toLocaleDateString('es-DO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Por anunciar',
      lugar: registration.event?.venue || 'Sede Principal',
      numero_registro: registration.registrationNumber || 'REG-0001',
      tipo_entrada: registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
      qr: `<img src="${qrDataUrl}" alt="Código QR de Acceso" width="200" height="200" style="display: block; margin: 0 auto; width: 200px; height: 200px; border: 0;" />`,
      eventLogoHtml,
      messageContent: overrides?.customMessage
        ? `<div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.05); border-left: 3px solid ${primaryColor}; border-radius: 4px;">${overrides.customMessage}</div>`
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

    html = responsiveEmailHtml(html);
    return {
      subject,
      html,
      text,
      qrUrl,
      qrDataUrl,
      qrBuffer,
      variables,
    };
  }

  /**
   * Vista previa real del correo (QA-11: Sin efectos secundarios)
   */
  /**
   * Prepara el contenido y los archivos adjuntos inline (CID) para que clientes
   * estrictos como Gmail rendericen el QR y el logotipo sin bloqueos.
   */
  static prepareEmailPayload(html: string, options?: {
    qrBuffer?: Buffer | null;
    qrDataUrl?: string | null;
    logoUrl?: string | null;
  }) {
    // Sanitización rigurosa de seguridad para HTML de correos:
    // Eliminar etiquetas <script>, eventos on* (onclick, onerror, etc.) y protocolos javascript:
    let preparedHtml = (html || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s*on\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '')
      .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');

    const attachments: Array<{
      content: Buffer;
      cid: string;
      filename?: string;
      contentType: string;
      contentDisposition?: string;
    }> = [];

    // 1. QR Code inline attachment para clientes de correo (Gmail, etc.)
    // SOLO adjuntar si el correo realmente requiere el QR (ej. Entrada Digital o referencias explícitas)
    const requiresQr = preparedHtml.includes('cid:ticket-qr-code') ||
                       preparedHtml.includes('{{qrDataUrl}}') ||
                       (options?.qrDataUrl && preparedHtml.includes(options.qrDataUrl)) ||
                       preparedHtml.includes('src="data:image/png;base64,');

    if (requiresQr && options?.qrBuffer) {
      if (options.qrDataUrl && preparedHtml.includes(options.qrDataUrl)) {
        preparedHtml = preparedHtml.split(options.qrDataUrl).join('cid:ticket-qr-code');
      } else if (preparedHtml.includes('src="data:image/png;base64,')) {
        preparedHtml = preparedHtml.replace(/src="data:image\/png;base64,[^"]+"/g, 'src="cid:ticket-qr-code"');
      } else if (preparedHtml.includes('{{qrDataUrl}}')) {
        preparedHtml = preparedHtml.split('{{qrDataUrl}}').join('cid:ticket-qr-code');
      } else if (preparedHtml.includes('{{qr}}')) {
        preparedHtml = preparedHtml.split('{{qr}}').join('<img src="cid:ticket-qr-code" alt="Código QR de Acceso" width="200" height="200" style="display: block; margin: 0 auto; width: 200px; height: 200px; border: 0;" />');
      }

      // Omitir filename para evitar que Gmail y Apple Mail muestren un adjunto descargable al pie del correo
      attachments.push({
        content: options.qrBuffer,
        cid: 'ticket-qr-code',
        contentType: 'image/png',
        contentDisposition: 'inline',
      });
    }

    // 2. Logo de edición inline attachment si existe en disco y está referenciado
    if (options?.logoUrl) {
      const cleanPath = options.logoUrl.replace(/^\/?(uploads\/logos\/.*)/, '$1');
      const resolvedDiskPath = path.resolve(process.cwd(), cleanPath);
      if (fs.existsSync(resolvedDiskPath)) {
        try {
          const logoBuffer = fs.readFileSync(resolvedDiskPath);
          const requiresLogo = preparedHtml.includes(options.logoUrl) ||
                               preparedHtml.includes('/uploads/logos/') ||
                               preparedHtml.includes('cid:event-logo');
          if (requiresLogo) {
            preparedHtml = preparedHtml.split(options.logoUrl).join('cid:event-logo');
            preparedHtml = preparedHtml.replace(/src="[^"]*\/uploads\/logos\/[^"]*"/g, 'src="cid:event-logo"');
            attachments.push({
              content: logoBuffer,
              cid: 'event-logo',
              contentType: 'image/png',
              contentDisposition: 'inline',
            });
          }
        } catch {}
      }
    }

    return {
      html: preparedHtml,
      attachments,
    };
  }

  static async previewEmail(input: EmailPreviewInput) {
    let registration: any = null;

    if (input.registrationId) {
      registration = await prisma.registration.findUnique({
        where: { id: input.registrationId },
        include: {
          participant: true,
          refunds: true,
          courtesyRequests: { select: { status: true } },
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
          refunds: true,
          courtesyRequests: { select: { status: true } },
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

    if (input.registrationId && input.templateCode === 'DIGITAL_TICKET') { const blocked = recipientIneligibility(registration, input.templateCode); if (blocked) throw new BadRequestError(blocked); }

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
        refunds: true,
        courtesyRequests: { select: { status: true } },
        ticketType: true,
        event: { include: { settings: true } },
      },
    });

    if (!registration) throw new NotFoundError('Inscripción no encontrada');
    const ineligible = recipientIneligibility(registration, input.templateCode);
    if (ineligible) throw new BadRequestError(ineligible);
    if (input.expectedRecipientEmail && input.expectedRecipientEmail.trim() !== registration.participant.email.trim()) throw new BadRequestError('El correo del participante cambió. Actualiza la vista previa antes de enviar.');

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

    // QA-INTEGRAL: Control riguroso de duplicados en envíos individuales
    if (!isSimulationRequested) {
      // 1. Prevención prioritaria de envíos simultáneos / doble clic en curso (concurrencia)
      const recentProcessing = await prisma.emailLog.findFirst({
        where: {
          registrationId: registration.id,
          templateCode: input.templateCode,
          status: 'PROCESSING',
          sentAt: { gte: new Date(Date.now() - 20000) },
        },
      });
      if (recentProcessing) {
        throw new BadRequestError('Ya hay un envío de este tipo en procesamiento en este momento. Por favor espere.');
      }

      // 2. Comprobar si existe un envío real previo (aceptado, entregado, fallido o desconocido)
      const existingSentLog = await prisma.emailLog.findFirst({
        where: {
          eventId,
          registrationId: registration.id,
          templateCode: input.templateCode,
          status: { in: ['ACCEPTED_BY_SMTP', 'SENT', 'DELIVERED', 'UNKNOWN_DELIVERY_STATUS', 'FAILED', 'REJECTED'] },
        },
        orderBy: { sentAt: 'desc' },
      });

      if (existingSentLog && !input.forceResend && !input.confirmedResend) {
        const formattedDate = new Date(existingSentLog.sentAt).toLocaleDateString('es-DO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const isFailure = existingSentLog.status === 'FAILED' || existingSentLog.status === 'REJECTED';
        const isUnknown = existingSentLog.status === 'UNKNOWN_DELIVERY_STATUS';

        const message = isFailure
          ? `El último envío a este participante falló el ${formattedDate}. ¿Deseas reintentar el envío?`
          : isUnknown
          ? `Existe un envío previo con estado desconocido del ${formattedDate}. El mensaje podría haberse entregado. ¿Deseas volver a enviarlo?`
          : `Este participante ya recibió un envío de este tipo el ${formattedDate}. Este correo ya fue enviado anteriormente. ¿Deseas reenviarlo?`;

        const error: any = new BadRequestError(message);
        error.details = {
          code: 'DUPLICATE_COMMUNICATION_WARNING',
          participantName: registration.participant.fullName,
          participantEmail: registration.participant.email,
          templateCode: input.templateCode,
          templateName: template.name,
          previousSentAt: existingSentLog.sentAt,
          previousStatus: existingSentLog.status,
          previousRecipient: existingSentLog.recipientEmail,
          registrationId: registration.id,
        };
        throw error;
      }
    }

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
    if (!usesBrevoHttps() && config?.user && (!rawPassword || rawPassword.trim() === '')) {
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

    // QA-INTEGRAL: Registro persistente PREVIO al intento SMTP para evitar pérdida de estado
    let preLog;
    try { preLog = await prisma.emailLog.create({
      data: {
        dispatchKey: `${registration.id}:${input.templateCode}`,
        eventId,
        registrationId: registration.id,
        recipientEmail: registration.participant.email,
        recipientName: registration.participant.fullName,
        templateCode: input.templateCode,
        subject: rendered.subject,
        status: 'PROCESSING',
        sentByUserId: userId || null,
      },
    });
    } catch (error: any) {
      if (error.code === 'P2002') throw new BadRequestError('Ya existe un envío en curso para este participante y plantilla.');
      throw error;
    }

    // Envío real mediante transporte configurado o fábrica de pruebas
    try {
      const transporter = this.createTransporter(config);

      const prepared = this.prepareEmailPayload(rendered.html, {
        qrBuffer: (rendered as any).qrBuffer,
        qrDataUrl: rendered.qrDataUrl,
        logoUrl: registration.event?.settings?.logoUrl || (registration.event as any)?.logoUrl,
      });

      const sendResult = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: registration.participant.email,
        replyTo: config.replyToEmail || undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: prepared.html,
        attachments: prepared.attachments.length > 0 ? prepared.attachments : undefined,
      });

      // Semántica de estados: validar aceptación explícita por SMTP (no afirmar 'Entregado' sin webhook)
      const cleanRecipient = registration.participant.email.toLowerCase().trim();
      const rejectedList = Array.isArray(sendResult?.rejected)
        ? sendResult.rejected.map((e: any) => String(e).toLowerCase().trim())
        : [];
      const isExplicitRejected = rejectedList.includes(cleanRecipient);

      const accepted = Array.isArray(sendResult?.accepted) && sendResult.accepted.some((email: any) => String(email).toLowerCase().trim() === cleanRecipient);
      const finalStatus = isExplicitRejected ? 'REJECTED' : accepted ? 'ACCEPTED_BY_SMTP' : 'UNKNOWN_DELIVERY_STATUS';

      const log = await prisma.emailLog.update({
        where: { id: preLog.id },
        data: {
          status: finalStatus,
          messageId: sendResult.messageId || null,
          errorMessage: isExplicitRejected ? 'Rechazado por el servidor SMTP' : null,
        },
      });

      // Registro de auditoría si fue un reenvío expresamente autorizado
      if (userId && (input.forceResend || input.confirmedResend)) {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'EMAIL_RESEND_AUTHORIZED',
            entity: 'REGISTRATION',
            entityId: registration.id,
            changes: JSON.stringify({
              templateCode: input.templateCode,
              recipientEmail: registration.participant.email,
              reason: input.resendReason || 'Reenvío expresamente autorizado por el usuario',
              authorizedAt: new Date(),
            }),
          },
        }).catch(() => {});
      }

      return {
        success: finalStatus === 'ACCEPTED_BY_SMTP',
        log,
        simulated: false,
        message: finalStatus === 'ACCEPTED_BY_SMTP' ? 'Correo aceptado por el proveedor; entrega aún no confirmada.' : 'El proveedor no confirmó la aceptación del mensaje.',
      };
    } catch (err: any) {
      const log = await prisma.emailLog.update({
        where: { id: preLog.id },
        data: {
          status: uncertainMailFailure(err) ? 'UNKNOWN_DELIVERY_STATUS' : 'FAILED',
          errorMessage: mailFailureMessage(err),
        },
      });

      throw new BadRequestError(mailFailureMessage(err));
    } finally {
      await prisma.emailLog.update({ where: { id: preLog.id }, data: { dispatchKey: null } }).catch(() => {});
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
      ...(['INSCRIPTION_CANCELLED','CANCELLATION','NONPAYMENT_CANCELLATION','VOLUNTARY_CANCELLATION','REFUND_REQUESTED_NOTICE','REFUND_APPROVED_NOTICE','REFUND_PENDING_NOTICE','REFUND_NOTICE'].includes(input.templateCode) ? {} : { status: { not: 'CANCELLED' } }),
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
    } else if (input.targetGroup === 'COURTESY') {
      where.isCourtesy = true;
    } else if (input.targetGroup === 'PARTIAL') {
      where.paymentStatus = 'PARTIAL';
    } else if (input.targetGroup === 'ATTENDED') {
      where.attended = true;
    } else if (input.targetGroup === 'NOT_ATTENDED') {
      where.attended = false;
    } else if (input.targetGroup === 'SELECTED' && input.selectedRegistrationIds?.length) {
      where.id = { in: input.selectedRegistrationIds };
    } else if (input.targetGroup === 'PAID_WITHOUT_CONFIRMATION') {
      where.paymentStatus = { in: ['PAID', 'COURTESY'] };
    } else if (input.targetGroup === 'COURTESY_WITHOUT_CONFIRMATION') {
      where.isCourtesy = true;
    } else if (input.targetGroup === 'WITHOUT_DIGITAL_TICKET' || input.targetGroup === 'WITHOUT_REMINDER') {
      where.status = 'CONFIRMED';
    }

    if (input.ticketTypeId) {
      where.ticketTypeId = input.ticketTypeId;
    }

    if (input.dateFrom || input.dateTo) {
      where.createdAt = {};
      if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
      if (input.dateTo) where.createdAt.lte = new Date(input.dateTo);
    }

    // QA-09 & QA-INTEGRAL: Obtener destinatarios base
    const rawRegistrations = await prisma.registration.findMany({
      where,
      include: {
        participant: true,
        refunds: true,
        courtesyRequests: { select: { status: true } },
        ticketType: true,
        event: { include: { settings: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Control riguroso de duplicados e historial previo en lotes
    const [priorSentLogs, failedLogs] = await Promise.all([
      prisma.emailLog.findMany({
        where: {
          eventId: input.eventId,
          status: { in: ['ACCEPTED_BY_SMTP', 'SENT', 'DELIVERED'] },
        },
        select: { registrationId: true, templateCode: true },
      }),
      prisma.emailLog.findMany({
        where: {
          eventId: input.eventId,
          status: { in: ['FAILED', 'REJECTED'] },
        },
        select: { registrationId: true },
      }),
    ]);

    const sentSet = new Set<string>();
    for (const l of priorSentLogs) {
      if (l.registrationId && l.templateCode) {
        sentSet.add(`${l.registrationId}:${l.templateCode}`);
      }
    }
    const failedSet = new Set<string>(failedLogs.map((f) => f.registrationId).filter(Boolean) as string[]);

    const seenBatchEmails = new Set<string>();
    const registrations: typeof rawRegistrations = [];

    for (const r of rawRegistrations) {
      if (recipientIneligibility(r, input.templateCode)) continue;
      const email = r.participant.email?.trim().toLowerCase();
      if (!email || !email.includes('@')) continue;

      // Smart target group filters
      if (input.targetGroup === 'PAID_WITHOUT_CONFIRMATION' && sentSet.has(`${r.id}:INSCRIPTION_CONFIRMATION`)) continue;
      if (input.targetGroup === 'COURTESY_WITHOUT_CONFIRMATION' && sentSet.has(`${r.id}:INSCRIPTION_CONFIRMATION`)) continue;
      if (input.targetGroup === 'WITHOUT_DIGITAL_TICKET' && sentSet.has(`${r.id}:DIGITAL_TICKET`)) continue;
      if (input.targetGroup === 'WITHOUT_REMINDER' && sentSet.has(`${r.id}:EVENT_REMINDER`)) continue;
      if (input.targetGroup === 'FAILED_COMMUNICATION' && !failedSet.has(r.id)) continue;
      if (input.targetGroup === 'ALREADY_RECEIVED' && !sentSet.has(`${r.id}:${input.templateCode}`)) continue;

      // Deduplicación contra envíos previos exitosos
      if (input.excludeAlreadyNotified !== false && !input.forceResend) {
        if (sentSet.has(`${r.id}:${input.templateCode}`)) {
          continue;
        }
      }

      // Deduplicación de correos idénticos dentro de la misma campaña
      if (seenBatchEmails.has(email)) {
        continue;
      }
      seenBatchEmails.add(email);
      registrations.push(r);
    }

    if (userId && input.forceResend) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'BULK_EMAIL_RESEND_AUTHORIZED',
          entity: 'EVENT',
          entityId: input.eventId,
          changes: JSON.stringify({
            templateCode: input.templateCode,
            targetGroup: input.targetGroup,
            count: registrations.length,
            authorizedAt: new Date(),
          }),
        },
      }).catch(() => {});
    }

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
      EmailQueueWorker.authorizeAndProcessBatch(batchId, {
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

    if (query.registrationId) {
      where.registrationId = query.registrationId;
    }

    if (query.recipientEmail && query.recipientEmail.trim()) {
      where.recipientEmail = { contains: query.recipientEmail.trim() };
    }

    if (query.templateCode && query.templateCode !== 'ALL') {
      where.templateCode = query.templateCode;
    }

    if (query.sentByUserId) {
      where.sentByUserId = query.sentByUserId;
    }

    if (query.dateFrom || query.dateTo) {
      where.sentAt = {};
      if (query.dateFrom) where.sentAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.sentAt.lte = new Date(query.dateTo);
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
          registration: {
            select: {
              id: true,
              registrationNumber: true,
              participant: { select: { fullName: true } },
            },
          },
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

    const isDemoMode = event.settings?.demoModeEnabled ?? false;
    const baseWhere: any = { eventId: input.eventId };

    if (input.targetGroup === 'CONFIRMED') {
      baseWhere.status = 'CONFIRMED';
    } else if (input.targetGroup === 'PAID') {
      baseWhere.paymentStatus = { in: ['PAID', 'COURTESY'] };
    } else if (input.targetGroup === 'PENDING' || input.targetGroup === 'PENDING_PAYMENT') {
      baseWhere.paymentStatus = { in: ['PENDING', 'PARTIAL'] };
    } else if (input.targetGroup === 'COURTESY') {
      baseWhere.isCourtesy = true;
    } else if (input.targetGroup === 'PARTIAL') {
      baseWhere.paymentStatus = 'PARTIAL';
    } else if (input.targetGroup === 'ATTENDED') {
      baseWhere.attended = true;
    } else if (input.targetGroup === 'NOT_ATTENDED') {
      baseWhere.attended = false;
    } else if (input.targetGroup === 'SELECTED' && input.selectedRegistrationIds?.length) {
      baseWhere.id = { in: input.selectedRegistrationIds };
    } else if (input.targetGroup === 'PAID_WITHOUT_CONFIRMATION') {
      baseWhere.status = { not: 'CANCELLED' };
      baseWhere.paymentStatus = { in: ['PAID', 'COURTESY'] };
    } else if (input.targetGroup === 'COURTESY_WITHOUT_CONFIRMATION') {
      baseWhere.status = { not: 'CANCELLED' };
      baseWhere.isCourtesy = true;
    } else if (input.targetGroup === 'WITHOUT_DIGITAL_TICKET') {
      baseWhere.status = 'CONFIRMED';
    } else if (input.targetGroup === 'WITHOUT_REMINDER') {
      baseWhere.status = 'CONFIRMED';
    }

    if (input.ticketTypeId) {
      baseWhere.ticketTypeId = input.ticketTypeId;
    }

    if (input.dateFrom || input.dateTo) {
      baseWhere.createdAt = {};
      if (input.dateFrom) baseWhere.createdAt.gte = new Date(input.dateFrom);
      if (input.dateTo) baseWhere.createdAt.lte = new Date(input.dateTo);
    }

    const allRegistrations = await prisma.registration.findMany({
      where: baseWhere,
      include: {
        participant: true,
        refunds: true,
        courtesyRequests: { select: { status: true } },
        ticketType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Cargar historial relevante de correos enviados en esta edición para filtros inteligentes
    const realSentLogs = await prisma.emailLog.findMany({
      where: {
        eventId: input.eventId,
        status: { in: ['ACCEPTED_BY_SMTP', 'SENT', 'DELIVERED'] },
      },
      select: {
        registrationId: true,
        templateCode: true,
        recipientEmail: true,
      },
    });

    const failedLogs = await prisma.emailLog.findMany({
      where: {
        eventId: input.eventId,
        status: { in: ['FAILED', 'REJECTED'] },
      },
      select: { registrationId: true },
    });

    const sentMap = new Set<string>(); // "registrationId:templateCode"
    for (const l of realSentLogs) {
      if (l.registrationId && l.templateCode) {
        sentMap.add(`${l.registrationId}:${l.templateCode}`);
      }
    }
    const failedRegIds = new Set<string>(failedLogs.map((f) => f.registrationId).filter(Boolean) as string[]);

    const totalSelected = allRegistrations.length;
    let cancelledCount = 0;
    let demoCount = 0;
    let invalidEmailsCount = 0;
    let validEmailsCount = 0;
    let duplicateCount = 0;
    let alreadyNotifiedCount = 0;
    const seenEmails = new Set<string>();
    const eligibleRegistrations: any[] = [];
    const excludedRecipients: Array<{ registrationId: string; fullName: string; email: string; reason: string }> = [];

    const effectiveTemplateCode = input.templateCode;

    for (const reg of allRegistrations) {
      const email = reg.participant?.email?.trim().toLowerCase();
      const pName = reg.participant?.fullName || 'Participante';

      const ineligible = recipientIneligibility(reg, effectiveTemplateCode);
      if (ineligible) {
        if (reg.status === 'CANCELLED') cancelledCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: ineligible });
        continue;
      }

      if (!isDemoMode && reg.isDemo) {
        demoCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Registro demo con modo demo desactivado' });
        continue;
      }

      // Filtro especial FAILED_COMMUNICATION
      if (input.targetGroup === 'FAILED_COMMUNICATION' && !failedRegIds.has(reg.id)) {
        continue;
      }

      // Filtros especiales de confirmación/ticket/recordatorio
      if (input.targetGroup === 'PAID_WITHOUT_CONFIRMATION' && sentMap.has(`${reg.id}:INSCRIPTION_CONFIRMATION`)) {
        alreadyNotifiedCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Ya recibió confirmación de inscripción' });
        continue;
      }

      if (input.targetGroup === 'COURTESY_WITHOUT_CONFIRMATION' && sentMap.has(`${reg.id}:INSCRIPTION_CONFIRMATION`)) {
        alreadyNotifiedCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Cortesía ya notificada' });
        continue;
      }

      if (input.targetGroup === 'WITHOUT_DIGITAL_TICKET' && sentMap.has(`${reg.id}:DIGITAL_TICKET`)) {
        alreadyNotifiedCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Ya recibió su entrada digital' });
        continue;
      }

      if (input.targetGroup === 'WITHOUT_REMINDER' && sentMap.has(`${reg.id}:EVENT_REMINDER`)) {
        alreadyNotifiedCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Ya recibió recordatorio de evento' });
        continue;
      }

      if (input.targetGroup === 'ALREADY_RECEIVED') {
        const hasReceived = effectiveTemplateCode ? sentMap.has(`${reg.id}:${effectiveTemplateCode}`) : false;
        if (!hasReceived) continue;
      }

      // Exclusión automática de ya notificados si se indicó plantilla específica y excludeAlreadyNotified es true
      if (effectiveTemplateCode && input.excludeAlreadyNotified !== false && sentMap.has(`${reg.id}:${effectiveTemplateCode}`)) {
        alreadyNotifiedCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: `Ya recibió la comunicación '${effectiveTemplateCode}' previamente` });
        continue;
      }

      if (!email || !email.includes('@') || email.length < 5) {
        invalidEmailsCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email: email || 'Sin correo', reason: 'Dirección de correo no válida' });
        continue;
      }

      validEmailsCount++;

      if (seenEmails.has(email)) {
        duplicateCount++;
        excludedRecipients.push({ registrationId: reg.id, fullName: pName, email, reason: 'Dirección de correo repetida dentro de la selección' });
        continue;
      }

      seenEmails.add(email);
      eligibleRegistrations.push(reg);
    }

    const eligibleCount = eligibleRegistrations.length;

    // QA-INTEGRAL: Cálculo de consumo real de cuota diaria de Brevo en EventGrid
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todaySentByEventGrid, pendingQueueCount] = await Promise.all([
      prisma.emailLog.count({
        where: {
          eventId: input.eventId,
          sentAt: { gte: startOfDay },
          status: { in: ['SENT', 'ACCEPTED_BY_SMTP'] },
        },
      }),
      prisma.emailBatchItem.count({
        where: {
          job: { eventId: input.eventId },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
    ]);

    const dailyQuotaLimit = 300;
    const estimatedRemaining = Math.max(0, dailyQuotaLimit - todaySentByEventGrid);

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
      alreadyNotifiedCount,
      validEmailsCount,
      invalidEmailsCount,
      cancelledCount,
      demoCount,
      duplicateCount,
      excludedRecipients: excludedRecipients.slice(0, 100),
      totalExcluded: excludedRecipients.length,
      todaySentByEventGrid,
      pendingQueueCount,
      dailyQuotaLimit,
      estimatedRemaining,
      quotaWarning: (eligibleCount + todaySentByEventGrid) > dailyQuotaLimit
        ? `Atención: El lote contiene ${eligibleCount} destinatarios y ya se enviaron ${todaySentByEventGrid} correos hoy. Esto supera el límite de 300 correos/día del plan gratuito de Brevo. Brevo rechazará los envíos que excedan su cuota.`
        : `Estimación de cuota Brevo: Plan gratuito de 300 correos/día. EventGrid ha registrado ${todaySentByEventGrid} envíos hoy (${pendingQueueCount} en cola). Cupos estimados restantes hoy: ${estimatedRemaining}. (Advertencia: Consumo externo directo en Brevo no se contabiliza sin API externa).`,
      sampleRecipients,
    };
  }


  static async getBatchJobs(eventId: string) {
    const jobs = await prisma.emailBatchJob.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        createdByUser: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
    return jobs.map(job => ({ ...job, ...EmailQueueWorker.executionState(job) }));
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
    return { ...job, ...EmailQueueWorker.executionState(job) };
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

    if (job.mode === 'REAL') {
      const config = await this.getRawConfig(job.eventId);
      if (!config || !config.isEnabled) {
        throw new BadRequestError('El servidor SMTP no está configurado o está deshabilitado. No se pueden reintentar envíos reales mientras SMTP permanezca apagado.');
      }
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

    if (job.mode === 'REAL') {
      const config = await this.getRawConfig(job.eventId);
      if (!config || !config.isEnabled) {
        throw new BadRequestError('El servidor SMTP no está configurado o está deshabilitado. No se pueden reintentar envíos reales mientras SMTP permanezca apagado.');
      }
    }

    const updatedJob = await EmailQueueWorker.retryUncertain(jobId, eventId, {
      confirmedDuplicateRisk: confirmation?.confirmedDuplicateRisk,
      reason: confirmation?.reason,
      userId,
    });
    return updatedJob;
  }

  /**
   * Historial unificado de comunicaciones por participante/inscripción (Fase QA Integral)
   * Unifica EmailLog y EmailBatchItem sin duplicar operaciones.
   */
  static async getUnifiedHistoryForRegistration(registrationId: string, operatorUserId?: string, limit?: number, digitalOnly=false) {
    const TEMPLATE_NAMES: Record<string, string> = {
      INSCRIPTION_CONFIRMATION: 'Confirmación de inscripción',
      DIGITAL_TICKET: 'Entrada digital',
      EVENT_REMINDER: 'Recordatorio de evento',
      PAYMENT_CONFIRMATION: 'Confirmación de pago',
      PENDING_BALANCE: 'Balance pendiente',
      INSCRIPTION_CANCELLED: 'Inscripción cancelada',
      PAYMENT_REMINDER: 'Recordatorio de pago',
      NONPAYMENT_CANCELLATION: 'Anulación por impago',
      VOLUNTARY_CANCELLATION: 'Cancelación voluntaria',
      REFUND_REQUESTED_NOTICE: 'Solicitud de reembolso',
      REFUND_APPROVED_NOTICE: 'Reembolso aprobado',
      REFUND_PENDING_NOTICE: 'Pendiente de devolución',
      REFUND_NOTICE: 'Devolución confirmada',
      GENERAL_ANNOUNCEMENT: 'Anuncio general',
      CUSTOM: 'Mensaje personalizado',
    };

    const STATUS_LABELS: Record<string, string> = {
      ACCEPTED_BY_SMTP: 'Aceptado por SMTP',
      SENT: 'Aceptado por SMTP',
      DELIVERED: 'Entregado',
      SIMULATED: 'Simulado',
      PENDING: 'Pendiente',
      PROCESSING: 'Procesando',
      FAILED: 'Fallido',
      REJECTED: 'Rechazado',
      CANCELLED: 'Cancelado',
      UNKNOWN_DELIVERY_STATUS: 'Estado desconocido',
    };

    const [logs, batchItems] = await Promise.all([
      prisma.emailLog.findMany({
        where: { registrationId, ...(digitalOnly ? { templateCode: 'DIGITAL_TICKET' } : {}), ...(operatorUserId ? { sentByUserId: operatorUserId, templateCode: 'DIGITAL_TICKET' } : {}) },
        include: {
          sentByUser: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { sentAt: 'desc' },
        ...(limit ? {take:limit} : {}),
      }),
      operatorUserId ? Promise.resolve([]) : prisma.emailBatchItem.findMany({
        where: { registrationId, ...(digitalOnly ? { job: { templateCode: 'DIGITAL_TICKET' } } : {}) },
        include: {
          job: {
            include: {
              createdByUser: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...(limit ? {take:limit} : {}),
      }),
    ]);

    const batchItemIdsMerged = new Set<string>();
    const unified: any[] = [];

    // Procesar EmailLogs
    for (const log of logs) {
      let matchedBatchItem: any = null;
      if (log.batchId) {
        matchedBatchItem = batchItems.find(
          (b) => b.jobId === log.batchId && !batchItemIdsMerged.has(b.id)
        );
        if (matchedBatchItem) {
          batchItemIdsMerged.add(matchedBatchItem.id);
        }
      }

      const rawStatus = log.status || 'UNKNOWN_DELIVERY_STATUS';
      const statusLabel = STATUS_LABELS[rawStatus] || rawStatus;
      const tCode = log.templateCode || matchedBatchItem?.job?.templateCode || 'CUSTOM';
      const commType = TEMPLATE_NAMES[tCode] || tCode;

      unified.push({
        id: log.id,
        registrationId: log.registrationId || registrationId,
        source: 'SINGLE',
        communicationType: commType,
        templateCode: tCode,
        subject: log.subject,
        date: log.sentAt,
        recipientEmail: log.recipientEmail,
        recipientName: log.recipientName || log.recipientEmail,
        authorizedByUser: log.sentByUser || matchedBatchItem?.job?.createdByUser || null,
        deliveryType: log.batchId ? 'Campaña masiva' : 'Individual',
        batchId: log.batchId || null,
        status: rawStatus,
        statusLabel,
        attempts: matchedBatchItem?.attempts || 1,
        errorMessage: log.errorMessage || matchedBatchItem?.errorMessage || null,
      });
    }

    // Procesar EmailBatchItems no reflejados aún en EmailLog (ej. PENDING, PROCESSING, FAILED tempranos)
    for (const item of batchItems) {
      if (batchItemIdsMerged.has(item.id)) continue;

      const rawStatus = item.status || 'PENDING';
      const statusLabel = STATUS_LABELS[rawStatus] || rawStatus;
      const tCode = item.job?.templateCode || 'CUSTOM';
      const commType = TEMPLATE_NAMES[tCode] || tCode;

      unified.push({
        id: item.id,
        registrationId: item.registrationId || registrationId,
        source: 'BATCH',
        communicationType: commType,
        templateCode: tCode,
        subject: item.renderedSubject || item.job?.subject || 'Sin asunto',
        date: item.sentAt || item.lastAttemptAt || item.createdAt,
        recipientEmail: item.recipientEmail,
        recipientName: item.recipientName || item.recipientEmail,
        authorizedByUser: item.job?.createdByUser || null,
        deliveryType: 'Campaña masiva',
        batchId: item.jobId,
        status: rawStatus,
        statusLabel,
        attempts: item.attempts || 0,
        errorMessage: item.errorMessage || null,
      });
    }

    // Ordenar de más reciente a más antiguo
    unified.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    return unified.slice(0,limit||unified.length).map(item=>({...item,errorMessage:safeCommunicationError(item.errorMessage,!operatorUserId&&!digitalOnly)}));
  }

  /**
   * Procesar eventos webhook transaccionales emitidos por Brevo
   */
  static async handleBrevoWebhook(body: any, authSecret?: string) {
    const configuredSecret = process.env.BREVO_WEBHOOK_SECRET;
    if (!configuredSecret || !authSecret || configuredSecret !== authSecret) {
      throw new BadRequestError('Firma o secreto de webhook inválido');
    }

    const events = Array.isArray(body) ? body : [body];
    let processedCount = 0;

    for (const evt of events) {
      if (!evt || typeof evt !== 'object') continue;

      const eventType = String(evt.event || '').toLowerCase().trim();
      const email = String(evt.email || '').toLowerCase().trim();
      const messageId = evt['message-id'] || evt.messageId || null;
      const reason = evt.reason || evt.description || null;

      if (!messageId) continue;

      let targetStatus: string | null = null;
      let errorDesc: string | null = null;

      if (eventType === 'delivered') {
        targetStatus = 'DELIVERED';
      } else if (['soft_bounce', 'hard_bounce', 'blocked', 'invalid_email', 'error', 'spam'].includes(eventType)) {
        targetStatus = eventType === 'soft_bounce' ? 'DEFERRED' : 'REJECTED';
        errorDesc = `Brevo (${eventType}): ${reason || 'Fallo de entrega reportado por el servidor de correo'}`;
      } else if (['deferred'].includes(eventType)) {
        targetStatus = 'DEFERRED';
      }

      if (!targetStatus) continue;

      await prisma.userInvitation.updateMany({
        where: { messageId, usedAt: null, status: { in: ['ACCEPTED_BY_PROVIDER', 'UNKNOWN_DELIVERY_STATUS', 'DEFERRED', 'PROCESSING'] } },
        data: { status: targetStatus, ...(errorDesc ? { errorMessage: 'El proveedor informó un rechazo o aplazamiento de entrega.' } : {}) },
      });
      const invitationRecipients = await prisma.userInvitation.findMany({ where: { messageId }, select: { userId: true } });
      if (invitationRecipients.length) {
        const accounts = await prisma.user.findMany({ where: { id: { in: invitationRecipients.map(item => item.userId) } }, select: { assignedEventId: true } });
        for (const id of new Set(accounts.map(account => account.assignedEventId).filter(Boolean))) RealtimeService.changed(id!, ['users']);
      }
      // 1. Actualizar EmailBatchItem si existe coincidencia por messageId o recipientEmail
      if (messageId) {
        const affected = await prisma.emailBatchItem.findMany({ where: { messageId }, select: { job: { select: { eventId:true } } } });
        await prisma.emailBatchItem.updateMany({
          where: { messageId },
          data: {
            status: targetStatus,
            lastAttemptAt: new Date(),
            ...(errorDesc ? { errorMessage: errorDesc } : {}),
          },
        });
        for (const event of new Set(affected.map(item=>item.job.eventId))) RealtimeService.changed(event,['communications']);
      }

      // 2. Actualizar EmailLog idempotentemente
      const matchingLog = await prisma.emailLog.findFirst({
        where: {
          messageId,
          status: { in: ['ACCEPTED_BY_SMTP', 'SENT', 'PROCESSING', 'PENDING', 'UNKNOWN_DELIVERY_STATUS', 'DEFERRED'] },
        },
        orderBy: { sentAt: 'desc' },
      });

      if (matchingLog) {
        await prisma.emailLog.update({
          where: { id: matchingLog.id },
          data: {
            status: targetStatus,
            ...(errorDesc ? { errorMessage: errorDesc } : {}),
          },
        });
        if (matchingLog.eventId) RealtimeService.changed(matchingLog.eventId,['communications']);
        processedCount++;
      }
    }

    return { success: true, processedCount };
  }

  /**
   * Resumen operativo de envíos SMTP recientes para el panel de Administración
   */
  static async getSmtpSummary(eventId?: string | null) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const whereBase: any = eventId ? { eventId } : {};

    const [
      acceptedToday,
      deliveredToday,
      failedToday,
      simulatedToday,
      pendingCount,
      lastAttempt,
      totalSentAllTime,
    ] = await Promise.all([
      prisma.emailLog.count({
        where: {
          ...whereBase,
          sentAt: { gte: todayStart },
          status: { in: ['ACCEPTED_BY_SMTP', 'SENT'] },
        },
      }),
      prisma.emailLog.count({
        where: {
          ...whereBase,
          sentAt: { gte: todayStart },
          status: 'DELIVERED',
        },
      }),
      prisma.emailLog.count({
        where: {
          ...whereBase,
          sentAt: { gte: todayStart },
          status: { in: ['FAILED', 'REJECTED'] },
        },
      }),
      prisma.emailLog.count({
        where: {
          ...whereBase,
          sentAt: { gte: todayStart },
          status: 'SIMULATED',
        },
      }),
      prisma.emailBatchItem.count({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          ...(eventId ? { job: { eventId } } : {}),
        },
      }),
      prisma.emailLog.findFirst({
        where: whereBase,
        orderBy: { sentAt: 'desc' },
        select: {
          id: true,
          recipientEmail: true,
          recipientName: true,
          templateCode: true,
          subject: true,
          status: true,
          sentAt: true,
        },
      }),
      prisma.emailLog.count({
        where: {
          ...whereBase,
          status: { in: ['ACCEPTED_BY_SMTP', 'SENT', 'DELIVERED'] },
        },
      }),
    ]);

    return {
      acceptedToday,
      deliveredToday,
      failedToday,
      simulatedToday,
      pendingCount,
      lastAttempt,
      totalSentAllTime,
    };
  }

}
