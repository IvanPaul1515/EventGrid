import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ transaction: vi.fn(), env: { DATABASE_URL: 'file:mock' } }));
vi.mock('../src/config/db.js', () => ({ prisma: { $transaction: fixture.transaction } }));
vi.mock('../src/config/env.js', () => ({ ENV: fixture.env }));
import { writeTransaction } from '../src/utils/writeTransaction.js';

afterEach(() => { vi.restoreAllMocks(); fixture.transaction.mockReset(); });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

describe('SQLite bounded writer contract (no real database)', () => {
  it('rejects a full queue before starting work and drains accepted operations exactly once', async () => {
    const held = gate(), entered = gate(); let effects = 0;
    fixture.transaction.mockImplementation(async work => work({}));
    const first = writeTransaction(async () => { entered.release(); await held.promise; effects++; });
    await entered.promise;
    const queued = Array.from({ length: 50 }, () => writeTransaction(async () => { effects++; }));
    const rejected = vi.fn();
    try {
      await expect(writeTransaction(rejected)).rejects.toMatchObject({ statusCode: 503 });
      expect(rejected).not.toHaveBeenCalled(); expect(effects).toBe(0);
      expect(fixture.transaction).toHaveBeenCalledTimes(1);
    } finally { held.release(); await Promise.allSettled([first, ...queued]); }
    expect(effects).toBe(51); expect(fixture.transaction).toHaveBeenCalledTimes(51);
  });

  it('rejects an expired queue entry without starting a transaction and releases the next entry', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const held = gate(), entered = gate(); fixture.transaction.mockImplementation(async work => work({}));
    const first = writeTransaction(async () => { entered.release(); await held.promise; });
    await entered.promise;
    const work = vi.fn(), expired = writeTransaction(work);
    const assertion = expect(expired).rejects.toMatchObject({ statusCode: 503 });
    now = 10001; held.release(); await first; await assertion;
    expect(work).not.toHaveBeenCalled(); expect(fixture.transaction).toHaveBeenCalledTimes(1);
    await writeTransaction(async () => 'next'); expect(fixture.transaction).toHaveBeenCalledTimes(2);
  });

  it('releases the queue after failure and never automatically retries an uncertain transaction', async () => {
    fixture.transaction.mockRejectedValueOnce(new Error('uncertain outcome')).mockImplementation(async work => work({}));
    await expect(writeTransaction(async () => undefined)).rejects.toThrow('uncertain outcome');
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    await expect(writeTransaction(async () => 'next')).resolves.toBe('next');
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
  });

  it('reports a serialization conflict without retrying the transaction', async () => {
    fixture.transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(writeTransaction(async () => undefined)).rejects.toMatchObject({ statusCode: 409 });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });
});
