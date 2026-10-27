import { api } from './api';
import { Registration, DailySalesSummary } from '../types';

export interface AttendanceCounters {
  totalRegistrations: number;
  attendedCount: number;
  pendingCount: number;
}

export interface AttendanceSearchResult {
  data: Registration[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  counters: AttendanceCounters;
}

export interface SearchAttendanceParams {
  dateFrom?:string;dateTo?:string;tshirtDelivery?:'PENDING'|'NOT_DELIVERED'|'DELIVERED';
  search?: string;
  status?: 'ALL' | 'ATTENDED' | 'PENDING';
  page?: number;
  limit?: number;
}

const uncertain = new Set<string>();
const inFlight = new Map<string, Promise<any>>();
export const attendanceService = {
  async getCounters(): Promise<AttendanceCounters> {
    const res = await api.get('/attendance/counters');
    return res.data.data;
  },

  async searchAndList(params: SearchAttendanceParams = {}): Promise<AttendanceSearchResult> {
    const res = await api.get('/attendance', { params });
    return {
      data: res.data.data,
      pagination: res.data.pagination,
      counters: res.data.counters,
    };
  },

  async checkIn(
    registrationId: string,
    tshirtSize?: string | null,
    tshirtDelivered?: boolean
  ): Promise<{
    message: string;
    registration: Registration;
    counters: AttendanceCounters;
  }> {
    if (inFlight.has(registrationId)) return inFlight.get(registrationId)!;
    const reconcile = async () => {
      const fresh = (await api.get('/participants/' + registrationId)).data.data;
      if (!fresh.attended) return null;
      return { message: 'Asistencia confirmada en el servidor.', registration: fresh, counters: await attendanceService.getCounters() };
    };
    const operation = (async () => {
      if (uncertain.has(registrationId)) {
        const persisted = await reconcile();
        if (persisted) { uncertain.delete(registrationId); return persisted; }
      }
      try {
        const res = await api.post('/attendance/check-in', { confirmed: true, registrationId, ...(tshirtSize ? { tshirtSize } : {}), ...(tshirtDelivered !== undefined ? { tshirtDelivered } : {}) });
        uncertain.delete(registrationId);
        return { message: res.data.message, registration: res.data.data, counters: res.data.counters };
      } catch (error: any) {
        if (!error.response || error.response.status >= 500) {
          uncertain.add(registrationId);
          try { const persisted = await reconcile(); if (persisted) { uncertain.delete(registrationId); return persisted; } } catch { /* Never retry the write blindly. */ }
          throw new Error('Resultado de asistencia sin confirmar. Consulte el estado al recuperar la conexión antes de reintentar.');
        }
        throw error;
      }
    })().finally(() => { inFlight.delete(registrationId); });
    inFlight.set(registrationId, operation);
    return operation;
  },

  async revert(registrationId: string, reason: string): Promise<{
    message: string;
    registration: Registration;
    counters: AttendanceCounters;
  }> {
    const res = await api.post('/attendance/revert', { registrationId, reason });
    return {
      message: res.data.message,
      registration: res.data.data,
      counters: res.data.counters,
    };
  },

  async exportAttendance(params: { status?: string; search?: string;dateFrom?:string;dateTo?:string;tshirtDelivery?:string } = {}): Promise<void> {
    const res = await api.get('/attendance/export', {
      params,
      responseType: 'blob',
    });

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `EventGrid_Asistencia_BarCamp_${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async getDailySales(date?: string): Promise<DailySalesSummary> {
    const res = await api.get('/attendance/daily-sales', { params: { date } });
    return res.data.data;
  },
};
