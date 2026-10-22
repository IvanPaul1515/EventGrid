import { api } from './api';
import { Registration, TicketType, Payment, AuditLog } from '../types';

export interface ListParticipantsParams {
  page?: number;
  limit?: number;
  search?: string;
  paymentMethodId?: string;
  ticketTypeId?: string;
  salesResponsibleId?: string;
  status?: string;
  isVerified?: boolean;
  isCourtesy?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats?: {
    totalRegistrations: number;
    confirmedCount: number;
    pendingCount: number;
    cancelledCount: number;
    attendedCount?: number;
    courtesyCount: number;
    demoCount: number;
    totalRevenue: number;
    verifiedRevenue: number;
    totalBalanceDue?: number;
  };
}

export interface DetailedRegistration extends Registration {
  auditLogs?: AuditLog[];
  editionHistory?: Array<{
    registrationId: string;
    editionId: string;
    editionName: string;
    year: number;
    registrationNumber: string;
    ticketTypeName?: string;
    status: string;
    attended: boolean;
    isCourtesy: boolean;
    totalAmount: number;
    saleTimestamp: string;
    paymentMethodName: string;
  }>;
}

export interface OnsiteSaleInput {
  participantId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  documentId?: string;
  phone?: string;
  alternatePhone?: string;
  institution?: string;
  ticketTypeId: string;
  paymentMethodId?: string;
  amountReceived?: number;
  amountPaid?: number;
  notes?: string;
  courtesyAuthorizedBy?: string;
  courtesyReason?: string;
}

export interface OnsiteSaleResponse {
  registration: Registration;
  payment?: Payment;
  financials: {
    ticketPrice: number;
    amountReceived: number;
    amountPaid: number;
    balanceDue: number;
    changeDue: number;
  };
}

export const participantsService = {
  async list(params: ListParticipantsParams = {}): Promise<PaginatedResult<Registration>> {
    const res = await api.get('/participants', { params });
    return {
      data: res.data.data,
      pagination: res.data.pagination,
      stats: res.data.stats,
    };
  },

  async getById(id: string): Promise<DetailedRegistration> {
    const res = await api.get(`/participants/${id}`);
    return res.data.data;
  },

  async create(data: any): Promise<Registration> {
    const res = await api.post('/participants', data);
    return res.data.data;
  },

  async update(id: string, data: any): Promise<Registration> {
    const res = await api.put(`/participants/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/participants/${id}`);
  },

  async onsiteSale(data: OnsiteSaleInput): Promise<OnsiteSaleResponse> {
    const res = await api.post('/participants/onsite-sale', data);
    return res.data.data;
  },

  async recordPayment(id: string, data: { amount: number; paymentMethodId: string; notes?: string }): Promise<{ payment: Payment; registration: Registration }> {
    const res = await api.post(`/participants/${id}/payments`, data);
    return res.data.data;
  },

  async cancel(id: string, reason: string): Promise<Registration> {
    const res = await api.post(`/participants/${id}/cancel`, { reason });
    return res.data.data;
  },

  async reactivate(id: string, reason: string): Promise<Registration> {
    const res = await api.post(`/participants/${id}/reactivate`, { reason });
    return res.data.data;
  },

  async assignCourtesy(id: string, data: { authorizedBy: string; reason: string }): Promise<Registration> {
    const res = await api.post(`/participants/${id}/courtesy`, data);
    return res.data.data;
  },

  async getHistory(id: string): Promise<{ payments: Payment[]; attendanceLogs: any[]; auditLogs: any[] }> {
    const res = await api.get(`/participants/${id}/history`);
    return res.data.data;
  },

  async getTicketTypes(eventId: string): Promise<TicketType[]> {
    const res = await api.get(`/events/${eventId}/ticket-types`);
    return res.data.data;
  },

  async generateDemo(count = 15): Promise<{ message: string; count: number }> {
    const res = await api.post('/participants/demo', { count });
    return res.data;
  },

  async clearDemo(): Promise<{ message: string; deletedCount: number }> {
    const res = await api.delete('/participants/demo');
    return res.data;
  },

  async export(params: ListParticipantsParams, format: 'xlsx' | 'csv'): Promise<void> {
    const response = await api.get('/participants/export', {
      params: { ...params, format },
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8;',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `EventGrid_Participantes_${new Date().toISOString().slice(0, 10)}.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async getDeletionPreview(scope: 'EXCEL_IMPORT' | 'ALL_EDITION' | 'BATCH' = 'EXCEL_IMPORT', batchId?: string): Promise<{
    eventId: string;
    eventName: string;
    scope: string;
    selectedBatchId: string | null;
    totalRegistrations: number;
    importedRegistrations: number;
    manualRegistrations: number;
    targetCount: number;
    targetPaymentsCount: number;
    targetAttendanceCount: number;
    batches: Array<{
      id: string;
      fileName: string;
      importedRows: number;
      registrationsCount: number;
      createdAt: string;
    }>;
  }> {
    const res = await api.get('/participants/deletion-preview', {
      params: { scope, batchId },
    });
    return res.data.data;
  },

  async deleteImported(batchId?: string): Promise<{
    scope: string;
    batchId: string | null;
    fileName: string | null;
    deletedRegistrationsCount: number;
    deletedParticipantsCount: number;
    deletedPaymentsCount: number;
    deletedAttendanceCount: number;
    message: string;
  }> {
    const res = await api.post('/participants/delete-imported', { batchId });
    return res.data.data;
  },

  async purgeEdition(confirmationPhrase: string): Promise<{
    scope: string;
    eventName: string;
    backupFile: string;
    deletedRegistrationsCount: number;
    deletedParticipantsCount: number;
    deletedPaymentsCount: number;
    deletedAttendanceCount: number;
    message: string;
  }> {
    const res = await api.post('/participants/purge-edition', { confirmationPhrase });
    return res.data.data;
  },
};
