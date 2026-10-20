import { app } from './app.js';
import { ENV } from './config/env.js';
import { checkDatabaseConnection } from './config/db.js';

async function startServer() {
  console.log('🚀 Iniciando servidor administrativo BarCamp RD...');

  const dbOk = await checkDatabaseConnection();
  if (dbOk) {
    console.log('✅ Base de datos conectada exitosamente.');
  } else {
    console.warn('⚠️ Advertencia: No se pudo verificar la conexión con la base de datos al iniciar.');
  }

  app.listen(ENV.PORT, () => {
    console.log(`🌐 Servidor escuchando en: http://localhost:${ENV.PORT}`);
    console.log(`📡 Endpoints base disponibles en: http://localhost:${ENV.PORT}${ENV.API_PREFIX}`);
    console.log(`🩺 Health check: http://localhost:${ENV.PORT}${ENV.API_PREFIX}/health`);
  });
}

startServer().catch((err) => {
  console.error('❌ Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
