import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Test configuration resolution without loading local secrets or connecting to a DB.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig(mode: string, databaseUrl?: string) {
  vi.stubEnv('NODE_ENV', mode);
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.stubEnv('JWT_SECRET', 'isolated-config-test-secret');
  return (await import('../src/config/env.js')).ENV;
}

describe('Render PostgreSQL and initialization configuration', () => {
  it('retains PostgreSQL URLs in production', async () => {
    const url = 'postgresql://test:test@localhost:5432/isolated_config_test';
    expect((await loadConfig('production', url)).DATABASE_URL).toBe(url);
  });

  it('retains configured PostgreSQL URLs in development', async () => {
    const url = 'postgresql://test:test@localhost:5432/isolated_config_test';
    expect((await loadConfig('development', url)).DATABASE_URL).toBe(url);
  });

  it('defaults to SQLite only outside production', async () => {
    expect((await loadConfig('development')).DATABASE_URL).toBe('file:./dev.db');
  });

  it('does not silently select SQLite when production has no database URL', async () => {
    expect((await loadConfig('production')).DATABASE_URL).toBeUndefined();
  });

  it('retains an explicitly configured local SQLite database', async () => {
    expect((await loadConfig('development', 'file:./isolated.db')).DATABASE_URL).toBe('file:./isolated.db');
  });

  it('keeps schema setup and seeding before starting the API', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.start).toBe(
      'node scripts/prisma-detect.js db push && npx tsx prisma/seed.ts && node dist/server.js'
    );
    expect(pkg.scripts.start).not.toMatch(/accept-data-loss|force-reset/);
  });

  it('keeps user and email audit records compatible with PostgreSQL enums', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    const files = [
      'users/users.service.ts',
      'communications/communications.service.ts',
      'communications/communications.queue.ts',
    ];
    for (const [field, type] of [['action', 'AuditAction'], ['entity', 'AuditEntity']]) {
      const body = schema.match(new RegExp(`enum ${type}\\s*\\{([^}]+)`))![1];
      const values = new Set(body.trim().split(/\s+/));
      for (const file of files) {
        const source = readFileSync(new URL(`../src/modules/${file}`, import.meta.url), 'utf8');
        const records = [...source.matchAll(new RegExp(`auditLog\\.create\\([\\s\\S]{0,300}?${field}:\\s*'([^']+)'`, 'g'))];
        expect(records.length).toBeGreaterThan(0);
        for (const record of records) expect(values.has(record[1]), `${file}: ${record[1]}`).toBe(true);
      }
    }
  });
});
