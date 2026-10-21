import { api } from './api';
import { EventEdition, EventSettings, TicketType, FinancialSummary } from '../types';

export const eventsService = {
  async getAll(): Promise<EventEdition[]> {
    const res = await api.get('/events');
    return res.data.data;
  },

  async getById(id: string): Promise<EventEdition> {
    const res = await api.get(`/events/${id}`);
    return res.data.data;
  },

  async update(id: string, data: Partial<EventEdition>): Promise<EventEdition> {
    const res = await api.put(`/events/${id}`, data);
    return res.data.data;
  },

  async updateSettings(id: string, settings: Partial<EventSettings>): Promise<EventSettings> {
    const res = await api.put(`/events/${id}/settings`, settings);
    return res.data.data;
  },

  async uploadLogo(id: string, base64Data: string, fileName = 'logo.png'): Promise<{ settings: EventSettings; logoUrl: string }> {
    const res = await api.post(`/events/${id}/logo`, { base64Data, fileName });
    return res.data.data;
  },

  async removeLogo(id: string): Promise<{ settings: EventSettings; logoUrl: null }> {
    const res = await api.delete(`/events/${id}/logo`);
    return res.data.data;
  },

  async getTicketTypes(id: string, includeInactive = true): Promise<TicketType[]> {
    const res = await api.get(`/events/${id}/ticket-types`, { params: { includeInactive } });
    return res.data.data;
  },

  async createTicketType(id: string, data: Partial<TicketType>): Promise<TicketType> {
    const res = await api.post(`/events/${id}/ticket-types`, data);
    return res.data.data;
  },

  async updateTicketType(id: string, ticketTypeId: string, data: Partial<TicketType>): Promise<TicketType> {
    const res = await api.put(`/events/${id}/ticket-types/${ticketTypeId}`, data);
    return res.data.data;
  },

  async cloneEdition(id: string, data: any): Promise<EventEdition> {
    const res = await api.post(`/events/${id}/clone`, data);
    return res.data.data;
  },

  async getFinancialSummary(id: string): Promise<FinancialSummary> {
    const res = await api.get(`/events/${id}/financial-summary`);
    return res.data.data;
  },

  async getStats(id: string): Promise<any> {
    const res = await api.get(`/events/${id}/stats`);
    return res.data.data;
  },
};
