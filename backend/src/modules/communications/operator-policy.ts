import { Request } from 'express';
import { ForbiddenError } from '../../utils/errors.js';
// Explicit capability list: extend here when custom roles are introduced.
export const OPERATOR_EMAIL_CODES = ['DIGITAL_TICKET'];
export function authorizeOperatorEmail(req: Request, payload: { templateCode?: string; customSubject?: string | null; customBodyHtml?: string | null; customMessage?: string | null }) {
  if (req.user?.role !== 'OPERATOR') return;
  if (!OPERATOR_EMAIL_CODES.includes(payload.templateCode || '') || payload.customSubject || payload.customBodyHtml || payload.customMessage) {
    throw new ForbiddenError('Solo puede enviar o previsualizar la entrada digital autorizada, sin modificar su contenido.');
  }
}
