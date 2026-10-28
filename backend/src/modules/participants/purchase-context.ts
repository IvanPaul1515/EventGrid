import { historicalDate } from '../import/intelligence.js';
import { BadRequestError, ForbiddenError } from '../../utils/errors.js';
export const HISTORICAL_ONSITE = 'Venta presencial histórica';
export function purchaseContext(input: any, actor: any, now = new Date()) {
  const historical = input.purchaseOrigin === 'HISTORICAL_ONSITE';
  if (historical && (!actor?.isActive || actor.accountStatus === 'PENDING' || actor.scannerOnly || !['ADMIN','OPERATOR'].includes(actor.role))) throw new ForbiddenError('Se requiere administrador u operador autorizado.');
  if (!historical && (input.purchaseDate || input.purchaseTime || input.sourceTimezone || input.receiptReference)) throw new BadRequestError('Seleccione venta histórica para declarar fecha o referencia.');
  const reference = String(input.receiptReference || '').trim();
  if (historical && !reference) throw new BadRequestError('Indique una referencia única del comprobante o venta histórica.');
  if (historical && Number(input.amountPaid || input.totalAmount || 0) > 0 && !input.historicalPaymentConfirmed) throw new BadRequestError('Confirme expresamente el dinero recibido anteriormente. El OCR no acredita pagos.');
  const purchasedAt = historical ? historicalDate(input.purchaseDate, input.purchaseTime, input.sourceTimezone, 'DECLARED') : {value:now.toISOString(),precision:'SECOND',zone:'Z',source:'EVENTGRID_SERVER'};
  return { historical, reference, purchasedAt, historicalDates: JSON.stringify({purchasedAt,registeredAt:{value:now.toISOString(),precision:'SECOND',zone:'Z',source:'EVENTGRID_SERVER'}}), saleTimestamp: purchasedAt?.precision === 'SECOND' && purchasedAt.zone ? new Date(purchasedAt.value) : now };
}
