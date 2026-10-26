import { Request, Response, NextFunction } from 'express';
import { ParticipantsService } from './participants.service.js';
import {
  CreateRegistrationSchema,
  UpdateRegistrationSchema,
  ListParticipantsQuerySchema,
  OnsiteSaleSchema,
  RecordPaymentSchema,
  CancelRegistrationSchema,
  ReactivateRegistrationSchema,
  AssignCourtesySchema,
} from './participants.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class ParticipantsController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const query = ListParticipantsQuerySchema.parse(req.query);

      const result = await ParticipantsService.list(eventId, query);
      return res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
        stats: result.stats,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const participant = await ParticipantsService.getById(eventId, req.params.id);

      return res.status(200).json({
        status: 'success',
        data: participant,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = CreateRegistrationSchema.parse(req.body);

      const registration = await ParticipantsService.create(eventId, validated, req.user!.id);

      await recordAuditLog({
        req,
        action: 'CREATE',
        entity: 'REGISTRATION',
        entityId: registration.id,
        changes: {
          participantName: registration.participant.fullName,
          registrationNumber: registration.registrationNumber,
          totalAmount: Number(registration.totalAmount),
          isCourtesy: registration.isCourtesy,
          status: registration.status,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `Participante ${registration.participant.fullName} registrado con ticket ${registration.registrationNumber}`,
        data: registration,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = UpdateRegistrationSchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const updated = await ParticipantsService.update(eventId, req.params.id, validated, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: updated.id,
        changes: {
          result: 'SUCCESS',
          participantName: updated.participant?.fullName,
          ticketNumber: updated.registrationNumber,
          current: (({ courtesyApproval, ...safe }) => safe)(validated),
          previous: (updated as any).previousValues,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Información del participante actualizada exitosamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async onsiteSale(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = OnsiteSaleSchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const result = await ParticipantsService.onsiteSale(eventId, validated, userId);

      await recordAuditLog({
        req,
        action: 'CREATE',
        entity: 'REGISTRATION',
        entityId: result.registration.id,
        changes: {
          action: 'ONSITE_SALE',
          participantName: result.registration.participant.fullName,
          registrationNumber: result.registration.registrationNumber,
          ticketTypeId: result.registration.ticketTypeId,
          ticketPrice: result.financials.ticketPrice,
          amountPaid: result.financials.amountPaid,
          balanceDue: result.financials.balanceDue,
          changeDue: result.financials.changeDue,
          isCourtesy: result.registration.isCourtesy,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `Venta presencial completada: Ticket ${result.registration.registrationNumber} para ${result.registration.participant.fullName}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = RecordPaymentSchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const result = await ParticipantsService.recordPayment(eventId, req.params.id, validated, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: req.params.id,
        changes: {
          action: 'RECORD_PAYMENT',
          amount: validated.amount,
          paymentMethodId: validated.paymentMethodId,
          newAmountPaid: result.registration.amountPaid,
          newBalanceDue: result.registration.balanceDue,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `Pago de RD$ ${validated.amount.toFixed(2)} registrado exitosamente. Balance pendiente: RD$ ${Number(result.registration.balanceDue).toFixed(2)}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = CancelRegistrationSchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const result = await ParticipantsService.cancelRegistration(eventId, req.params.id, validated.reason, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: req.params.id,
        changes: { action: 'CANCEL_REGISTRATION', reason: validated.reason },
      });

      return res.status(200).json({
        status: 'success',
        message: `Inscripción de ${result.participant.fullName} cancelada correctamente`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async reactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = ReactivateRegistrationSchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const result = await ParticipantsService.reactivateRegistration(eventId, req.params.id, validated.reason, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: req.params.id,
        changes: { action: 'REACTIVATE_REGISTRATION', reason: validated.reason },
      });

      return res.status(200).json({
        status: 'success',
        message: `Inscripción de ${result.participant.fullName} reactivada correctamente`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async assignCourtesy(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = AssignCourtesySchema.parse(req.body);
      const userId = (req as any).user?.id || 'SYSTEM';

      const result = await ParticipantsService.assignCourtesy(eventId, req.params.id, validated, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: req.params.id,
        changes: { action: 'ASSIGN_COURTESY', ...validated },
      });

      return res.status(200).json({
        status: 'success',
        message: `Cortesía asignada exitosamente a ${result.participant.fullName}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const history = await ParticipantsService.getHistory(eventId, req.params.id);

      return res.status(200).json({
        status: 'success',
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const result = await ParticipantsService.delete(eventId, req.params.id);

      await recordAuditLog({
        req,
        action: 'DELETE',
        entity: 'REGISTRATION',
        entityId: req.params.id,
        changes: { deletedAt: new Date().toISOString() },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  static async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
      const query = ListParticipantsQuerySchema.parse(req.query);

      const fileResult = await ParticipantsService.exportData(eventId, query, format);

      await recordAuditLog({
        req,
        action: 'EXPORT',
        entity: 'REGISTRATION',
        changes: { format, filters: req.query },
      });

      res.setHeader('Content-Type', fileResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileResult.filename}"`);
      return res.send(fileResult.buffer);
    } catch (error) {
      next(error);
    }
  }

  static async generateDemo(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const count = req.body.count ? Number(req.body.count) : 15;
      const result = await ParticipantsService.generateDemoParticipants(eventId, count);

      await recordAuditLog({
        req,
        action: 'CREATE',
        entity: 'REGISTRATION',
        changes: { action: 'generate_demo_participants', count },
      });

      return res.status(201).json({
        status: 'success',
        message: result.message,
        data: { count: result.count },
      });
    } catch (error) {
      next(error);
    }
  }

  static async clearDemo(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const result = await ParticipantsService.clearDemoParticipants(eventId);

      await recordAuditLog({
        req,
        action: 'DELETE',
        entity: 'REGISTRATION',
        changes: { action: 'clear_demo_participants', count: result.count },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: { deletedCount: result.count },
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateTshirtSize(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const { tshirtSize } = req.body;
      const eventId = req.eventId!;
      const userId = req.user!.id;

      const updated = await ParticipantsService.updateTshirtSize(eventId, registrationId, tshirtSize || null, userId);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'REGISTRATION',
        entityId: registrationId,
        changes: {
          action: 'TSHIRT_SIZE_UPDATE',
          result: 'SUCCESS',
          participantName: updated.participant?.fullName,
          ticketNumber: updated.registrationNumber,
          previousSize: (updated as any).previousTshirtSize || null,
          newSize: tshirtSize || null,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: 'Talla de camiseta actualizada correctamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deliverTshirt(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const { size } = req.body;
      const eventId = req.eventId!;
      const userId = req.user!.id;

      const updated = await ParticipantsService.deliverTshirt(eventId, registrationId, userId, size);

      return res.status(200).json({
        status: 'success',
        message: 'Camiseta entregada y descontada del inventario exitosamente.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async returnTshirt(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const { reason } = req.body;
      const eventId = req.eventId!;
      const userId = req.user!.id;

      const updated = await ParticipantsService.returnTshirt(eventId, registrationId, userId, reason);

      return res.status(200).json({
        status: 'success',
        message: 'Camiseta devuelta al inventario exitosamente.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getDeletionPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const scope = (req.query.scope as any) || 'EXCEL_IMPORT';
      const batchId = (req.query.batchId as string) || undefined;

      const preview = await ParticipantsService.getDeletionPreview(eventId, scope, batchId);
      return res.status(200).json({
        status: 'success',
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteImported(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const { batchId } = req.body || {};
      const operatorUserId = req.user?.id;

      const result = await ParticipantsService.deleteImported(eventId, batchId, operatorUserId);

      await recordAuditLog({
        req,
        action: 'DELETE',
        entity: 'REGISTRATION',
        entityId: eventId,
        changes: {
          action: 'DELETE_IMPORTED_PARTICIPANTS',
          scope: result.scope,
          batchId: result.batchId,
          deletedRegistrationsCount: result.deletedRegistrationsCount,
          deletedParticipantsCount: result.deletedParticipantsCount,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async purgeEdition(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const { confirmationPhrase } = req.body || {};
      const operatorUserId = req.user?.id;

      const result = await ParticipantsService.purgeEdition(eventId, confirmationPhrase, operatorUserId);

      await recordAuditLog({
        req,
        action: 'DELETE',
        entity: 'EVENT',
        entityId: eventId,
        changes: {
          action: 'PURGE_ALL_EDITION_PARTICIPANTS',
          backupFile: result.backupFile,
          deletedRegistrationsCount: result.deletedRegistrationsCount,
          deletedParticipantsCount: result.deletedParticipantsCount,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

}
