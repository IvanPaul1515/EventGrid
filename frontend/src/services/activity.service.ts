import { api } from './api';
import { AuditLog, User } from '../types';

export interface ListActivityParams {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  entity?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface ActivityResult {
  data: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  filters: {
    users: User[];
    actions: string[];
    entities: string[];
    results?: string[];
  };
}

export const activityService = {
  async list(params: ListActivityParams = {}): Promise<ActivityResult> {
    const res = await api.get('/activity', { params });
    return {
      data: res.data.data,
      pagination: res.data.pagination,
      filters: res.data.filters,
    };
  },

  async export(params: ListActivityParams = {}): Promise<Blob> {
    const res = await api.get('/activity/export', {
      params,
      responseType: 'blob',
    });
    return res.data;
  },
};
