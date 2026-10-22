import { Request, Response, NextFunction } from 'express';
import { ScheduleService } from './schedule.service.js';
import {
  CreateScheduleItemSchema,
  UpdateScheduleItemSchema,
  QueryScheduleSchema,
  UpdateSchedulePdfSchema,
} from './schedule.dto.js';
import { BadRequestError } from '../../utils/errors.js';
import fs from 'fs';
import path from 'path';

export class ScheduleController {
  private static getEventId(req: Request): string {
    const eventId = req.params.eventId || req.eventId;
    if (!eventId) {
      throw new BadRequestError('El ID de la edición es obligatorio');
    }
    return eventId;
  }

  static async getItems(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const query = QueryScheduleSchema.parse(req.query);
      const result = await ScheduleService.getItems(eventId, query);

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getItemById(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const item = await ScheduleService.getItemById(eventId, req.params.id);

      return res.status(200).json({
        status: 'success',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const input = CreateScheduleItemSchema.parse(req.body);
      const item = await ScheduleService.createItem(eventId, input);

      return res.status(201).json({
        status: 'success',
        message: 'Charla agregada al cronograma exitosamente',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const input = UpdateScheduleItemSchema.parse(req.body);
      const item = await ScheduleService.updateItem(eventId, req.params.id, input);

      return res.status(200).json({
        status: 'success',
        message: 'Charla actualizada exitosamente',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const result = await ScheduleService.deleteItem(eventId, req.params.id);

      return res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updatePdfUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      
      let pdfUrl = req.body.pdfUrl;

      // Si se envía archivo base64 del PDF
      if (req.body.fileBase64) {
        const uploadDir = path.resolve(process.cwd(), 'uploads', 'schedules');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileName = `schedule_${eventId}_${Date.now()}.pdf`;
        const filePath = path.join(uploadDir, fileName);
        const buffer = Buffer.from(req.body.fileBase64, 'base64');
        fs.writeFileSync(filePath, buffer);
        pdfUrl = `/uploads/schedules/${fileName}`;
      } else {
        const input = UpdateSchedulePdfSchema.parse(req.body);
        pdfUrl = input.pdfUrl;
      }

      const result = await ScheduleService.updatePdfUrl(eventId, pdfUrl);

      return res.status(200).json({
        status: 'success',
        message: 'Enlace de PDF de cronograma actualizado exitosamente',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async importSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      let buffer: Buffer | null = null;

      if (req.body.fileBase64) {
        buffer = Buffer.from(req.body.fileBase64, 'base64');
      } else if ((req as any).file) {
        buffer = (req as any).file.buffer;
      }

      if (!buffer) {
        throw new BadRequestError('Debe enviar el archivo en formato base64 o multipart');
      }

      const result = await ScheduleService.importFromBuffer(eventId, buffer);

      return res.status(200).json({
        status: 'success',
        message: `Importación completada: ${result.importedCount} charlas agregadas.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPublicSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = ScheduleController.getEventId(req);
      const result = await ScheduleService.getPublicSchedule(eventId);

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
