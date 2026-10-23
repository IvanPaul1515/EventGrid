// Optional HTTPS transport for hosts that block SMTP. Never selected implicitly.
export const usesBrevoHttps = () => process.env.EMAIL_TRANSPORT === 'brevo_https';
export function brevoTransport() {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('Configuración incompleta: falta BREVO_API_KEY en el servidor.');
  const call = async (path: string, body?: any) => {
    let response: globalThis.Response;
    try {
      response = await fetch(`https://api.brevo.com/v3/${path}`, {
        method: body ? 'POST' : 'GET', headers: { 'api-key': key, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw Object.assign(new Error('Conexión HTTPS con Brevo agotada o no disponible; no se reintentó automáticamente.'), { code: 'ETIMEDOUT', command: body ? 'DATA' : 'CONN' });
    }
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? 'Brevo rechazó la autenticación. Revise la API key del servidor.'
        : response.status === 400 ? 'Brevo rechazó la solicitud. Revise remitente verificado y destinatario.' : 'Error temporal del proveedor Brevo.';
      throw Object.assign(new Error(message), { responseCode: response.status, code: response.status === 401 ? 'EAUTH' : 'EPROVIDER' });
    }
    return response.json();
  };
  return {
    verify: async () => { await call('account'); return true; }, close: () => {},
    sendMail: async (mail: any) => {
      const match = String(mail.from).match(/^(?:"?(.*?)"?\s*)?<([^>]+)>$/);
      const to = Array.isArray(mail.to) ? mail.to : [mail.to];
      // Brevo HTTPS has no documented CID field. Preserve QR as a named PNG
      // attachment rather than submitting broken inline references/unnamed files.
      let html = mail.html;
      for (const attachment of mail.attachments || []) {
        if (!attachment.cid || !html) continue;
        const cid = attachment.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp('<img\\b[^>]*src=[\"\']cid:' + cid + '[\"\'][^>]*>', 'gi'),
          attachment.cid === 'ticket-qr-code' ? '<p>Su código QR se incluye en el archivo adjunto ticket-qr-code.png.</p>' : '');
      }
      const result: any = await call('smtp/email', {
        sender: { email: match?.[2] || mail.from, name: match?.[1] || undefined },
        to: to.map((email: string) => ({ email })), subject: mail.subject,
        htmlContent: html, textContent: mail.text,
        ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
        ...(mail.attachments?.length ? { attachment: mail.attachments.map((a: any) => ({
          name: a.filename || `${a.cid || 'attachment'}.${a.contentType === 'image/png' ? 'png' : 'bin'}`, content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        })) } : {}),
      });
      if (!result.messageId) throw new Error('Brevo no confirmó la aceptación del mensaje.');
      return { messageId: result.messageId, accepted: to, rejected: [] };
    },
  };
}
