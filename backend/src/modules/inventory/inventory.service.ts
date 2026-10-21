import { prisma } from '../../config/db.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';

export const INITIAL_TSHIRT_INVENTORY = [
  { size: 'Medium (M)', quantity: 40 },
  { size: 'XL', quantity: 75 },
  { size: 'L', quantity: 70 },
  { size: '2XL', quantity: 55 },
  { size: 'Size 16', quantity: 12 },
  { size: 'Size 12', quantity: 6 },
  { size: 'Size 14', quantity: 6 },
  { size: 'S', quantity: 18 },
];

export class InventoryService {
  /**
   * Carga inicial idempotente de las 282 camisetas en la edición seleccionada
   */
  static async initDefaultInventory(eventId: string, userId?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });

    if (!event) {
      throw new NotFoundError('Edición no encontrada');
    }

    const existingCount = await prisma.tshirtInventory.count({
      where: { eventId },
    });

    if (existingCount === 0) {
      for (const item of INITIAL_TSHIRT_INVENTORY) {
        await prisma.tshirtInventory.create({
          data: {
            eventId,
            size: item.size,
            initialQuantity: item.quantity,
            deliveredQuantity: 0,
            isActive: true,
          },
        });
      }
    }

    // Asegurar configuración de tallas en settings de la edición
    const currentSizes = INITIAL_TSHIRT_INVENTORY.map((i) => i.size);
    await prisma.eventSettings.upsert({
      where: { eventId },
      create: {
        eventId,
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(currentSizes),
      },
      update: {
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(currentSizes),
      },
    });

    if (userId && existingCount === 0) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'TSHIRT_INVENTORY_INIT',
          entity: 'EVENT',
          entityId: eventId,
          changes: JSON.stringify({
            message: 'Carga inicial de inventario de T-shirts',
            totalInitialUnits: 282,
            sizes: INITIAL_TSHIRT_INVENTORY,
          }),
        },
      }).catch(() => {});
    }

    return true;
  }

  /**
   * Obtener lista de tallas permitidas para una edición (QA-06)
   */
  static async getAllowedSizes(eventId: string): Promise<string[]> {
    const activeInventory = await prisma.tshirtInventory.findMany({
      where: { eventId, isActive: true },
      select: { size: true },
    });

    if (activeInventory.length > 0) {
      return activeInventory.map((i) => i.size);
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });

    let s = event?.settings?.tshirtSizes;
    if (typeof s === 'string') {
      try {
        s = JSON.parse(s);
      } catch {
        s = [];
      }
    }

    if (Array.isArray(s) && s.length > 0) {
      return s;
    }

    return INITIAL_TSHIRT_INVENTORY.map((i) => i.size);
  }

  /**
   * Validar que una talla pertenezca a las permitidas de la edición (QA-06)
   */
  static async validateSize(eventId: string, size?: string | null): Promise<string | null> {
    if (!size || !size.trim()) return null;
    const trimmed = size.trim();
    const allowed = await this.getAllowedSizes(eventId);
    if (!allowed.includes(trimmed)) {
      throw new BadRequestError(
        `TALLA NO PERMITIDA: La talla "${trimmed}" no es válida para esta edición. Tallas permitidas: ${allowed.join(', ')}`
      );
    }
    return trimmed;
  }


  /**
   * Obtener inventario detallado y estadísticas en tiempo real
   */
  static async getInventory(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { settings: true },
    });

    if (!event) {
      throw new NotFoundError('Edición no encontrada');
    }

    // Si aún no tiene inventario inicial para esta edición, inicializarlo automáticamente
    const count = await prisma.tshirtInventory.count({ where: { eventId } });
    if (count === 0) {
      await this.initDefaultInventory(eventId);
    }

    const rawItems = await prisma.tshirtInventory.findMany({
      where: { eventId },
      orderBy: [{ isActive: 'desc' }, { initialQuantity: 'desc' }],
    });

    // Consultar conteos reales de inscripciones en esta edición
    const registrations = await prisma.registration.findMany({
      where: {
        eventId,
        status: { not: 'CANCELLED' },
        tshirtSize: { not: null },
      },
      select: {
        id: true,
        tshirtSize: true,
        tshirtDelivered: true,
      },
    });

    const deliveredCounts: Record<string, number> = {};
    const pendingCounts: Record<string, number> = {};

    for (const reg of registrations) {
      if (reg.tshirtSize) {
        if (reg.tshirtDelivered) {
          deliveredCounts[reg.tshirtSize] = (deliveredCounts[reg.tshirtSize] || 0) + 1;
        } else {
          pendingCounts[reg.tshirtSize] = (pendingCounts[reg.tshirtSize] || 0) + 1;
        }
      }
    }

    let totalInitial = 0;
    let totalDelivered = 0;
    let totalAvailable = 0;
    let totalPendingDelivery = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    const items = rawItems.map((item) => {
      const delivered = deliveredCounts[item.size] || 0;
      const pending = pendingCounts[item.size] || 0;
      const available = Math.max(0, item.initialQuantity - delivered);
      const isOutOfStock = available <= 0;
      const isLowStock = available > 0 && available <= 5;

      if (item.isActive) {
        totalInitial += item.initialQuantity;
        totalDelivered += delivered;
        totalAvailable += available;
        totalPendingDelivery += pending;
        if (isOutOfStock) outOfStockCount++;
        if (isLowStock) lowStockCount++;
      }

      return {
        id: item.id,
        eventId: item.eventId,
        size: item.size,
        initialQuantity: item.initialQuantity,
        deliveredQuantity: delivered,
        availableQuantity: available,
        pendingDelivery: pending,
        isOutOfStock,
        isLowStock,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return {
      stats: {
        totalInitial,
        totalDelivered,
        totalAvailable,
        totalPendingDelivery,
        outOfStockCount,
        lowStockCount,
        deliveryRate: totalInitial > 0 ? Math.round((totalDelivered / totalInitial) * 100) : 0,
      },
      items,
    };
  }

  /**
   * Agregar nueva talla al inventario
   */
  static async createItem(eventId: string, data: { size: string; initialQuantity: number }, userId: string) {
    const trimmedSize = data.size.trim();
    const existing = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId, size: trimmedSize } },
    });

    if (existing) {
      throw new BadRequestError(`Ya existe un registro de inventario para la talla "${trimmedSize}"`);
    }

    const created = await prisma.tshirtInventory.create({
      data: {
        eventId,
        size: trimmedSize,
        initialQuantity: data.initialQuantity,
        deliveredQuantity: 0,
        isActive: true,
      },
    });

    // Actualizar tallas activas en settings
    await this.syncSettingsSizes(eventId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TSHIRT_INVENTORY_CREATE',
        entity: 'TSHIRT_INVENTORY',
        entityId: created.id,
        changes: JSON.stringify({
          action: 'CREATE',
          size: created.size,
          initialQuantity: created.initialQuantity,
        }),
      },
    }).catch(() => {});

    return created;
  }

  /**
   * Modificar cantidad o estado de una talla existente
   */
  static async updateItem(
    eventId: string,
    itemId: string,
    data: { size?: string; initialQuantity?: number; isActive?: boolean },
    userId: string
  ) {
    const current = await prisma.tshirtInventory.findFirst({
      where: { id: itemId, eventId },
    });

    if (!current) {
      throw new NotFoundError('Talla de inventario no encontrada');
    }

    const updated = await prisma.tshirtInventory.update({
      where: { id: itemId },
      data: {
        size: data.size !== undefined ? data.size.trim() : current.size,
        initialQuantity: data.initialQuantity !== undefined ? data.initialQuantity : current.initialQuantity,
        isActive: data.isActive !== undefined ? data.isActive : current.isActive,
      },
    });

    await this.syncSettingsSizes(eventId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TSHIRT_INVENTORY_UPDATE',
        entity: 'TSHIRT_INVENTORY',
        entityId: updated.id,
        changes: JSON.stringify({
          previous: {
            size: current.size,
            initialQuantity: current.initialQuantity,
            isActive: current.isActive,
          },
          current: {
            size: updated.size,
            initialQuantity: updated.initialQuantity,
            isActive: updated.isActive,
          },
        }),
      },
    }).catch(() => {});

    return updated;
  }

  /**
   * Eliminar o desactivar talla
   */
  static async deleteItem(eventId: string, itemId: string, userId: string) {
    const item = await prisma.tshirtInventory.findFirst({
      where: { id: itemId, eventId },
    });

    if (!item) {
      throw new NotFoundError('Talla de inventario no encontrada');
    }

    // Verificar si existen camisetas entregadas para esa talla
    const deliveredCount = await prisma.registration.count({
      where: {
        eventId,
        tshirtSize: item.size,
        tshirtDelivered: true,
      },
    });

    if (deliveredCount > 0) {
      throw new BadRequestError(
        `No se puede eliminar la talla "${item.size}" porque ya tiene ${deliveredCount} camiseta(s) entregada(s). Puede desactivarla para que no aparezca en nuevas confirmaciones.`
      );
    }

    await prisma.tshirtInventory.delete({ where: { id: itemId } });
    await this.syncSettingsSizes(eventId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TSHIRT_INVENTORY_DELETE',
        entity: 'TSHIRT_INVENTORY',
        entityId: itemId,
        changes: JSON.stringify({
          deletedSize: item.size,
          initialQuantity: item.initialQuantity,
        }),
      },
    }).catch(() => {});

    return { success: true };
  }

  private static async syncSettingsSizes(eventId: string) {
    const activeItems = await prisma.tshirtInventory.findMany({
      where: { eventId, isActive: true },
      select: { size: true },
    });
    const sizes = activeItems.map((i) => i.size);

    await prisma.eventSettings.update({
      where: { eventId },
      data: {
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(sizes),
      },
    }).catch(() => {});
  }
}
