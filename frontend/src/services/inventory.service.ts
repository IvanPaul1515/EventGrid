import { api } from './api';

export interface TshirtInventoryItem {
  id: string;
  eventId: string;
  size: string;
  initialQuantity: number;
  deliveredQuantity: number;
  availableQuantity: number;
  pendingDelivery: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStats {
  totalInitial: number;
  totalDelivered: number;
  totalAvailable: number;
  totalPendingDelivery: number;
  outOfStockCount: number;
  lowStockCount: number;
  deliveryRate: number;
}

export interface InventoryResponse {
  stats: InventoryStats;
  items: TshirtInventoryItem[];
}

export const inventoryService = {
  async getInventory(eventId?: string): Promise<InventoryResponse> {
    const url = eventId ? `/events/${eventId}/inventory` : '/inventory';
    const res = await api.get(url);
    return res.data.data;
  },

  async initDefaultInventory(eventId?: string): Promise<InventoryResponse> {
    const url = eventId ? `/events/${eventId}/inventory/init` : '/inventory/init';
    const res = await api.post(url);
    return res.data.data;
  },

  async createItem(data: { size: string; initialQuantity: number }, eventId?: string): Promise<TshirtInventoryItem> {
    const url = eventId ? `/events/${eventId}/inventory` : '/inventory';
    const res = await api.post(url, data);
    return res.data.data;
  },

  async updateItem(
    id: string,
    data: { size?: string; initialQuantity?: number; isActive?: boolean },
    eventId?: string
  ): Promise<TshirtInventoryItem> {
    const url = eventId ? `/events/${eventId}/inventory/${id}` : `/inventory/${id}`;
    const res = await api.put(url, data);
    return res.data.data;
  },

  async deleteItem(id: string, eventId?: string): Promise<void> {
    const url = eventId ? `/events/${eventId}/inventory/${id}` : `/inventory/${id}`;
    await api.delete(url);
  },

  async deliverTshirt(registrationId: string, size?: string) {
    const res = await api.post(`/participants/${registrationId}/deliver-tshirt`, { size });
    return res.data.data;
  },

  async returnTshirt(registrationId: string, reason: string) {
    const res = await api.post(`/participants/${registrationId}/return-tshirt`, { reason });
    return res.data.data;
  },
};
