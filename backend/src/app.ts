import { personnelRoutes } from './modules/users/personnel.routes.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ENV } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../uploads');

// Asegurar que las carpetas de almacenamiento existan
const logosDir = path.join(uploadsDir, 'logos');
const schedulesDir = path.join(uploadsDir, 'schedules');
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });
if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });

import { errorHandler } from './middleware/errorHandler.js';
import { checkDatabaseConnection } from './config/db.js';
import authRoutes from './modules/auth/auth.routes.js';
import eventsRoutes from './modules/events/events.routes.js';
import participantsRoutes from './modules/participants/participants.routes.js';
import importRoutes from './modules/import/import.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';
import demoRoutes from './modules/demo/demo.routes.js';
import qrRoutes from './modules/qr/qr.routes.js';
import communicationsRoutes from './modules/communications/communications.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import scheduleRoutes from './modules/schedule/schedule.routes.js';
import realtimeRoutes from './modules/realtime/realtime.routes.js';
import sponsorsRoutes from './modules/sponsors/sponsors.routes.js';

export const app = express();

// Configuración de proxy para resolución segura de IPs (QA-19 / Fase 4)
const trustProxyConfig = process.env.TRUST_PROXY;
if (trustProxyConfig) {
  if (trustProxyConfig === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxyConfig === 'false') {
    app.set('trust proxy', false);
  } else if (!isNaN(Number(trustProxyConfig))) {
    app.set('trust proxy', Number(trustProxyConfig));
  } else {
    app.set('trust proxy', trustProxyConfig);
  }
} else {
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 'loopback');
}

// Seguridad con Helmet (Permitiendo recursos cross-origin para logos e imágenes)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configurado para admitir los orígenes permitidos
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ENV.CORS_ORIGIN.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Bloqueado por política CORS de EventGrid'));
    },
    credentials: true,
  })
);

// Parsers ampliados para soportar cargas de archivos base64 de hojas de cálculo
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser(ENV.COOKIE_SECRET));

// Archivos estáticos públicos (Logos subidos de eventos, ediciones y cronogramas)
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    next();
  },
  express.static(uploadsDir)
);

// Endpoint de salud y diagnóstico
app.get(`${ENV.API_PREFIX}/health`, async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();
  return res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'healthy' : 'degraded',
    platform: 'EventGrid',
    service: 'eventgrid-backend-api',
    timestamp: new Date().toISOString(),
    database: isDbConnected ? 'connected' : 'disconnected',
  });
});

// Rutas de módulos
app.use(`${ENV.API_PREFIX}/auth`, authRoutes);
app.use(`${ENV.API_PREFIX}/realtime`, realtimeRoutes);
app.use(`${ENV.API_PREFIX}/events`, realtimeRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/events', realtimeRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/participants`, participantsRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/import`, importRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/attendance`, attendanceRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/inventory`, inventoryRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/schedule`, scheduleRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/sponsors`, sponsorsRoutes);
app.use(`${ENV.API_PREFIX}/events`, eventsRoutes);
app.use(`${ENV.API_PREFIX}/participants`, participantsRoutes);
app.use(`${ENV.API_PREFIX}/import`, importRoutes);
app.use(`${ENV.API_PREFIX}/attendance`, attendanceRoutes);
app.use(`${ENV.API_PREFIX}/activity`, activityRoutes);
app.use(`${ENV.API_PREFIX}/demo`, demoRoutes);
app.use(`${ENV.API_PREFIX}/qr`, qrRoutes);
app.use(`${ENV.API_PREFIX}/communications`, communicationsRoutes);
app.use(`${ENV.API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${ENV.API_PREFIX}/users`, usersRoutes);
app.use(`${ENV.API_PREFIX}/staff`, personnelRoutes);
app.use(`${ENV.API_PREFIX}/schedule`, scheduleRoutes);
app.use(`${ENV.API_PREFIX}/sponsors`, sponsorsRoutes);

// Manejador centralizado de errores
app.use(errorHandler);
