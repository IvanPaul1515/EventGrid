import axios from 'axios';
import { failureKind, failureCopy } from '../utils/appError';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para inyectar token JWT y EventId activo
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('barcamp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const currentEventId = localStorage.getItem('barcamp_current_event_id');
    if (currentEventId) {
      config.headers['X-Event-Id'] = currentEventId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Report failures without navigation/reloading: forms retain their local values.
api.interceptors.response.use(response => response, error => {
  if (axios.isCancel(error)) return Promise.reject(error);
  const kind = failureKind(error);
  const path = error.config?.url || '';
  const authentication = /\/auth\/(login|demo-login|accept-invitation|logout)$/.test(path);
  if (error.response?.status === 401 && !authentication && localStorage.getItem('barcamp_token')) {
    localStorage.removeItem('barcamp_token'); localStorage.removeItem('barcamp_user');
    window.dispatchEvent(new Event('eventgrid:session-expired'));
  } else if (!authentication && (!error.response || error.response.status >= 500)) {
    window.dispatchEvent(new CustomEvent('eventgrid:request-error', { detail: { kind } }));
  }
  if (error.response?.status >= 500) error.response.data = { message: failureCopy[kind].message };
  return Promise.reject(error);
});
