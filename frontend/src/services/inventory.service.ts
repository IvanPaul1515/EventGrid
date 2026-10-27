import { api } from './api';

export interface TshirtInventoryItem {
  physicalRemaining?:number;
  id: string;
  eventId: string;
  size: string;
  initialQuantity: number;
  deliveredQuantity: number;
  availableQuantity: number;
  availableForParticipants?: number;
  pendingDelivery: number;
  staffReservedQuantity?: number;
  staffDeliveredQuantity?: number;
  staffPendingQuantity?: number;
  totalCommitted?: number;
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

export interface StaffInventoryItem {
  id: string;
  size: string;
  total: number;
  deliveredParticipants: number;
  staffReserved: number;
  staffDelivered: number;
  staffPending: number;
  availableForParticipants: number;
  isActive: boolean;
}

export interface StaffTshirtDeliveryRecord {
  id: string;
  eventId: string;
  size: string;
  quantity: number;
  recipientName?: string;
  notes?: string;
  deliveredAt: string;
  deliveredByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface StaffInventoryResponse {
  summary: {
    total: number;
    deliveredParticipants: number;
    staffReserved: number;
    staffDelivered: number;
    staffPending: number;
    availableForParticipants: number;
  };
  items: StaffInventoryItem[];
  recentDeliveries: StaffTshirtDeliveryRecord[];
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

  // --- MÉTODOS DE T-SHIRTS DEL STAFF ---

  async getStaffInventory(eventId?: string): Promise<StaffInventoryResponse> {
    const url = eventId ? `/events/${eventId}/inventory/staff` : '/inventory/staff';
    const res = await api.get(url);
    return res.data.data;
  },

  async reserveStaffTshirts(data: { size: string; reservedQuantity: number }, eventId?: string) {
    const url = eventId ? `/events/${eventId}/inventory/staff/reserve` : '/inventory/staff/reserve';
    const res = await api.put(url, data);
    return res.data;
  },

  async deliverStaffTshirts(
    data: { size: string; quantity?: number; recipientName?: string; notes?: string },
    eventId?: string
  ) {
    const url = eventId ? `/events/${eventId}/inventory/staff/deliver` : '/inventory/staff/deliver';
    const res = await api.post(url, data);
    return res.data;
  },

  async releaseStaffTshirts(data: { size: string; quantityToRelease: number }, eventId?: string) {
    const url = eventId ? `/events/${eventId}/inventory/staff/release` : '/inventory/staff/release';
    const res = await api.post(url, data);
    return res.data;
  },

  async getStaffDeliveries(eventId?: string): Promise<StaffTshirtDeliveryRecord[]> {
    const url = eventId ? `/events/${eventId}/inventory/staff/deliveries` : '/inventory/staff/deliveries';
    const res = await api.get(url);
    return res.data.data;
  },
};
