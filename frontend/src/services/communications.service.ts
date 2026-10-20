import { api } from './api';
import { ApiResponse, EmailConfig, EmailTemplate, EmailLog } from '../types';

export const communicationsService = {
  async getConfig(eventId: string): Promise<EmailConfig | null> {
    const res = await api.get<ApiResponse<EmailConfig | null>>('/communications/config', {
      params: { eventId },
    });
    return res.data.data;
  },

  async saveConfig(data: Partial<EmailConfig> & { eventId: string }): Promise<EmailConfig> {
    const res = await api.put<ApiResponse<EmailConfig>>('/communications/config', data);
    return res.data.data;
  },

  async testConnection(eventId: string, testRecipient?: string): Promise<{ success: boolean; message: string; simulated?: boolean }> {
    const res = await api.post<ApiResponse<{ success: boolean; message: string; simulated?: boolean }>>('/communications/test', {
      eventId,
      testRecipient,
    });
    return res.data.data;
  },

  async getTemplates(eventId: string): Promise<EmailTemplate[]> {
    const res = await api.get<ApiResponse<EmailTemplate[]>>('/communications/templates', {
      params: { eventId },
    });
    return res.data.data;
  },

  async updateTemplate(
    templateId: string,
    data: { subject: string; bodyHtml: string; bodyText?: string }
  ): Promise<EmailTemplate> {
    const res = await api.put<ApiResponse<EmailTemplate>>(`/communications/templates/${templateId}`, data);
    return res.data.data;
  },

  async sendSingleEmail(payload: {
    registrationId: string;
    templateCode: string;
    customSubject?: string;
    customBodyHtml?: string;
  }): Promise<{ logId: string; status: string; message: string }> {
    const res = await api.post<ApiResponse<{ logId: string; status: string; message: string }>>('/communications/send', payload);
    return res.data.data;
  },

  async sendBulkEmail(payload: {
    eventId: string;
    templateCode: string;
    targetGroup: 'ALL' | 'PAID' | 'PENDING' | 'ATTENDED' | 'NOT_ATTENDED';
    customSubject?: string;
    customBodyHtml?: string;
  }): Promise<{ total: number; sent: number; simulated: number; failed: number; message: string }> {
    const res = await api.post<ApiResponse<{ total: number; sent: number; simulated: number; failed: number; message: string }>>('/communications/send-bulk', payload);
    return res.data.data;
  },

  async getLogs(params: {
    eventId: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: EmailLog[]; total: number; page: number; totalPages: number }> {
    const res = await api.get<ApiResponse<{ logs: EmailLog[]; total: number; page: number; totalPages: number }>>('/communications/logs', {
      params,
    });
    return res.data.data;
  },
};
