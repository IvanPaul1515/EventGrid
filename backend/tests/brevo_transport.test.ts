import { afterEach, describe, expect, it, vi } from 'vitest';
import { brevoTransport } from '../src/modules/communications/brevo.transport.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Brevo HTTPS transport without real network calls', () => {
  it('returns provider acceptance with its message id, never claims delivery', async () => {
    vi.stubEnv('BREVO_API_KEY', 'fake-key');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<fake-id>' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await brevoTransport().sendMail({ from: '"QA" <sender@example.invalid>', to: 'recipient@example.invalid', subject: 'Mock only', html: '<p>Mock</p>' });
    expect(result).toEqual({ messageId: '<fake-id>', accepted: ['recipient@example.invalid'], rejected: [] });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(fetchMock.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
  });
  it('preserves the QR as a named PNG attachment without broken CID images', async () => {
    vi.stubEnv('BREVO_API_KEY', 'fake-key');
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<fake>' }) }); vi.stubGlobal('fetch', mock);
    await brevoTransport().sendMail({ from: 's@example.invalid', to: 'r@example.invalid', html: '<img src="cid:ticket-qr-code">', attachments: [{ cid: 'ticket-qr-code', contentType: 'image/png', content: Buffer.from('mock') }] });
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.attachment[0]).toEqual({ name: 'ticket-qr-code.png', content: Buffer.from('mock').toString('base64') });
    expect(body.htmlContent).not.toContain('src="cid:'); expect(body.htmlContent).toContain('archivo adjunto');
  });
  it.each([[400, /solicitud/], [401, /autenticación/], [503, /temporal/]])('explains provider HTTP %i without retrying', async (status, message) => {
    vi.stubEnv('BREVO_API_KEY', 'fake-key'); const mock = vi.fn().mockResolvedValue({ ok: false, status }); vi.stubGlobal('fetch', mock);
    await expect(brevoTransport().sendMail({ from: 's@example.invalid', to: 'r@example.invalid' })).rejects.toThrow(message);
    expect(mock).toHaveBeenCalledOnce();
  });
  it('does not retry ambiguous timeouts', async () => {
    vi.stubEnv('BREVO_API_KEY', 'fake-key'); const mock = vi.fn().mockRejectedValue(new Error('timeout')); vi.stubGlobal('fetch', mock);
    await expect(brevoTransport().sendMail({ from: 's@example.invalid', to: 'r@example.invalid' })).rejects.toMatchObject({ code: 'ETIMEDOUT', command: 'DATA' });
    expect(mock).toHaveBeenCalledOnce();
  });
  it('rejects missing server credentials before making any network request', () => {
    vi.stubEnv('BREVO_API_KEY', ''); const mock = vi.fn(); vi.stubGlobal('fetch', mock);
    expect(() => brevoTransport()).toThrow(/BREVO_API_KEY/); expect(mock).not.toHaveBeenCalled();
  });
});
