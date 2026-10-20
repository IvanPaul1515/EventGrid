import { Request, Response, NextFunction } from 'express';
import { DemoService } from './demo.service.js';
import { ToggleDemoSchema, GenerateDemoSchema, ResetDemoSchema } from './demo.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class DemoController {
  static async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = (req.query.eventId as string) || (req.params.eventId as string);
      if (!eventId) {
        return res.status(400).json({ status: 'error', message: 'Se requiere el parámetro eventId' });
      }

      const status = await DemoService.getStatus(eventId);
      return res.status(200).json({ status: 'success', data: status });
    } catch (error) {
      next(error);
    }
  }

  static async toggle(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, enabled } = ToggleDemoSchema.parse(req.body);
      const status = await DemoService.toggle(eventId, enabled);

      await recordAuditLog({
        req,
        action: 'DEMO_MODE_TOGGLE',
        entity: 'EVENT_SETTINGS',
        entityId: eventId,
        changes: { demoModeEnabled: enabled },
      });

      return res.status(200).json({
        status: 'success',
        message: enabled ? 'Modo demostración activado' : 'Modo demostración desactivado',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, count } = GenerateDemoSchema.parse(req.body);
      const result = await DemoService.generate(eventId, count, req.user?.id);

      await recordAuditLog({
        req,
        action: 'DEMO_DATA_GENERATE',
        entity: 'EVENT',
        entityId: eventId,
        changes: { generatedCount: result.generatedCount },
      });

      return res.status(201).json({
        status: 'success',
        message: `Se han generado ${result.generatedCount} participantes de demostración`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async reset(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = ResetDemoSchema.parse(req.body);
      const result = await DemoService.reset(eventId);

      await recordAuditLog({
        req,
        action: 'DEMO_DATA_RESET',
        entity: 'EVENT',
        entityId: eventId,
        changes: { deletedCount: result.deletedRegistrationsCount },
      });

      return res.status(200).json({
        status: 'success',
        message: `Se han restablecido los datos demo (${result.deletedRegistrationsCount} registros eliminados)`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
