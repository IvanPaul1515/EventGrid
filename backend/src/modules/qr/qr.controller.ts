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
      const { codeOrToken, eventId } = ScanQrSchema.parse(req.body);
      const result = await QrService.validateAndScan(codeOrToken, eventId);
      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }
}
