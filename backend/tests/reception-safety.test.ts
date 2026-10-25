import { describe, expect, it, vi } from 'vitest';
import { uncertainMailFailure, mailFailureMessage } from '../src/utils/mailFailure.js';
import { formatEmailStatus } from '../../frontend/src/utils/emailFormatters';
vi.mock('../src/config/db.js', () => ({ prisma: {} }));
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: 'file:mock', NODE_ENV: 'test' } }));
import { actionRateLimiter } from '../src/middleware/rateLimiter.js';
describe('safe provider failures and sensitive action limits', () => {
  it.each([
    [{code:'ENOTFOUND'},false], [{code:'ETLS'},false], [{code:'EAUTH'},false],
    [{responseCode:429},false], [{code:'ETIMEDOUT',command:'CONN'},false],
    [{code:'ECONNRESET',command:'DATA'},true], [{code:'ETIMEDOUT',command:'DATA'},true],
    [{message:'unknown remote outcome'},true],
  ])('classifies provider failure without automatic uncertain retry: %o', (error, uncertain) => {
    expect(uncertainMailFailure(error)).toBe(uncertain);
    expect(mailFailureMessage({...error,message:'mock-sensitive-secret'})).not.toContain('mock-sensitive-secret');
  });
  it('uses truthful transport-independent delivery labels', () => {
    expect(formatEmailStatus('ACCEPTED_BY_SMTP').label).toBe('Aceptado por el proveedor');
    expect(formatEmailStatus('DELIVERED').description).toContain('servidor destinatario');
    expect(formatEmailStatus('DELIVERED').description).not.toContain('confirmada en el buzón');
    expect(formatEmailStatus('BLOCKED').label).toBe('Bloqueado');
    expect(formatEmailStatus('DEFERRED').label).toBe('Aplazado');
  });
  it('bounds repeated sensitive actions per actor and provides Retry-After', () => {
    const limiter=actionRateLimiter(2,60000), next=vi.fn();
    const req:any={user:{id:'actor'},headers:{}},res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
    limiter(req,res,next);limiter(req,res,next);limiter(req,res,next);
    expect(next).toHaveBeenCalledTimes(2);expect(res.status).toHaveBeenCalledWith(429);expect(res.setHeader).toHaveBeenCalledWith('Retry-After',expect.any(String));
    limiter({...req,user:{id:'different-actor'}},res,next);expect(next).toHaveBeenCalledTimes(3);
  });
});
