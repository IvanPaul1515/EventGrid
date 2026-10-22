import { api } from './api';

export interface UserItem {
  id: string;
  email: string;
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
  assignedEventId?: string | null;
  fullName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  password?: string;
  isActive?: boolean;
}

export interface UpdateUserData {
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

  async createUser(data: CreateUserData): Promise<{ user: UserItem; temporaryPassword?: string }> {
    const res = await api.post('/users', data);
    return {
      user: res.data.data,
      temporaryPassword: res.data.temporaryPassword,
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

  async resetPassword(id: string, newPassword?: string): Promise<{ message: string; temporaryPassword?: string }> {
    const res = await api.post(`/users/${id}/reset-password`, newPassword ? { password: newPassword } : {});
    return {
      message: res.data.message,
      temporaryPassword: res.data.temporaryPassword,
    };
  },

  async deleteUser(id: string): Promise<{ message: string }> {
    const res = await api.delete(`/users/${id}`);
    return { message: res.data.message };
  },
};
