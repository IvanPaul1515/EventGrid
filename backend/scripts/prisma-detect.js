import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

// Cargar .env manualmente si existe
const envPath = path.join(backendRoot, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

function resolveSchema() {
  if (process.env.PRISMA_SCHEMA) {
    return process.env.PRISMA_SCHEMA;
  }

  const dbUrl = (process.env.DATABASE_URL || '').toLowerCase();

  // Si la URL es explícitamente PostgreSQL o es producción sin SQLite configurado
  if (dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:')) {
    return 'prisma/schema.prisma';
  }

  if (process.env.NODE_ENV === 'production' && !dbUrl.startsWith('file:') && !dbUrl.startsWith('sqlite:')) {
    return 'prisma/schema.prisma';
  }

  // En desarrollo / pruebas locales con SQLite
  if (dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:') || dbUrl.includes('.db')) {
    return 'prisma/schema.sqlite.prisma';
  }

  // Por defecto en desarrollo local si existe schema.sqlite.prisma
  if (fs.existsSync(path.join(backendRoot, 'prisma/schema.sqlite.prisma'))) {
    return 'prisma/schema.sqlite.prisma';
  }

  return 'prisma/schema.prisma';
}

const chosenSchema = resolveSchema();
const args = process.argv.slice(2);

// Si los argumentos no especifican ya un --schema, inyectamos el detectado
const hasSchemaArg = args.some(a => a.startsWith('--schema'));
const finalArgs = hasSchemaArg ? args : [...args, `--schema=${chosenSchema}`];

console.log(`[prisma-detect] Entorno detectado. Usando esquema: ${chosenSchema}`);

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const child = spawn(npxCmd, ['prisma', ...finalArgs], {
  cwd: backendRoot,
  stdio: 'inherit',
  shell: isWindows,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
