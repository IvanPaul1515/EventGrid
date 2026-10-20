import { api } from './api';
import { Registration } from '../types';

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
  search?: string;
  status?: 'ALL' | 'ATTENDED' | 'PENDING';
  page?: number;
  limit?: number;
}

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

  async checkIn(registrationId: string): Promise<{
    message: string;
    registration: Registration;
    counters: AttendanceCounters;
  }> {
    const res = await api.post('/attendance/check-in', { registrationId });
    return {
      message: res.data.message,
      registration: res.data.data,
      counters: res.data.counters,
    };
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

  async exportAttendance(params: { status?: string; search?: string } = {}): Promise<void> {
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
};
