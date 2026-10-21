import { Request, Response, NextFunction } from 'express';
import { ActivityService } from './activity.service.js';
import { ListActivityQuerySchema } from './activity.dto.js';
import { BadRequestError } from '../../utils/errors.js';

export class ActivityController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = ListActivityQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new BadRequestError('Parámetros de consulta de actividad inválidos');
      }

      const result = await ActivityService.list(parseResult.data);
      res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = ListActivityQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new BadRequestError('Parámetros de exportación inválidos');
      }

      const { buffer, filename, contentType } = await ActivityService.export(parseResult.data);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}
