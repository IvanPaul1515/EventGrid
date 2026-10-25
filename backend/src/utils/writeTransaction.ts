import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { ENV } from '../config/env.js';
import { AppError, ConflictError } from './errors.js';
let tail: Promise<void> = Promise.resolve();
let waiting = 0;
// SQLite has one writer: bound reception writes per process instead of opening competing transactions.
// PostgreSQL uses its own serializable concurrency. Neither path retries a committed operation.
export async function writeTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }): Promise<T> {
  let release: (() => void) | undefined;
  if (ENV.DATABASE_URL?.startsWith('file:')) {
    if (waiting >= 50) throw new AppError('Recepción ocupada. Consulte el estado antes de reintentar.', 503);
    waiting++;
    const predecessor = tail; tail = new Promise<void>(resolve => { release = resolve; });
    const queuedAt = Date.now();
    await predecessor;
    waiting--;
    if (Date.now() - queuedAt > 10000) { release!(); throw new AppError('La operación no comenzó a tiempo. Consulte el estado antes de reintentar.', 503); }
  }
  try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000, ...options }); }
  catch (error: any) {
    if (error.code === 'P2034') throw new ConflictError('Otro operador modificó este registro. Consulte el estado actualizado antes de reintentar.');
    throw error;
  } finally { release?.(); }
}
