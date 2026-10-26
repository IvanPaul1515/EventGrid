import { vi } from 'vitest';
process.env.NODE_ENV = 'test';
// Real environment files must never select a test database.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@prisma/client', async (importOriginal) => {
    const actual: any = await importOriginal();
    const path = await import('node:path'), os = await import('node:os');
    class GuardedClient extends actual.PrismaClient {
        constructor(options: any = {}) {
            const url = options.datasourceUrl || options.datasources?.db?.url || process.env.DATABASE_URL || '';
            let allowed = false;
            if (url.startsWith('file:')) {
                const target = path.resolve(url.slice(5));
                const root = path.resolve(os.tmpdir());
                const relative = path.relative(root, target);
                allowed = relative.startsWith('eventgrid-') && !relative.startsWith('..') && !path.isAbsolute(relative);
            }
            if (process.env.NODE_ENV !== 'test' || !allowed)
                throw new Error('QA refused: database must be an explicitly allocated eventgrid-* temporary SQLite fixture. PostgreSQL requires its own isolated harness.');
            super(options);
        }
    }
    return { ...actual, PrismaClient: GuardedClient };
});
