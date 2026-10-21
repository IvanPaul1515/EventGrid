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

      const staffReserved = item.staffReservedQuantity || 0;
      const staffDelivered = item.staffDeliveredQuantity || 0;
      const staffPending = Math.max(0, staffReserved - staffDelivered);
      const availableParticipants = Math.max(0, item.initialQuantity - delivered - staffReserved);

      return {
        id: item.id,
        eventId: item.eventId,
        size: item.size,
        initialQuantity: item.initialQuantity,
        deliveredQuantity: delivered,
        availableQuantity: availableParticipants,
        availableForParticipants: availableParticipants,
        pendingDelivery: pending,
        staffReservedQuantity: staffReserved,
        staffDeliveredQuantity: staffDelivered,
        staffPendingQuantity: staffPending,
        totalCommitted: delivered + staffReserved,
        isOutOfStock: availableParticipants <= 0,
        isLowStock: availableParticipants > 0 && availableParticipants <= 5,
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

  /**
   * Obtener inventario detallado para T-shirts del Staff (Parte 2)
   */
  static async getStaffInventory(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    const count = await prisma.tshirtInventory.count({ where: { eventId } });
    if (count === 0) {
      await this.initDefaultInventory(eventId);
    }

    const rawItems = await prisma.tshirtInventory.findMany({
      where: { eventId, isActive: true },
      orderBy: { size: 'asc' },
    });

    // Conteo de entregas a participantes
    const participantDeliveries = await prisma.registration.groupBy({
      by: ['tshirtSize'],
      where: {
        eventId,
        status: { not: 'CANCELLED' },
        tshirtDelivered: true,
        tshirtSize: { not: null },
      },
      _count: { id: true },
    });

    const deliveredToParticipantsMap: Record<string, number> = {};
    for (const group of participantDeliveries) {
      if (group.tshirtSize) {
        deliveredToParticipantsMap[group.tshirtSize] = group._count.id;
      }
    }

    let summaryTotal = 0;
    let summaryDeliveredParticipants = 0;
    let summaryStaffReserved = 0;
    let summaryStaffDelivered = 0;
    let summaryStaffPending = 0;
    let summaryAvailableParticipants = 0;

    const items = rawItems.map((item) => {
      const deliveredParticipants = deliveredToParticipantsMap[item.size] || item.deliveredQuantity || 0;
      const staffReserved = item.staffReservedQuantity || 0;
      const staffDelivered = item.staffDeliveredQuantity || 0;
      const staffPending = Math.max(0, staffReserved - staffDelivered);
      const availableForParticipants = Math.max(0, item.initialQuantity - deliveredParticipants - staffReserved);

      summaryTotal += item.initialQuantity;
      summaryDeliveredParticipants += deliveredParticipants;
      summaryStaffReserved += staffReserved;
      summaryStaffDelivered += staffDelivered;
      summaryStaffPending += staffPending;
      summaryAvailableParticipants += availableForParticipants;

      return {
        id: item.id,
        size: item.size,
        total: item.initialQuantity,
        deliveredParticipants,
        staffReserved,
        staffDelivered,
        staffPending,
        availableForParticipants,
        isActive: item.isActive,
      };
    });

    const recentDeliveries = await prisma.staffTshirtDelivery.findMany({
      where: { eventId },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
      include: {
        deliveredByUser: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      summary: {
        total: summaryTotal,
        deliveredParticipants: summaryDeliveredParticipants,
        staffReserved: summaryStaffReserved,
        staffDelivered: summaryStaffDelivered,
        staffPending: summaryStaffPending,
        availableForParticipants: summaryAvailableParticipants,
      },
      items,
      recentDeliveries,
    };
  }

  /**
   * Configurar o modificar la reserva de camisetas para staff por talla (Admin)
   */
  static async reserveStaffTshirts(
    eventId: string,
    size: string,
    reservedQuantity: number,
    userId: string
  ) {
    const trimmedSize = size.trim();
    if (reservedQuantity < 0) {
      throw new BadRequestError('La cantidad a reservar no puede ser negativa');
    }

    return await prisma.$transaction(async (tx) => {
      const item = await tx.tshirtInventory.findUnique({
        where: { eventId_size: { eventId, size: trimmedSize } },
      });

      if (!item || !item.isActive) {
        throw new NotFoundError(`Talla "${trimmedSize}" no encontrada en el inventario activo de esta edición`);
      }

      // Regla: No permitir reducir la reserva por debajo de lo ya entregado al staff
      if (reservedQuantity < item.staffDeliveredQuantity) {
        throw new BadRequestError(
          `No puede reducir la reserva (${reservedQuantity}) por debajo de la cantidad ya entregada al personal (${item.staffDeliveredQuantity}).`
        );
      }

      // Regla: No permitir reservar más camisetas que las físicamente disponibles
      // Disponibles antes de modificar reserva = initialQuantity - deliveredQuantity - staffDeliveredQuantity
      const maxAvailableForStaff = item.initialQuantity - item.deliveredQuantity;
      if (reservedQuantity > maxAvailableForStaff) {
        const availableNow = Math.max(0, item.initialQuantity - item.deliveredQuantity - item.staffReservedQuantity);
        throw new BadRequestError(
          `No hay suficientes camisetas disponibles para reservar esa cantidad. Disponibles libres para participantes: ${availableNow}, Máximo reservable para staff: ${maxAvailableForStaff}.`
        );
      }

      const updated = await tx.tshirtInventory.update({
        where: { id: item.id },
        data: {
          staffReservedQuantity: reservedQuantity,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'STAFF_TSHIRT_RESERVE',
          entity: 'TSHIRT_INVENTORY',
          entityId: item.id,
          changes: JSON.stringify({
            action: 'STAFF_RESERVE_UPDATE',
            size: trimmedSize,
            previousReserved: item.staffReservedQuantity,
            newReserved: reservedQuantity,
            deliveredStaff: item.staffDeliveredQuantity,
            availableForParticipants: Math.max(0, updated.initialQuantity - updated.deliveredQuantity - updated.staffReservedQuantity),
          }),
        },
      });

      return {
        id: updated.id,
        size: updated.size,
        total: updated.initialQuantity,
        deliveredParticipants: updated.deliveredQuantity,
        staffReserved: updated.staffReservedQuantity,
        staffDelivered: updated.staffDeliveredQuantity,
        staffPending: Math.max(0, updated.staffReservedQuantity - updated.staffDeliveredQuantity),
        availableForParticipants: Math.max(0, updated.initialQuantity - updated.deliveredQuantity - updated.staffReservedQuantity),
      };
    });
  }

  /**
   * Registrar entrega física de camisetas a un miembro del staff (Admin)
   */
  static async deliverStaffTshirts(
    eventId: string,
    data: { size: string; quantity?: number; recipientName?: string; notes?: string },
    userId: string
  ) {
    const trimmedSize = data.size.trim();
    const quantity = Math.max(1, data.quantity || 1);

    return await prisma.$transaction(async (tx) => {
      const item = await tx.tshirtInventory.findUnique({
        where: { eventId_size: { eventId, size: trimmedSize } },
      });

      if (!item || !item.isActive) {
        throw new NotFoundError(`Talla "${trimmedSize}" no encontrada en el inventario activo de esta edición`);
      }

      // Validar existencias físicas reales no entregadas a nadie
      const totalDeliveredAll = item.deliveredQuantity + item.staffDeliveredQuantity;
      const physicalRemaining = item.initialQuantity - totalDeliveredAll;
      if (physicalRemaining < quantity) {
        throw new BadRequestError(
          `No hay suficientes camisetas físicas disponibles para entregar al personal. Físicas libres: ${physicalRemaining}, solicitadas: ${quantity}.`
        );
      }

      const newStaffDelivered = item.staffDeliveredQuantity + quantity;
      // Si se entrega con reserva previa, consume de la reserva.
      // Si se entrega directo sin reserva suficiente, se asegura que staffReservedQuantity cubra al menos lo entregado.
      const newStaffReserved = Math.max(item.staffReservedQuantity, newStaffDelivered);

      const updatedInventory = await tx.tshirtInventory.update({
        where: { id: item.id },
        data: {
          staffDeliveredQuantity: newStaffDelivered,
          staffReservedQuantity: newStaffReserved,
        },
      });

      const delivery = await tx.staffTshirtDelivery.create({
        data: {
          eventId,
          size: trimmedSize,
          quantity,
          recipientName: data.recipientName ? data.recipientName.trim() : null,
          notes: data.notes ? data.notes.trim() : null,
          deliveredByUserId: userId,
          deliveredAt: new Date(),
        },
        include: {
          deliveredByUser: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'STAFF_TSHIRT_DELIVER',
          entity: 'STAFF_TSHIRT_DELIVERY',
          entityId: delivery.id,
          changes: JSON.stringify({
            action: 'STAFF_DELIVERY',
            size: trimmedSize,
            quantity,
            recipientName: data.recipientName || 'Sin especificar',
            deliveredStaffTotal: newStaffDelivered,
            staffReserved: newStaffReserved,
            availableForParticipants: Math.max(0, updatedInventory.initialQuantity - updatedInventory.deliveredQuantity - updatedInventory.staffReservedQuantity),
          }),
        },
      });

      return {
        delivery,
        inventory: {
          size: updatedInventory.size,
          total: updatedInventory.initialQuantity,
          deliveredParticipants: updatedInventory.deliveredQuantity,
          staffReserved: updatedInventory.staffReservedQuantity,
          staffDelivered: updatedInventory.staffDeliveredQuantity,
          staffPending: Math.max(0, updatedInventory.staffReservedQuantity - updatedInventory.staffDeliveredQuantity),
          availableForParticipants: Math.max(0, updatedInventory.initialQuantity - updatedInventory.deliveredQuantity - updatedInventory.staffReservedQuantity),
        },
      };
    });
  }

  /**
   * Liberar camisetas no entregadas de la reserva del staff (Admin)
   */
  static async releaseStaffTshirts(
    eventId: string,
    size: string,
    quantityToRelease: number,
    userId: string
  ) {
    const trimmedSize = size.trim();
    if (quantityToRelease <= 0) {
      throw new BadRequestError('La cantidad a liberar debe ser mayor a 0');
    }

    return await prisma.$transaction(async (tx) => {
      const item = await tx.tshirtInventory.findUnique({
        where: { eventId_size: { eventId, size: trimmedSize } },
      });

      if (!item || !item.isActive) {
        throw new NotFoundError(`Talla "${trimmedSize}" no encontrada en el inventario activo de esta edición`);
      }

      const pendingReserve = Math.max(0, item.staffReservedQuantity - item.staffDeliveredQuantity);
      if (pendingReserve <= 0) {
        throw new BadRequestError(`No hay camisetas pendientes de entrega en la reserva de la talla "${trimmedSize}" para liberar.`);
      }

      const actualRelease = Math.min(quantityToRelease, pendingReserve);
      const newStaffReserved = item.staffReservedQuantity - actualRelease;

      const updated = await tx.tshirtInventory.update({
        where: { id: item.id },
        data: {
          staffReservedQuantity: newStaffReserved,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'STAFF_TSHIRT_RELEASE',
          entity: 'TSHIRT_INVENTORY',
          entityId: item.id,
          changes: JSON.stringify({
            action: 'STAFF_RELEASE',
            size: trimmedSize,
            releasedQuantity: actualRelease,
            previousReserved: item.staffReservedQuantity,
            newReserved: newStaffReserved,
            availableForParticipants: Math.max(0, updated.initialQuantity - updated.deliveredQuantity - updated.staffReservedQuantity),
          }),
        },
      });

      return {
        size: updated.size,
        releasedQuantity: actualRelease,
        staffReserved: updated.staffReservedQuantity,
        staffDelivered: updated.staffDeliveredQuantity,
        staffPending: Math.max(0, updated.staffReservedQuantity - updated.staffDeliveredQuantity),
        availableForParticipants: Math.max(0, updated.initialQuantity - updated.deliveredQuantity - updated.staffReservedQuantity),
      };
    });
  }

  /**
   * Consultar historial de entregas al staff
   */
  static async getStaffDeliveries(eventId: string) {
    return await prisma.staffTshirtDelivery.findMany({
      where: { eventId },
      orderBy: { deliveredAt: 'desc' },
      include: {
        deliveredByUser: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

}
