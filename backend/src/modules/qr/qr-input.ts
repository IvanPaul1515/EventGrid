export const PAIRING_PREFIX = 'eventgrid-pair:v1:';
export function ticketToken(input: string): { token?: string; pairing?: boolean } {
  let value = input.trim();
  if (value.startsWith('eventgrid-pair:')) return { pairing: true };
  if (value.startsWith('{')) {
    try { const data = JSON.parse(value); if (typeof (data.token ?? data.eg_token) !== 'string') return {}; value = (data.token ?? data.eg_token).trim(); }
    catch { return {}; }
  }
  if (value.startsWith('eventgrid-pair:')) return { pairing: true };
  if (/^https?:\/\//i.test(value) || value.startsWith('/t/')) {
    try {
      const url = new URL(value, 'https://eventgrid.invalid');
      const match = url.pathname.match(/\/t\/([^/]+)\/?$/);
      if (!match) return {};
      value = decodeURIComponent(match[1]);
    } catch { return {}; }
  }
  return value && value.length <= 2048 && !/[\s/?#]/.test(value) ? { token: value } : {};
}
