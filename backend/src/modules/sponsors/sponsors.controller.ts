import { Request, Response, NextFunction } from 'express';
import { SponsorsService } from './sponsors.service.js';
import {
  CreateSponsorSchema,
  UpdateSponsorSchema,
  CreatePaymentSchema,
  AnnullPaymentSchema,
  QuerySponsorsSchema,
} from './sponsors.dto.js';
import { BadRequestError } from '../../utils/errors.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class SponsorsController {
  private static getEventId(req: Request): string {
    const eventId = (req.params.eventId || req.query.eventId || req.eventId || req.headers['x-event-id']) as string;
    if (!eventId) {
      throw new BadRequestError('El ID de la edición es requerido');
    }
    return eventId;
  }

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = SponsorsController.getEventId(req);
      const summary = await SponsorsService.getSummary(eventId);
      return res.status(200).json({ status: 'success', data: summary });
    } catch (error) {
      next(error);
    }
  }

  static async getSponsors(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = SponsorsController.getEventId(req);
      const query = QuerySponsorsSchema.parse(req.query);
      const result = await SponsorsService.getSponsors(eventId, query);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getSponsorById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = req.params.eventId as string | undefined;
      const sponsor = await SponsorsService.getSponsorById(id, eventId);
      return res.status(200).json({ status: 'success', data: sponsor });
    } catch (error) {
      next(error);
    }
  }

  static async createSponsor(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = SponsorsController.getEventId(req);
      const parsed = CreateSponsorSchema.parse(req.body);
      const userId = req.user?.id;

      const sponsor = await SponsorsService.createSponsor(eventId, parsed, userId);

      await recordAuditLog({
        req,
        action: 'SPONSOR_CREATED',
        entity: 'SPONSOR',
        entityId: sponsor.id,
        changes: {
          name: sponsor.name,
          type: sponsor.type,
          committedAmount: sponsor.committedAmount,
          contributionType: sponsor.contributionType,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `${sponsor.type === 'COLLABORATOR' ? 'Colaborador' : 'Patrocinador'} registrado exitosamente`,
        data: sponsor,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSponsor(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = req.params.eventId as string | undefined;
      const parsed = UpdateSponsorSchema.parse(req.body);
      const userId = req.user?.id;

      const sponsor = await SponsorsService.updateSponsor(id, parsed, userId, eventId);

      await recordAuditLog({
        req,
        action: 'SPONSOR_UPDATED',
        entity: 'SPONSOR',
        entityId: sponsor.id,
        changes: parsed,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Información actualizada exitosamente',
        data: sponsor,
      });
    } catch (error) {
      next(error);
    }
  }

  static async archiveSponsor(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { isArchived } = req.body;
      const eventId = req.params.eventId as string | undefined;
      const userId = req.user?.id;

      const sponsor = await SponsorsService.archiveSponsor(id, Boolean(isArchived), userId, eventId);

      await recordAuditLog({
        req,
        action: isArchived ? 'SPONSOR_ARCHIVED' : 'SPONSOR_UNARCHIVED',
        entity: 'SPONSOR',
        entityId: sponsor.id,
        changes: { isArchived },
      });

      return res.status(200).json({
        status: 'success',
        message: isArchived ? 'Patrocinador archivado' : 'Patrocinador reactivado',
        data: sponsor,
      });
    } catch (error) {
      next(error);
    }
  }

  static async registerPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const eventId = req.params.eventId as string | undefined;
      const parsed = CreatePaymentSchema.parse(req.body);
      const userId = req.user?.id;

      const result = await SponsorsService.registerPayment(id, parsed, userId, eventId);

      await recordAuditLog({
        req,
        action: 'SPONSOR_PAYMENT_RECORDED',
        entity: 'SPONSOR_PAYMENT',
        entityId: result.payment.id,
        changes: {
          sponsorId: id,
          amount: result.payment.amount,
          paymentMethod: result.payment.paymentMethod,
          reference: result.payment.reference,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: 'Pago registrado exitosamente',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async annullPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const eventId = req.params.eventId as string | undefined;
      const parsed = AnnullPaymentSchema.parse(req.body);
      const userId = req.user?.id;

      const result = await SponsorsService.annullPayment(paymentId, parsed, userId, eventId);

      await recordAuditLog({
        req,
        action: 'SPONSOR_PAYMENT_ANNULLED',
        entity: 'SPONSOR_PAYMENT',
        entityId: paymentId,
        changes: {
          reason: parsed.reason,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Pago anulado correctamente',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
