import { authorizeOperatorEmail, OPERATOR_EMAIL_CODES } from './operator-policy.js';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/db.js';
import { CommunicationsService } from './communications.service.js';
import {
  UpdateSmtpConfigSchema,
  TestEmailSchema,
  SendEmailSchema,
  SendBulkEmailSchema,
  UpdateTemplateSchema,
  EmailPreviewSchema,
  QueryLogsSchema,
  ValidateRecipientsSchema,
  RetryUncertainBatchSchema,
} from './communications.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { BadRequestError, ForbiddenError } from '../../utils/errors.js';

export class CommunicationsController {
  static async getStatus(req: Request, res: Response, next: NextFunction) {
    try { const config = await CommunicationsService.getConfig(req.eventId || req.query.eventId as string || null); res.json({ data: { isEnabled: Boolean(config?.isEnabled), isConfigured: Boolean(config?.host) } }); } catch (error) { next(error); }
  }
  static async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) ? req.eventId : req.query.eventId as string) || null;
      const config = await CommunicationsService.getConfig(eventId);
      return res.status(200).json({ status: 'success', data: config });
    } catch (error) {
      next(error);
    }
  }

  static async saveConfig(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.assignedEventId && req.body.eventId !== req.user.assignedEventId) throw new ForbiddenError('Configuración fuera de su edición');
      const validated = UpdateSmtpConfigSchema.parse(req.body);
      const existing = validated.eventId
        ? await prisma.emailConfig.findFirst({ where: { eventId: validated.eventId } })
        : await prisma.emailConfig.findFirst({ where: { eventId: null } });

      const previousIsEnabled = existing?.isEnabled ?? false;
      const newIsEnabled = Boolean(validated.isEnabled);

      const config = await CommunicationsService.saveConfig(validated);

      if (previousIsEnabled !== newIsEnabled) {
        await recordAuditLog({
          req,
          action: 'SMTP_STATUS_CHANGED',
          entity: 'EMAIL_CONFIG',
          entityId: config.id,
          changes: {
            estadoAnterior: previousIsEnabled ? 'ACTIVADO' : 'DESACTIVADO',
            nuevoEstado: newIsEnabled ? 'ACTIVADO' : 'DESACTIVADO',
            usuario: req.user?.email || req.user?.id || 'ADMIN',
            fecha: new Date().toISOString(),
          },
        });
      }

      await recordAuditLog({
        req,
        action: 'EMAIL_CONFIG_UPDATE',
        entity: 'EMAIL_CONFIG',
        entityId: config.id,
        changes: { host: validated.host, fromEmail: validated.fromEmail, isEnabled: validated.isEnabled },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Configuración SMTP guardada exitosamente',
        data: config,
      });
    } catch (error) {
      next(error);
    }
  }

  static async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = TestEmailSchema.parse(req.body);
      const email = (parsed.recipientEmail || parsed.testRecipient)!.trim();
      const result = await CommunicationsService.testConnection(email, parsed.eventId, req.user?.id);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) ? req.eventId : req.query.eventId as string) || null;
      const templates = await CommunicationsService.getTemplates(eventId);
      return res.status(200).json({ status: 'success', data: req.user?.role === 'OPERATOR' ? templates.filter(t => OPERATOR_EMAIL_CODES.includes(t.code)) : templates });
    } catch (error) {
      next(error);
    }
  }

  static async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { templateId } = req.params;
      const validated = UpdateTemplateSchema.parse(req.body);
      const updated = await CommunicationsService.updateTemplate(templateId, validated);

      await recordAuditLog({
        req,
        action: 'EMAIL_TEMPLATE_UPDATE',
        entity: 'EMAIL_TEMPLATE',
        entityId: templateId,
        changes: { subject: validated.subject },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Plantilla de correo actualizada exitosamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async previewEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = EmailPreviewSchema.parse(req.body);
      authorizeOperatorEmail(req, validated);
      const result = await CommunicationsService.previewEmail(validated);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async sendSingleEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = SendEmailSchema.parse(req.body);
      authorizeOperatorEmail(req, validated);
      const result = await CommunicationsService.sendSingleEmail(validated, req.user?.id);

      await recordAuditLog({
        req,
        action: 'EMAIL_SENT',
        entity: 'EMAIL_LOG',
        entityId: result.log.id,
        changes: {
          recipientEmail: result.log.recipientEmail,
          templateCode: validated.templateCode,
          simulated: result.simulated,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
          success: result.success,
          logId: result.log.id,
          status: result.log.status,
          message: result.message,
          simulated: result.simulated,
          log: result.log,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async sendBulkEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = SendBulkEmailSchema.parse(req.body);
      const result = await CommunicationsService.sendBulkEmail(validated, req.user?.id);

      await recordAuditLog({
        req,
        action: 'EMAIL_SENT',
        entity: 'EMAIL_LOG',
        changes: {
          targetGroup: validated.targetGroup,
          templateCode: validated.templateCode,
          totalTargeted: result.totalTargeted,
          sentCount: result.sentCount,
          batchId: result.batchId,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
          total: result.totalTargeted,
          sent: result.sentCount,
          simulated: result.simulatedCount,
          failed: result.failedCount,
          excluded: result.excludedCount,
          batchId: result.batchId,
          message: result.message,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = QueryLogsSchema.parse(req.query);
      if (req.user?.role === 'OPERATOR') { parsed.sentByUserId = req.user.id; parsed.templateCode = 'DIGITAL_TICKET'; }
      const eventId = req.eventId || parsed.eventId || ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) ? req.eventId : req.query.eventId as string) || null;
      const result = await CommunicationsService.getLogs(eventId, parsed);
      return res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  static async validateRecipients(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = ValidateRecipientsSchema.parse(req.body);
      const result = await CommunicationsService.getRecipientStats(validated);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getBatchJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      if (!eventId) throw new BadRequestError('El parámetro eventId es requerido');
      const jobs = await CommunicationsService.getBatchJobs(eventId);
      return res.status(200).json({ status: 'success', data: jobs });
    } catch (error) {
      next(error);
    }
  }

  static async getBatchJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      const job = await CommunicationsService.getBatchJob(id, eventId);
      return res.status(200).json({ status: 'success', data: job });
    } catch (error) {
      next(error);
    }
  }

  static async cancelBatchJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      const result = await CommunicationsService.cancelBatchJob(id, eventId);
      return res.status(200).json({ status: 'success', message: 'Lote cancelado exitosamente', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async retryBatchJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      const result = await CommunicationsService.retryBatchJob(id, eventId);
      return res.status(200).json({ status: 'success', message: 'Reintento de fallidos programado exitosamente', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async retryFailedBatchJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      const result = await CommunicationsService.retryFailedBatchJob(id, eventId);
      return res.status(200).json({ status: 'success', message: 'Reintento de fallidos programado exitosamente', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async retryUncertainBatchJob(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = (req.query.eventId as string) || (req as any).eventId;
      const userId = (req as any).user?.id;
      const parseResult = RetryUncertainBatchSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message || 'Datos de confirmación inválidos',
          errors: parseResult.error.flatten().fieldErrors,
        });
      }
      const result = await CommunicationsService.retryUncertainBatchJob(id, eventId, parseResult.data, userId);
      return res.status(200).json({
        status: 'success',
        message: 'Reintento de envíos inciertos autorizado y programado exitosamente',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRegistrationHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const history = await CommunicationsService.getUnifiedHistoryForRegistration(registrationId, req.user?.role === 'OPERATOR' ? req.user.id : undefined);
      return res.status(200).json({ status: 'success', data: history });
    } catch (error) {
      next(error);
    }
  }

  static async handleBrevoWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const secretHeader = (req.headers['x-brevo-webhook-secret'] || req.query.secret || req.query.token) as string | undefined;
      const result = await CommunicationsService.handleBrevoWebhook(req.body, secretHeader);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getSmtpSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ((req.user?.role !== 'ADMIN' || Boolean(req.user?.assignedEventId)) ? req.eventId : req.query.eventId as string) || null;
      const summary = await CommunicationsService.getSmtpSummary(eventId);
      return res.status(200).json({ status: 'success', data: summary });
    } catch (error) {
      next(error);
    }
  }
}
