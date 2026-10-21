import { Request, Response, NextFunction } from 'express';
import { QrService } from './qr.service.js';
import { ScanQrSchema, RevokeQrSchema } from './qr.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class QrController {
  static async getTicketQr(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const data = await QrService.getTicketQr(registrationId);
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  static async revokeQr(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrationId } = req.params;
      const { reason } = RevokeQrSchema.parse(req.body);
      const result = await QrService.revokeAndRegenerate(registrationId, req.user?.id, reason);

      await recordAuditLog({
        req,
        action: 'QR_REVOKED',
        entity: 'REGISTRATION',
        entityId: registrationId,
        changes: { newQrToken: result.newQrToken, reason },
      });

      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ScanQrSchema.parse(req.body);
      const codeOrToken = (parsed.codeOrToken || parsed.qrToken)!.trim();
      const eventId = parsed.eventId || parsed.activeEventId || (req.headers['x-event-id'] as string) || undefined;
      const result = await QrService.validateAndScan(codeOrToken, eventId);

      if (!result.valid) {
        await recordAuditLog({
          req,
          action: 'QR_VALIDATION_FAILED',
          entity: 'REGISTRATION',
          entityId: result.registration?.id || undefined,
          changes: {
            result: 'REJECTED',
            reason: result.message || 'Código QR no válido',
            error: result.error,
            ticketScanned: codeOrToken.length > 30 ? codeOrToken.slice(0, 15) + '...' : codeOrToken,
          },
        }).catch(() => {});
      } else {
        await recordAuditLog({
          req,
          action: 'QR_SCAN',
          entity: 'REGISTRATION',
          entityId: result.registration?.id,
          changes: {
            result: 'SUCCESS',
            participantName: result.participant?.fullName,
            ticketNumber: result.registration?.registrationNumber,
          },
        }).catch(() => {});
      }

      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }
}
