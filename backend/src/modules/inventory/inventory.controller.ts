import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service.js';
import {
  CreateInventoryItemSchema,
  UpdateInventoryItemSchema,
  ReserveStaffTshirtsSchema,
  DeliverStaffTshirtsSchema,
  ReleaseStaffTshirtsSchema,
} from './inventory.dto.js';
import { BadRequestError } from '../../utils/errors.js';

export class InventoryController {
  private static getEventId(req: Request): string {
    return req.params.eventId || req.eventId!;
  }

  static async getInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const data = await InventoryService.getInventory(eventId);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async initInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      await InventoryService.initDefaultInventory(eventId, userId);
      const data = await InventoryService.getInventory(eventId);
      return res.status(200).json({
        status: 'success',
        message: 'Inventario inicial de 282 T-shirts cargado correctamente para esta edición.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const parsed = CreateInventoryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Datos de talla inválidos');
      }

      const created = await InventoryService.createItem(eventId, parsed.data, userId);
      return res.status(201).json({
        status: 'success',
        message: `Talla "${created.size}" agregada correctamente al inventario.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const { id } = req.params;
      const parsed = UpdateInventoryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Datos de modificación inválidos');
      }

      const updated = await InventoryService.updateItem(eventId, id, parsed.data, userId);
      return res.status(200).json({
        status: 'success',
        message: `Talla "${updated.size}" actualizada correctamente en el inventario.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteItem(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const { id } = req.params;
      await InventoryService.deleteItem(eventId, id, userId);
      return res.status(200).json({
        status: 'success',
        message: 'Talla eliminada correctamente del inventario.',
      });
    } catch (err) {
      next(err);
    }
  }

  // --- MÉTODOS DE T-SHIRTS DEL STAFF (PARTE 2) ---

  static async getStaffInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const data = await InventoryService.getStaffInventory(eventId);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reserveStaffTshirts(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const parsed = ReserveStaffTshirtsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Datos de reserva inválidos');
      }

      const updated = await InventoryService.reserveStaffTshirts(
        eventId,
        parsed.data.size,
        parsed.data.reservedQuantity,
        userId
      );

      return res.status(200).json({
        status: 'success',
        message: `Reserva para staff de la talla "${parsed.data.size}" actualizada a ${parsed.data.reservedQuantity} unidades.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deliverStaffTshirts(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const parsed = DeliverStaffTshirtsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Datos de entrega inválidos');
      }

      const result = await InventoryService.deliverStaffTshirts(eventId, parsed.data, userId);

      return res.status(200).json({
        status: 'success',
        message: `Entrega de ${parsed.data.quantity || 1} camiseta(s) talla "${parsed.data.size}" registrada al personal.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async releaseStaffTshirts(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const userId = req.user!.id;
      const parsed = ReleaseStaffTshirtsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Datos de liberación inválidos');
      }

      const result = await InventoryService.releaseStaffTshirts(
        eventId,
        parsed.data.size,
        parsed.data.quantityToRelease,
        userId
      );

      return res.status(200).json({
        status: 'success',
        message: `Se han liberado ${result.releasedQuantity} camiseta(s) de la reserva de staff hacia disponibilidad general.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStaffDeliveries(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = InventoryController.getEventId(req);
      const data = await InventoryService.getStaffDeliveries(eventId);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}
