import { api } from './api';
import { ApiResponse, EmailConfig, EmailTemplate, EmailLog, UnifiedEmailRecord } from '../types';

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

export interface RecipientStatsResult {
  totalSelected: number;
  eligibleCount: number;
  alreadyNotifiedCount?: number;
  validEmailsCount: number;
  invalidEmailsCount: number;
  cancelledCount: number;
  demoCount: number;
  duplicateCount: number;
  totalExcluded?: number;
  excludedRecipients?: Array<{
    registrationId: string;
    fullName: string;
    email: string;
    reason: string;
  }>;
  todaySentByEventGrid?: number;
  pendingQueueCount?: number;
  dailyQuotaLimit?: number;
  estimatedRemaining?: number;
  quotaWarning?: string;
  sampleRecipients: Array<{
    id: string;
    fullName: string;
    email: string;
    registrationNumber: string;
    ticketType: string;
    paymentStatus: string;
  }>;
}

export interface EmailBatchJobInfo {
  executionState?: string;
  requiresAuthorization?: boolean;
  id: string;
  eventId: string;
  templateCode?: string;
  subject: string;
  status: string;
  totalCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  simulatedCount: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface SmtpSummaryResult {
  acceptedToday: number;
  deliveredToday: number;
  failedToday: number;
  simulatedToday: number;
  pendingCount: number;
  lastAttempt: {
    id: string;
    recipientEmail: string;
    recipientName?: string;
    templateCode?: string;
    subject: string;
    status: string;
    sentAt: string;
  } | null;
  totalSentAllTime: number;
}

export const communicationsService = {
  async reviewInterrupted(jobId: string) { return (await api.post('/communications/jobs/' + jobId + '/review-interrupted', { confirmed: true })).data.data; },
  async getStatus(eventId: string): Promise<Partial<EmailConfig>> { return (await api.get('/communications/status', { params: { eventId } })).data.data; },
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
  ): Promise<{ success: boolean; message: string; simulated?: boolean; connectionVerified?: boolean; realEmailBlocked?: boolean; realEmailAllowed?: boolean }> {
    const res = await api.post<ApiResponse<{ success: boolean; message: string; simulated?: boolean; connectionVerified?: boolean; realEmailBlocked?: boolean; realEmailAllowed?: boolean }>>('/communications/test', {
      eventId,
      recipientEmail,
      testRecipient: recipientEmail,
    });
    return res.data.data;
  },

