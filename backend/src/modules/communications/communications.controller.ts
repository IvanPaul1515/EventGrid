import { Request, Response, NextFunction } from 'express';
import { CommunicationsService } from './communications.service.js';
import {
  UpdateSmtpConfigSchema,
  TestEmailSchema,
  SendEmailSchema,
  SendBulkEmailSchema,
  UpdateTemplateSchema,
} from './communications.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class CommunicationsController {
  static async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = (req.query.eventId as string) || null;
      const config = await CommunicationsService.getConfig(eventId);
      return res.status(200).json({ status: 'success', data: config });
    } catch (error) {
      next(error);
    }
  }

  static async saveConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = UpdateSmtpConfigSchema.parse(req.body);
      const config = await CommunicationsService.saveConfig(validated);

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
      const { recipientEmail, eventId } = TestEmailSchema.parse(req.body);
      const result = await CommunicationsService.testConnection(recipientEmail, eventId, req.user?.id);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = (req.query.eventId as string) || null;
      const templates = await CommunicationsService.getTemplates(eventId);
      return res.status(200).json({ status: 'success', data: templates });
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

  static async sendSingleEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = SendEmailSchema.parse(req.body);
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

      return res.status(200).json({ status: 'success', data: result });
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
        },
      });

      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = (req.query.eventId as string) || null;
      const result = await CommunicationsService.getLogs(eventId, req.query as any);
      return res.status(200).json({ status: 'success', data: result.data, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }
}
