import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
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

// Interceptor para manejo global de 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Si la sesión expiró y no estamos ya en la página de login
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('barcamp_token');
        localStorage.removeItem('barcamp_user');
        window.location.href = '/login?expired=true';
      }
    }
    return Promise.reject(error);
  }
);
