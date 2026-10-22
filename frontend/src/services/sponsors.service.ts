import { api } from './api';
import {
  Sponsor,
  SponsorSummary,
  SponsorFilterQuery,
  SponsorPayment,
} from '../types';

export interface SponsorListResponse {
  items: Sponsor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: SponsorSummary;
}

export interface CreateSponsorData {
  eventId?: string;
  name: string;
  type?: 'SPONSOR' | 'COLLABORATOR';
  category?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
  contributionType?: 'MONETARY' | 'IN_KIND' | 'MIXED';
  inKindDescription?: string | null;
  committedAmount?: number;
  commitmentDate?: string | Date;
  status?: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
}

export type UpdateSponsorData = Partial<CreateSponsorData> & {
  isArchived?: boolean;
};

export interface CreatePaymentData {
  amount: number;
  paymentDate?: string | Date;
  paymentMethod?: 'TRANSFER' | 'CHECK' | 'CASH' | 'CREDIT_CARD' | 'OTHER';
  reference?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

export const sponsorsService = {
  async getSponsors(params: SponsorFilterQuery = {}): Promise<SponsorListResponse> {
    const res = await api.get('/sponsors', { params });
    return res.data.data;
  },

  async getSummary(): Promise<SponsorSummary> {
    const res = await api.get('/sponsors/summary');
    return res.data.data;
  },

  async getSponsorById(id: string): Promise<Sponsor> {
    const res = await api.get(`/sponsors/${id}`);
    return res.data.data;
  },

  async createSponsor(data: CreateSponsorData): Promise<Sponsor> {
    const res = await api.post('/sponsors', data);
    return res.data.data;
  },

  async updateSponsor(id: string, data: UpdateSponsorData): Promise<Sponsor> {
    const res = await api.put(`/sponsors/${id}`, data);
    return res.data.data;
  },

  async archiveSponsor(id: string, isArchived: boolean = true): Promise<Sponsor> {
    const res = await api.patch(`/sponsors/${id}/archive`, { isArchived });
    return res.data.data;
  },

  async registerPayment(sponsorId: string, data: CreatePaymentData): Promise<{ payment: SponsorPayment; sponsor: Sponsor }> {
    const res = await api.post(`/sponsors/${sponsorId}/payments`, data);
    return res.data.data;
  },

  async annullPayment(paymentId: string, reason: string): Promise<{ payment: SponsorPayment; sponsor: Sponsor }> {
    const res = await api.post(`/sponsors/payments/${paymentId}/annull`, { reason });
    return res.data.data;
  },
};
