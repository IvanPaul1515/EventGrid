import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_SCANNERS, seedDemoScanners } from '../src/modules/auth/demo-scanners.js';
import { hasUserPermission } from '../src/middleware/rbac.js';
import { DemoScannerButtons } from '../../frontend/src/components/DemoScannerButtons.js';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), login: vi.fn() }));
vi.mock('../src/config/db.js', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('../src/config/env.js', () => ({ ENV: { NODE_ENV: 'production', DATABASE_URL: 'file:unused' } }));
vi.mock('../src/modules/auth/auth.service.js', () => ({ AuthService: { login: mocks.login } }));
vi.mock('../src/modules/auth/auth.controller.js', () => ({ AuthController: { login: vi.fn(), logout: vi.fn(), me: vi.fn(), changePassword: vi.fn() } }));
vi.mock('../src/modules/auth/device-session.service.js', () => ({ DeviceSessionService: {} }));
vi.mock('../src/modules/realtime/realtime.service.js', () => ({ RealtimeService: {} }));
vi.mock('../src/modules/auth/recovery.service.js', () => ({ RecoveryService: {}, recoveryMessage: '' }));
vi.mock('../src/modules/users/invitations.service.js', () => ({ InvitationsService: {} }));
vi.mock('../src/middleware/auth.js', () => ({ authenticateToken: vi.fn() }));
vi.mock('../src/middleware/rateLimiter.js', () => ({ loginRateLimiter: (_req: any, _res: any, next: any) => next(), actionRateLimiter: () => (_req: any, _res: any, next: any) => next() }));
import router from '../src/modules/auth/auth.routes.js';
const app = express().use(express.json()).use(router);

describe('isolated demo scanner accounts and quick access', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DEMO_QUICK_ACCESS', 'true'); });
  afterEach(() => vi.unstubAllEnvs());

  it('creates two independent restricted accounts in the same edition, idempotently', async () => {
    const rows: any[] = [];
    const db = { user: {
      findFirst: vi.fn(async ({ where }: any) => rows.find(row => where.OR.some((key: any) => Object.entries(key).every(([k,v]) => row[k] === v))) || null),
      create: vi.fn(async ({ data }: any) => { rows.push(data); return data; }),
    } };
    await seedDemoScanners(db as any, 'demo-edition', true);
    await seedDemoScanners(db as any, 'demo-edition', true);
    expect(db.user.create).toHaveBeenCalledTimes(2);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    for (const row of rows) {
      expect(row).toMatchObject({ role: 'OPERATOR', scannerOnly: true, assignedEventId: 'demo-edition', isActive: true });
      const account = Object.values(DEMO_SCANNERS).find(a => a.id === row.id)!;
      expect(await bcrypt.compare(account.password, row.passwordHash)).toBe(true);
      expect(hasUserPermission(row, 'RECEPTION_QUEUE_SCAN')).toBe(true);
      for (const permission of ['RECEPTION_QUEUE_MANAGE', 'QR_SCAN', 'SETTINGS_MANAGE', 'COMMUNICATIONS_SEND', 'PARTICIPANTS_EXPORT']) {
        expect(hasUserPermission(row, permission as any)).toBe(false);
      }
    }
  });
  it('does not touch accounts when demo is disabled', async () => {
    const db = { user: { findFirst: vi.fn(), create: vi.fn() } };
    await seedDemoScanners(db as any, 'demo-edition', false);
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('never overwrites existing users or resets their passwords/edition', async () => {
    const db = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'existing-real-account' }), create: vi.fn() } };
    await seedDemoScanners(db as any, 'demo-edition', true);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it.each(['SCANNER_1', 'SCANNER_2'] as const)('logs in %s using its own restricted identity', async profile => {
    const account = DEMO_SCANNERS[profile];
    const user = { ...account, role: 'OPERATOR', scannerOnly: true, assignedEventId: 'demo-edition' };
    mocks.findUnique.mockResolvedValue(user);
    mocks.login.mockResolvedValue({ token: `independent-${profile}`, user });
    const response = await request(app).post('/demo-login').send({ role: profile });
    expect(response.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith(account.email, account.password);
    expect(response.body.data.user.scannerOnly).toBe(true);
    expect(response.body.data.token).toBe(`independent-${profile}`);
  });
  it.each(['ADMIN', 'OPERATOR', 'VIEWER'])('preserves existing %s quick login', async role => {
    mocks.login.mockResolvedValue({ token: role });
    expect((await request(app).post('/demo-login').send({ role })).status).toBe(200);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('hides and blocks quick login in production without explicit demo activation', async () => {
    vi.stubEnv('DEMO_QUICK_ACCESS', 'false');
    expect((await request(app).get('/demo-access')).body.enabled).toBe(false);
    expect((await request(app).post('/demo-login').send({ role: 'SCANNER_1' })).status).toBe(404);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('keeps production quick access disabled when the flag is absent', async () => {
    vi.stubEnv('DEMO_QUICK_ACCESS', undefined);
    expect((await request(app).get('/demo-access')).body.enabled).toBe(false);
  });
  it.each([
    { id: 'someone-else', role: 'OPERATOR', scannerOnly: true, assignedEventId: 'demo' },
    { id: DEMO_SCANNERS.SCANNER_1.id, role: 'ADMIN', scannerOnly: false, assignedEventId: 'demo' },
    { id: DEMO_SCANNERS.SCANNER_1.id, role: 'OPERATOR', scannerOnly: true, assignedEventId: null },
  ])('rejects a colliding or improperly configured identity', async user => {
    mocks.findUnique.mockResolvedValue(user);
    expect((await request(app).post('/demo-login').send({ role: 'SCANNER_1' })).status).toBe(404);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('renders two distinct quick-access buttons and disables both while submitting', () => {
    const html = renderToStaticMarkup(React.createElement(DemoScannerButtons, { loading: false, onSelect: vi.fn() }));
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('Escáner QR 1'); expect(html).toContain('Escáner QR 2');
    const disabled = renderToStaticMarkup(React.createElement(DemoScannerButtons, { loading: true, onSelect: vi.fn() }));
    expect(disabled.match(/disabled=""/g)).toHaveLength(2);
  });
  it('each button dispatches its own demo profile', () => {
    const onSelect = vi.fn();
    const component = DemoScannerButtons({ loading: false, onSelect });
    const buttons = component.props.children;
    buttons[0].props.onClick(); buttons[1].props.onClick();
    expect(onSelect.mock.calls).toEqual([['SCANNER_1'], ['SCANNER_2']]);
  });
});
