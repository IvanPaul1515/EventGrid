import { api } from './api';

export interface ScheduleItem {
  speakerIds?: string[];
  programmingStatus?: string;
  id: string;
  eventId: string;
  title: string;
  speakerName: string | null;
  speakerBio: string | null;
  speakerCompany: string | null;
  room: string | null;
  day: string;
  startTime: string;
  endTime: string;
  category: string | null;
  status: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED';
  description: string | null;
  order: number;
  isKeynote?: boolean;
  visibility?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED';
  publishAt?: string | null;
  imageUrl?: string | null;
  announcementText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleResponse {
  total: number;
  days: string[];
  rooms: string[];
  categories: string[];
  pdfUrl: string | null;
  items: ScheduleItem[];
}

export interface ScheduleQueryParams {
  day?: string;
  room?: string;
  category?: string;
  status?: string;
  search?: string;
}

export interface ScheduleChangeLog {
  id: string;
  eventId: string;
  scheduleItemId?: string | null;
  changeType: string;
  diffPayload: any;
  userId: string;
  notified: boolean;
  batchJobId?: string | null;
  createdAt: string;
  scheduleItem?: Partial<ScheduleItem>;
}

export interface ScheduledNotification {
  id: string;
  eventId: string;
  type: string;
  targetGroup: string;
  payload: any;
  scheduledFor: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  executedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface UpdateItemResult {
  item: ScheduleItem;
  meta?: {
    hasRelevantChanges: boolean;
    changeLog: any;
    diffs: any[];
  };
}

export const scheduleService = {
  async getSchedule(eventId: string, params?: ScheduleQueryParams): Promise<ScheduleResponse> {
    const res = await api.get(`/events/${eventId}/schedule`, { params });
    return res.data.data;
  },

  async getItemById(eventId: string, id: string): Promise<ScheduleItem> {
    const res = await api.get(`/events/${eventId}/schedule/${id}`);
    return res.data.data;
  },

  async createItem(eventId: string, data: Partial<ScheduleItem>): Promise<ScheduleItem> {
    const res = await api.post(`/events/${eventId}/schedule`, data);
    return res.data.data;
  },

  async updateItem(eventId: string, id: string, data: Partial<ScheduleItem>): Promise<UpdateItemResult> {
    const res = await api.put(`/events/${eventId}/schedule/${id}`, data);
    return {
      item: res.data.data,
      meta: res.data.meta,
    };
  },

  async deleteItem(eventId: string, id: string): Promise<{ success: boolean; message: string }> {
    const res = await api.delete(`/events/${eventId}/schedule/${id}`);
    return res.data;
  },

  async importSchedule(eventId: string, fileBase64: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/import`, { fileBase64 });
    return res.data;
  },

  async updatePdfUrl(eventId: string, pdfUrl: string, fileBase64?: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/pdf`, { pdfUrl, fileBase64 });
    return res.data.data;
  },

  async getPublicSchedule(eventId: string): Promise<any> {
    const res = await api.get(`/events/${eventId}/schedule/public`);
    return res.data.data;
  },

  async seedDemoSchedule(eventId: string): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/demo`);
    return res.data;
  },

  async clearDemoSchedule(eventId: string): Promise<any> {
    const res = await api.delete(`/events/${eventId}/schedule/demo`);
    return res.data;
  },

  async publishKeynote(
    eventId: string,
    id: string,
    data: {
      action: 'PUBLISH_ONLY' | 'PUBLISH_AND_NOTIFY' | 'SCHEDULE_PUBLISH_AND_NOTIFY';
      targetGroup?: string;
      scheduledFor?: string;
      customMessage?: string;
    }
  ): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/${id}/publish-keynote`, data);
    return res.data;
  },

  async notifyScheduleChange(
    eventId: string,
    data: {
      scheduleItemId: string;
      changeLogId?: string;
      action: 'SEND_NOW' | 'SCHEDULE';
      targetGroup?: string;
      scheduledFor?: string;
      customNote?: string;
      changesSummary?: any;
    }
  ): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/notify-change`, data);
    return res.data;
  },

  async createAnnouncement(
    eventId: string,
    data: {
      subject: string;
      message: string;
      action: 'SEND_NOW' | 'SCHEDULE';
      targetGroup?: string;
      scheduledFor?: string;
      priority?: 'NORMAL' | 'URGENT';
    }
  ): Promise<any> {
    const res = await api.post(`/events/${eventId}/schedule/announcements`, data);
    return res.data;
  },

  async getChangeHistory(eventId: string): Promise<ScheduleChangeLog[]> {
    const res = await api.get(`/events/${eventId}/schedule/changes/history`);
    return res.data.data;
  },

  async getScheduledNotifications(eventId: string): Promise<ScheduledNotification[]> {
    const res = await api.get(`/events/${eventId}/schedule/notifications/scheduled`);
    return res.data.data;
  },

  async cancelScheduledNotification(eventId: string, id: string): Promise<any> {
    const res = await api.delete(`/events/${eventId}/schedule/notifications/scheduled/${id}`);
    return res.data;
  },
};
