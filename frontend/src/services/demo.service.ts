import { api } from './api';
import { ApiResponse, DemoStatus } from '../types';

export const demoService = {
  async getStatus(eventId?: string): Promise<DemoStatus> {
    const res = await api.get<ApiResponse<DemoStatus>>('/demo/status', {
      params: eventId ? { eventId } : undefined,
    });
    return res.data.data;
  },

  async toggle(eventId: string, enabled: boolean): Promise<{ demoModeEnabled: boolean; message: string }> {
    const res = await api.post<ApiResponse<{ demoModeEnabled: boolean; message: string }>>('/demo/toggle', {
      eventId,
      enabled,
    });
    return res.data.data;
  },

  async generate(eventId: string, count: number = 25): Promise<{ generatedCount: number; message: string }> {
    const res = await api.post<ApiResponse<{ generatedCount: number; message: string }>>('/demo/generate', {
      eventId,
      count,
    });
    return res.data.data;
  },

  async reset(eventId: string, confirmation: string): Promise<{ deletedRegistrations: number; deletedParticipants: number; message: string }> {
    const res = await api.post<ApiResponse<{ deletedRegistrations: number; deletedParticipants: number; message: string }>>('/demo/reset', {
      eventId,
      confirmation,
    });
    return res.data.data;
  },
};
