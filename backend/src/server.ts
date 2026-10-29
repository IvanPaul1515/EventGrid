import { app } from './app.js';
import { ENV } from './config/env.js';
import { checkDatabaseConnection, prisma } from './config/db.js';
import { RealtimeService } from './modules/realtime/realtime.service.js';

async function startServer() {
  console.log('🚀 Iniciando servidor administrativo BarCamp RD...');

  const dbOk = await checkDatabaseConnection();
  if (dbOk) {
    console.log('✅ Base de datos conectada exitosamente.');
    // Email jobs require a new explicit send/retry action; never resume on startup.
  } else {
    console.warn('⚠️ Advertencia: No se pudo verificar la conexión con la base de datos al iniciar.');
  }

  const server = app.listen(ENV.PORT, () => {
    console.log(`🌐 Servidor escuchando en: http://localhost:${ENV.PORT}`);
    console.log(`📡 Endpoints base disponibles en: http://localhost:${ENV.PORT}${ENV.API_PREFIX}`);
    console.log(`🩺 Health check: http://localhost:${ENV.PORT}${ENV.API_PREFIX}/health`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    RealtimeService.shutdown();
    const deadline = setTimeout(() => { server.closeAllConnections(); void prisma.$disconnect().finally(() => process.exit(1)); }, 20000);
    deadline.unref();
    server.close(() => { void prisma.$disconnect().finally(() => { clearTimeout(deadline); process.exit(0); }); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

startServer().catch((err) => {
  console.error('❌ Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
