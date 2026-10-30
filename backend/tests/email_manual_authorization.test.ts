import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(), verify: vi.fn().mockResolvedValue(true),
  findJob: vi.fn().mockResolvedValue(null), findConfig: vi.fn(), createLog: vi.fn(),
}));
vi.mock('../src/config/db.js', () => ({ prisma: {
  emailBatchJob: { findUnique: mocks.findJob },
  emailConfig: { findFirst: mocks.findConfig }, emailLog: { create: mocks.createLog },
} }));
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail: mocks.sendMail, verify: mocks.verify, close: vi.fn() })) } }));
vi.mock('../src/utils/crypto.js', () => ({ decryptSecret: () => 'fake-password', encryptSecret: (s: string) => s }));
import { EmailQueueWorker } from '../src/modules/communications/communications.queue.js';
import { ScheduledNotificationsWorker } from '../src/modules/schedule/scheduled-notifications.worker.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe('email requires fresh explicit authorization', () => {
  it('startup, restart, polling, recovery, scheduled work and old batches never touch the provider or persistent jobs', async () => {
    vi.useFakeTimers();
    for (let restart = 0; restart < 2; restart++) {
      EmailQueueWorker.start(); ScheduledNotificationsWorker.start(); EmailQueueWorker.trigger();
      await EmailQueueWorker.recoverStaleJobs(); await EmailQueueWorker.processPendingBatches();
      await ScheduledNotificationsWorker.processPending(); await ScheduledNotificationsWorker.processMaturedNotifications();
      await EmailQueueWorker.processBatch('historical-pending-job');
      await vi.advanceTimersByTimeAsync(60000);
      EmailQueueWorker.stop(); ScheduledNotificationsWorker.stop();
    }
    expect(mocks.findJob).not.toHaveBeenCalled(); expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.createLog).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('allows an explicit batch dispatch but does not retain authorization for later calls', async () => {
    await EmailQueueWorker.authorizeAndProcessBatch('new-explicit-job');
    expect(mocks.findJob).toHaveBeenCalledTimes(1);
    await EmailQueueWorker.processBatch('new-explicit-job');
    expect(mocks.findJob).toHaveBeenCalledTimes(1); expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it('connection tests verify the provider without sending a test message, even in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VITEST', ''); vi.stubEnv('BLOCK_REAL_EMAIL', 'false');
    mocks.findConfig.mockResolvedValue({ isEnabled: true, host: 'smtp.provider.invalid', password: 'fake', port: 587 });
    const result = await CommunicationsService.testConnection('qa@example.invalid');
    expect(result.success).toBe(true); expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.sendMail).not.toHaveBeenCalled(); expect(mocks.createLog).not.toHaveBeenCalled();
  });
  it('disabled SMTP blocks connection tests without creating a transport', async () => {
    mocks.findConfig.mockResolvedValue({ isEnabled: false });
    await expect(CommunicationsService.testConnection('qa@example.invalid')).rejects.toThrow(/deshabilitado/);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it('verifies authentication even when sending is blocked, without a recipient, message or delivery history',async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('VITEST','');vi.stubEnv('BLOCK_REAL_EMAIL','true');vi.stubEnv('DEMO_QUICK_ACCESS','false');
    mocks.findConfig.mockResolvedValue({id:'smtp-blocked',isEnabled:true,host:'smtp.provider.invalid',password:'fake',user:'qa@example.invalid',port:587});
    const result=await CommunicationsService.testConnection();expect(result.connectionVerified).toBe(true);expect(result.realEmailBlocked).toBe(true);expect(mocks.verify).toHaveBeenCalledOnce();expect(mocks.sendMail).not.toHaveBeenCalled();expect(mocks.createLog).not.toHaveBeenCalled();
  });
  it('never exposes provider secrets on authentication failure',async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('VITEST','');vi.stubEnv('DEMO_QUICK_ACCESS','false');
    mocks.findConfig.mockResolvedValue({isEnabled:true,host:'smtp.provider.invalid',password:'fake',port:587});mocks.verify.mockRejectedValueOnce(Object.assign(new Error('private provider details'),{code:'EAUTH'}));
    await expect(CommunicationsService.testConnection()).rejects.toThrow('EAUTH');expect(mocks.sendMail).not.toHaveBeenCalled();expect(mocks.createLog).not.toHaveBeenCalled();
  });
  it('startup, authentication, import, user creation and configuration do not dispatch mail', () => {
    for (const path of ['server.ts', 'config/db.ts', 'modules/auth/auth.service.ts', 'modules/import/import.service.ts', 'modules/users/users.service.ts']) {
      const source = readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\.sendMail\(|\.sendSingleEmail\(|\.sendBulkEmail\(|Worker\.start\(/);
    }
    const source = readFileSync(new URL('../src/modules/communications/communications.service.ts', import.meta.url), 'utf8');
    const saveConfig = source.slice(source.indexOf('static async saveConfig'), source.indexOf('static async testConnection'));
    expect(saveConfig).not.toMatch(/sendMail\(|processBatch\(|\.trigger\(/);
  });
});
