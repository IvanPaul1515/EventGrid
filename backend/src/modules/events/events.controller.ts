import { Request, Response, NextFunction } from 'express';
import { EventsService } from './events.service.js';
import {
  CreateEventSchema,
  UpdateEventSchema,
  UpdateEventSettingsSchema,
  CloneEventSchema,
} from './events.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class EventsController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const events = await EventsService.getAll();
      return res.status(200).json({
        status: 'success',
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await EventsService.getById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: event,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = CreateEventSchema.parse(req.body);
      const event = await EventsService.create(validated);

      await recordAuditLog({
        req,
        action: 'CREATE',
        entity: 'EVENT',
        entityId: event.id,
        changes: { name: event.name, year: event.year },
      });

      return res.status(201).json({
        status: 'success',
        message: 'Edición creada exitosamente',
        data: event,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = UpdateEventSchema.parse(req.body);
      const updated = await EventsService.update(req.params.id, validated);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'EVENT',
        entityId: updated.id,
        changes: validated,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Edición actualizada exitosamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = UpdateEventSettingsSchema.parse(req.body);
      const updatedSettings = await EventsService.updateSettings(req.params.id, validated);

      await recordAuditLog({
        req,
        action: 'UPDATE',
        entity: 'EVENT_SETTINGS',
        entityId: updatedSettings.id,
        changes: validated,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Personalización de edición guardada correctamente',
        data: updatedSettings,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cloneEdition(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = CloneEventSchema.parse(req.body);
      const cloned = await EventsService.cloneEdition(req.params.id, validated);

      await recordAuditLog({
        req,
        action: 'CLONE_EDITION',
        entity: 'EVENT',
        entityId: cloned.id,
        changes: {
          sourceEventId: req.params.id,
          newEventName: cloned.name,
          newYear: cloned.year,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `Edición ${cloned.name} duplicada correctamente sin transferir participantes`,
        data: cloned,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTicketTypes(req: Request, res: Response, next: NextFunction) {
    try {
      const ticketTypes = await EventsService.getTicketTypes(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: ticketTypes,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createTicketType(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, price, description } = req.body;
      const created = await EventsService.createTicketType(req.params.id, {
        name,
        price: Number(price),
        description,
      });
      return res.status(201).json({
        status: 'success',
        message: 'Tipo de entrada creado exitosamente',
        data: created,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateTicketType(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, price, description, isActive } = req.body;
      const updated = await EventsService.updateTicketType(req.params.id, req.params.ticketTypeId, {
        name,
        price: price !== undefined ? Number(price) : undefined,
        description,
        isActive,
      });
      return res.status(200).json({
        status: 'success',
        message: 'Tipo de entrada actualizado exitosamente',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
