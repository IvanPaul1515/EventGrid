import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export async function editionContext(req: Request, res: Response, next: NextFunction) {
  try {
    let eventId =
      (req.headers['x-event-id'] as string) ||
      (req.query.eventId as string) ||
      (req.params.eventId as string);

    if (!eventId) {
      // Si no se especifica, buscar la edición activa por defecto
      const defaultEvent = await prisma.event.findFirst({
        where: {
          OR: [{ isDefault: true }, { status: 'ACTIVE' as any }],
        },
        orderBy: { year: 'desc' },
      });

      if (defaultEvent) {
        req.eventId = defaultEvent.id;
        return next();
      }

      return next(new BadRequestError('No se especificó la edición y no hay una edición activa por defecto'));
    }

    // Verificar que el evento exista
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, status: true },
    });

    if (!event) {
      return next(new NotFoundError(`La edición con ID '${eventId}' no existe`));
    }

    req.eventId = event.id;
    next();
  } catch (error) {
    next(error);
  }
}
