import { api } from './api';
import { ApiResponse, QrTicketData, QrScanResult } from '../types';

export const qrService = {
  async getTicketQr(registrationId: string): Promise<QrTicketData> {
    const res = await api.get<ApiResponse<QrTicketData>>(`/qr/${registrationId}`);
    return res.data.data;
  },

  async revokeQr(registrationId: string): Promise<{ qrCode: string; message: string }> {
    const res = await api.post<ApiResponse<{ qrCode: string; message: string }>>(`/qr/${registrationId}/revoke`);
    return res.data.data;
  },

  async scan(qrToken: string, activeEventId?: string): Promise<QrScanResult> {
    const res = await api.post<ApiResponse<QrScanResult>>('/qr/scan', {
      codeOrToken: qrToken,
      qrToken,
      eventId: activeEventId,
      activeEventId,
    });
    return res.data.data;
  },
};
