import { Request, Response, NextFunction } from 'express';
import { RealtimeService } from './realtime.service.js';
import { prisma } from '../../config/db.js';
import { NotFoundError } from '../../utils/errors.js';

export class RealtimeController {
  static async stream(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true },
      });

      if (!event) {
        throw new NotFoundError('Edición no encontrada');
      }

      // Configurar cabeceras obligatorias para Server-Sent Events (SSE)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      res.flushHeaders?.();

      RealtimeService.addClient(eventId, res, { userId: req.user!.id, role: req.user!.role, assignedEventId: req.user!.assignedEventId, expiresAt: req.user!.expiresAt });

      req.on('close', () => {
        RealtimeService.removeClient(eventId, res);
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const count = RealtimeService.getConnectedCount(eventId);

      return res.status(200).json({
        status: 'success',
        data: {
          eventId,
          connectedClients: count,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
