import { api } from './api';

export interface ScheduleItem {
  id: string;
  eventId: string;
  title: string;
  speakerName: string | null;
  speakerBio: string | null;
  speakerCompany: string | null;
  room: string | null;
  day: string;
  startTime: string;
  endTime: string;
  category: string | null;
  status: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED';
  description: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleResponse {
  total: number;
  days: string[];
  rooms: string[];
  categories: string[];
  pdfUrl: string | null;
  items: ScheduleItem[];
}

export interface ScheduleQueryParams {
  day?: string;
  room?: string;
  category?: string;
  status?: string;
  search?: string;
}

export const scheduleService = {
  async getSchedule(eventId: string, params?: ScheduleQueryParams): Promise<ScheduleResponse> {
    const res = await api.get(`/events/${eventId}/schedule`, { params });
    return res.data.data;
  },

  async getItemById(eventId: string, id: string): Promise<ScheduleItem> {
    const res = await api.get(`/events/${eventId}/schedule/${id}`);
    return res.data.data;
  },

  async createItem(eventId: string, data: Partial<ScheduleItem>): Promise<ScheduleItem> {
    const res = await api.post(`/events/${eventId}/schedule`, data);
    return res.data.data;
  },

  async updateItem(eventId: string, id: string, data: Partial<ScheduleItem>): Promise<ScheduleItem> {
    const res = await api.put(`/events/${eventId}/schedule/${id}`, data);
    return res.data.data;
  },

  async deleteItem(eventId: string, id: string): Promise<{ success: boolean; message: string }> {
    const res = await api.delete(`/events/${eventId}/schedule/${id}`);
    return res.data;
  },

  async importSchedule(eventId: string, fileBase64: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/import`, { fileBase64 });
    return res.data;
  },

  async updatePdfUrl(eventId: string, pdfUrl: string, fileBase64?: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/pdf`, { pdfUrl, fileBase64 });
    return res.data.data;
  },

  async getPublicSchedule(eventId: string): Promise<any> {
    const res = await api.get(`/events/${eventId}/schedule/public`);
    return res.data.data;
  },

  async seedDemoSchedule(eventId: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/demo`);
    return res.data;
  },

  async clearDemoSchedule(eventId: string): Promise<any> {
    const res = await api.delete(`/events/${eventId}/schedule/demo`);
    return res.data;
  },
};
