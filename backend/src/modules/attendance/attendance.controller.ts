import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service.js';
import {
  CheckInSchema,
  RevertAttendanceSchema,
  SearchAttendanceQuerySchema,
} from './attendance.dto.js';
import { BadRequestError } from '../../utils/errors.js';

export class AttendanceController {
  private static getEventId(req: Request): string {
    return req.params.eventId || req.eventId!;
  }

  static async getCounters(req: Request, res: Response, next: NextFunction) {
    try {
      const counters = await AttendanceService.getCounters(AttendanceController.getEventId(req));
      res.json({
        status: 'success',
        data: counters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async searchAndList(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = SearchAttendanceQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new BadRequestError('Parámetros de búsqueda inválidos');
      }

      const result = await AttendanceService.searchAndList(
        AttendanceController.getEventId(req),
        parseResult.data
      );
      res.json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
        counters: result.counters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = CheckInSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new BadRequestError(parseResult.error.errors[0]?.message || 'Datos de check-in inválidos');
      }

      const operatorUserId = req.user!.id;
      const result = await AttendanceService.checkIn(
        AttendanceController.getEventId(req),
        parseResult.data.registrationId,
        operatorUserId,
        parseResult.data.tshirtSize,
        parseResult.data.tshirtDelivered
      );

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.registration,
        counters: result.counters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async revert(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = RevertAttendanceSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new BadRequestError(parseResult.error.errors[0]?.message || 'Datos de reversión inválidos');
      }

      const adminUserId = req.user!.id;
      const result = await AttendanceService.revertAttendance(
        AttendanceController.getEventId(req),
        parseResult.data.registrationId,
        adminUserId,
        parseResult.data.reason
      );

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.registration,
        counters: result.counters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const buffer = await AttendanceService.exportAttendance(
        AttendanceController.getEventId(req),
        status,
        search
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="EventGrid_Asistencia_${new Date().toISOString().slice(0, 10)}.xlsx"`
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  static async getDailySales(req: Request, res: Response, next: NextFunction) {
    try {
      const date = req.query.date as string | undefined;
      const result = await AttendanceService.getDailySales(
        AttendanceController.getEventId(req),
        date
      );
      res.json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
