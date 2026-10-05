import { apiClient } from './client';
import { User, Role } from '../types';

export interface AuthResponse {
  status: string;
  data: {
    user: User;
    accessToken: string;
    expiresIn: number;
  };
}

export const authApi = {
  async register(email: string, password: string, role: Role = 'BIDDER'): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', { email, password, role });
    return res.data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', { email, password });
    return res.data;
  },

  async refresh(): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/refresh');
    return res.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async me(): Promise<{ user: User }> {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },
};
