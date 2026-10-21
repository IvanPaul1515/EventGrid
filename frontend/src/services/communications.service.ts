import { api } from './api';
import { ApiResponse, EmailConfig, EmailTemplate, EmailLog } from '../types';

export interface EmailPreviewResult {
  subject: string;
  html: string;
  text: string;
  fromName: string;
  fromEmail: string;
  recipientName: string;
  recipientEmail: string;
  registrationNumber: string;
  eventName: string;
  qrUrl: string;
  qrDataUrl: string;
}

export const communicationsService = {
  async getConfig(eventId?: string | null): Promise<EmailConfig | null> {
    const res = await api.get<ApiResponse<EmailConfig | null>>('/communications/config', {
      params: { eventId },
    });
    return res.data.data;
  },

  async saveConfig(data: Partial<EmailConfig> & { eventId?: string | null }): Promise<EmailConfig> {
    const res = await api.put<ApiResponse<EmailConfig>>('/communications/config', data);
    return res.data.data;
  },

  async testConnection(
    eventId?: string | null,
    recipientEmail?: string
  ): Promise<{ success: boolean; message: string; simulated?: boolean }> {
    const res = await api.post<ApiResponse<{ success: boolean; message: string; simulated?: boolean }>>('/communications/test', {
      eventId,
      recipientEmail,
      testRecipient: recipientEmail,
    });
    return res.data.data;
  },

  async getTemplates(eventId?: string | null): Promise<EmailTemplate[]> {
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

  async previewEmail(payload: {
    eventId?: string | null;
    registrationId?: string | null;
    templateCode: string;
    customSubject?: string | null;
    customBodyHtml?: string | null;
    customMessage?: string | null;
  }): Promise<EmailPreviewResult> {
    const res = await api.post<ApiResponse<EmailPreviewResult>>('/communications/preview', payload);
    return res.data.data;
  },

  async sendSingleEmail(payload: {
    eventId?: string | null;
    registrationId: string;
    templateCode: string;
    customSubject?: string;
    customBodyHtml?: string;
    customMessage?: string;
  }): Promise<{ logId: string; status: string; message: string }> {
    const res = await api.post<ApiResponse<{ logId: string; status: string; message: string }>>('/communications/send', payload);
    return res.data.data;
  },

  async sendBulkEmail(payload: {
    eventId: string;
    templateCode: string;
    targetGroup: 'ALL' | 'CONFIRMED' | 'PAID' | 'PENDING' | 'PENDING_PAYMENT' | 'ATTENDED' | 'NOT_ATTENDED' | 'SELECTED';
    selectedRegistrationIds?: string[];
    customSubject?: string;
    customBodyHtml?: string;
    customMessage?: string;
  }): Promise<{ total: number; sent: number; simulated: number; failed: number; excluded?: number; batchId?: string; message: string }> {
    const res = await api.post<ApiResponse<{ total: number; sent: number; simulated: number; failed: number; excluded?: number; batchId?: string; message: string }>>('/communications/send-bulk', payload);
    return res.data.data;
  },

  async getLogs(params: {
    eventId?: string | null;
    status?: string;
    search?: string;
    batchId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: EmailLog[]; total: number; page: number; totalPages: number }> {
    const res = await api.get<any>('/communications/logs', {
      params,
    });
    const logs = Array.isArray(res.data.data) ? res.data.data : (res.data.data?.logs || []);
    const pagination = res.data.pagination || {
      total: logs.length,
      page: params.page || 1,
      totalPages: 1,
    };
    return {
      logs,
      total: pagination.total,
      page: pagination.page,
      totalPages: pagination.totalPages,
    };
  },
};