  async getSmtpSummary(eventId?: string | null): Promise<SmtpSummaryResult> {
    const res = await api.get<ApiResponse<SmtpSummaryResult>>('/communications/smtp-summary', {
      params: { eventId },
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
    sampleType?: 'MOCK' | 'PARTICIPANT';
    templateCode: string;
    customSubject?: string | null;
    customBodyHtml?: string | null;
    customMessage?: string | null;
  }): Promise<EmailPreviewResult> {
    const res = await api.post<ApiResponse<EmailPreviewResult>>('/communications/preview', payload);
    return res.data.data;
  },

  async sendSingleEmail(payload: {
    expectedRecipientEmail?: string;
    eventId?: string | null;
    registrationId: string;
    templateCode: string;
    customSubject?: string;
    customBodyHtml?: string;
    customMessage?: string;
    mode?: 'REAL' | 'SIMULATION';
    simulateOnly?: boolean;
    confirmedDemoSending?: boolean;
    forceResend?: boolean;
    confirmedResend?: boolean;
    resendReason?: string;
  }): Promise<{ logId: string; status: string; message: string; simulated?: boolean }> {
    const res = await api.post<ApiResponse<{ logId: string; status: string; message: string; simulated?: boolean }>>('/communications/send', payload);
    return res.data.data;
  },

  async validateRecipients(payload: {
    eventId: string;
    targetGroup: 'ALL' | 'CONFIRMED' | 'PAID' | 'PENDING' | 'PENDING_PAYMENT' | 'PARTIAL' | 'COURTESY' | 'ATTENDED' | 'NOT_ATTENDED' | 'SELECTED' | 'PAID_WITHOUT_CONFIRMATION' | 'COURTESY_WITHOUT_CONFIRMATION' | 'WITHOUT_DIGITAL_TICKET' | 'FAILED_COMMUNICATION' | 'WITHOUT_REMINDER' | 'ALREADY_RECEIVED';
    ticketTypeId?: string;
    dateFrom?: string;
    dateTo?: string;
    templateCode?: string;
    excludeAlreadyNotified?: boolean;
    selectedRegistrationIds?: string[];
  }): Promise<RecipientStatsResult> {
    const res = await api.post<ApiResponse<RecipientStatsResult>>('/communications/recipients/validate', payload);
    return res.data.data;
  },

  async sendBulkEmail(payload: {
    eventId: string;
    templateCode: string;
    targetGroup: 'ALL' | 'CONFIRMED' | 'PAID' | 'PENDING' | 'PENDING_PAYMENT' | 'PARTIAL' | 'COURTESY' | 'ATTENDED' | 'NOT_ATTENDED' | 'SELECTED' | 'PAID_WITHOUT_CONFIRMATION' | 'COURTESY_WITHOUT_CONFIRMATION' | 'WITHOUT_DIGITAL_TICKET' | 'FAILED_COMMUNICATION' | 'WITHOUT_REMINDER' | 'ALREADY_RECEIVED';
    ticketTypeId?: string;
    dateFrom?: string;
    dateTo?: string;
    selectedRegistrationIds?: string[];
    customSubject?: string;
    customBodyHtml?: string;
    customMessage?: string;
    mode?: 'REAL' | 'SIMULATION';
    simulateOnly?: boolean;
    confirmedDemoSending?: boolean;
    excludeAlreadyNotified?: boolean;
    forceResend?: boolean;
  }): Promise<{ total: number; sent: number; simulated: number; failed: number; excluded?: number; batchId?: string; message: string }> {
    const res = await api.post<ApiResponse<{ total: number; sent: number; simulated: number; failed: number; excluded?: number; batchId?: string; message: string }>>('/communications/send-bulk', payload);
    return res.data.data;
  },

  async getBatchJobs(eventId: string): Promise<EmailBatchJobInfo[]> {
    const res = await api.get<ApiResponse<EmailBatchJobInfo[]>>('/communications/jobs', {
      params: { eventId },
    });
    return res.data.data;
  },

  async getBatchJob(jobId: string): Promise<EmailBatchJobInfo & { items: any[] }> {
    const res = await api.get<ApiResponse<EmailBatchJobInfo & { items: any[] }>>(`/communications/jobs/${jobId}`);
    return res.data.data;
  },

  async retryBatchJob(jobId: string): Promise<any> {
    return this.retryFailedBatchJob(jobId);
  },

  async retryFailedBatchJob(jobId: string): Promise<any> {
    const res = await api.post<ApiResponse<any>>(`/communications/jobs/${jobId}/retry-failed`);
    return res.data.data;
  },

  async retryUncertainBatchJob(jobId: string, payload: { confirmedDuplicateRisk: boolean; reason: string }): Promise<any> {
    const res = await api.post<ApiResponse<any>>(`/communications/jobs/${jobId}/retry-uncertain`, payload);
    return res.data.data;
  },

  async cancelBatchJob(jobId: string): Promise<{ jobId: string; cancelledItemsCount: number; status: string }> {
    const res = await api.post<ApiResponse<{ jobId: string; cancelledItemsCount: number; status: string }>>(`/communications/jobs/${jobId}/cancel`);
    return res.data.data;
  },

  async getLogs(params: {
    eventId?: string | null;
    status?: string;
    search?: string;
    batchId?: string;
    registrationId?: string;
    recipientEmail?: string;
    templateCode?: string;
    dateFrom?: string;
    dateTo?: string;
    sentByUserId?: string;
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

  async getRegistrationHistory(registrationId: string): Promise<UnifiedEmailRecord[]> {
    const res = await api.get<ApiResponse<UnifiedEmailRecord[]>>(`/communications/history/registration/${registrationId}`);
    return res.data.data;
  },
};
