import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ENV } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { checkDatabaseConnection } from './config/db.js';
import authRoutes from './modules/auth/auth.routes.js';
import eventsRoutes from './modules/events/events.routes.js';
import participantsRoutes from './modules/participants/participants.routes.js';
import importRoutes from './modules/import/import.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';

export const app = express();

// Seguridad con Helmet
app.use(helmet());

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

// Endpoint de salud y diagnóstico
app.get(`${ENV.API_PREFIX}/health`, async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();
  return res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'healthy' : 'degraded',
    platform: 'EventGrid',
    service: 'eventgrid-backend-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected,
      engine: 'PostgreSQL (Prisma)',
    },
    environment: ENV.NODE_ENV,
  });
});

// Rutas de la API v1
app.use(`${ENV.API_PREFIX}/auth`, authRoutes);
app.use(`${ENV.API_PREFIX}/events`, eventsRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/participants`, participantsRoutes);
app.use(`${ENV.API_PREFIX}/participants`, participantsRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/import`, importRoutes);
app.use(`${ENV.API_PREFIX}/import`, importRoutes);
app.use(`${ENV.API_PREFIX}/events/:eventId/attendance`, attendanceRoutes);
app.use(`${ENV.API_PREFIX}/attendance`, attendanceRoutes);

// Manejo central de errores
app.use(errorHandler);
