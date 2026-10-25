import { api } from './api';

export interface UserItem {
  id: string;
  email: string;
  staffArea?: string | null;
  invitationState?: string;
  invitation?: { expiresAt?: string | null } | null;
  accountStatus?: string;
  assignedEventId?: string | null;
  fullName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersResponse {
  users: UserItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateUserData {
  email: string;
  staffArea?: string | null;
  accountStatus?: string;
  assignedEventId?: string | null;
  fullName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  isActive?: boolean;
}

export interface UpdateUserData {
  staffArea?: string | null;
  accountStatus?: string;
  assignedEventId?: string | null;
  fullName?: string;
  role?: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  isActive?: boolean;
}

export const usersService = {
  async listUsers(params?: {
    search?: string;
    role?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ListUsersResponse> {
    const res = await api.get('/users', { params });
    return {
      users: res.data.data,
      pagination: res.data.pagination,
    };
  },

  async getUserById(id: string): Promise<UserItem> {
    const res = await api.get(`/users/${id}`);
    return res.data.data;
  },

  async createUser(data: CreateUserData): Promise<{ user: UserItem }> {
    const res = await api.post('/users', data);
    return {
      user: res.data.data,
    };
  },

  async updateUser(id: string, data: UpdateUserData): Promise<UserItem> {
    const res = await api.put(`/users/${id}`, data);
    return res.data.data;
  },

  async toggleStatus(id: string): Promise<UserItem> {
    const res = await api.patch(`/users/${id}/toggle-status`);
    return res.data.data;
  },

  async deleteUser(id: string): Promise<{ message: string }> {
    const res = await api.delete(`/users/${id}`);
    return { message: res.data.message };
  },
};
