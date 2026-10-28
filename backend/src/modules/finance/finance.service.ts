import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';

export function cents(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new BadRequestError('Importe inválido: utilice hasta dos decimales.');
  return Math.round(n * 100);
}
const money = (value: number) => value / 100;
const json = (value: unknown) => ENV.DATABASE_URL?.startsWith('file:') ? JSON.stringify(value) : value;
export async function financeAudit(tx: any, actorId: string, eventId: string, registrationId: string, action: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actorId, action: 'UPDATE', entity: 'REGISTRATION', entityId: registrationId, changes: json({ eventId, action, details }) as any } });
}

export class FinanceService {
  static async admin(tx: any, actorId: string, eventId: string) {
    const user = await tx.user.findUnique({ where: { id: actorId } });
    if (!user?.isActive || user.accountStatus !== 'ACTIVE' || user.role !== 'ADMIN' || (user.assignedEventId && user.assignedEventId !== eventId)) throw new ForbiddenError('Se requiere autorización administrativa de esta edición.');
    return user;
  }
  static async review(tx: any, input: { eventId: string; registrationId?: string; sourceBatchId?: string; code: string; reason: string; evidence?: unknown; actorId: string }) {
    const fingerprint = createHash('sha256').update(JSON.stringify([input.eventId, input.registrationId, input.code, input.evidence])).digest('hex');
    const existing = await tx.financialReview.findUnique({ where: { eventId_fingerprint: { eventId: input.eventId, fingerprint } } });
    if (existing) return existing;
    const result = await tx.financialReview.create({ data: { eventId: input.eventId, registrationId: input.registrationId, sourceBatchId: input.sourceBatchId, code: input.code, reason: input.reason, evidence: input.evidence ? JSON.stringify(input.evidence) : null, fingerprint, createdByUserId: input.actorId } });
    if (input.registrationId) await financeAudit(tx, input.actorId, input.eventId, input.registrationId, 'FINANCIAL_REVIEW_OPENED', { reviewId: result.id, code: input.code, reason: input.reason, batchId: input.sourceBatchId });
    else if (input.sourceBatchId) await tx.auditLog.create({ data: { userId: input.actorId, action: 'IMPORT', entity: 'IMPORT_BATCH', entityId: input.sourceBatchId, changes: json({ eventId: input.eventId, action: 'FINANCIAL_REVIEW_OPENED', reviewId: result.id, code: input.code, reason: input.reason }) as any } });
    return result;
  }
  static async resolveReview(eventId: string, actorId: string, reviewId: string, input: { reason: string; ticketTypeId?: string; externalPlatform?: string; externalReference?: string }) {
    return writeTransaction(async tx => {
      await this.admin(tx, actorId, eventId);
      const review = await tx.financialReview.findFirst({ where: { id: reviewId, eventId, status: 'OPEN' } });
      if (!review) throw new NotFoundError('Revisión no encontrada o ya resuelta.');
      if (input.ticketTypeId) {
        if (review.code !== 'AMBIGUOUS_TARIFF' || !review.registrationId) throw new BadRequestError('Esta revisión no admite asignación de tarifa.');
        const reg = await tx.registration.findUniqueOrThrow({ where: { id: review.registrationId } });
        const ticket = await tx.ticketType.findFirst({ where: { id: input.ticketTypeId, eventId, isActive: true } });
        if (!ticket || cents(ticket.price) <= 0 || reg.attended || reg.isCourtesy || reg.status === 'CANCELLED' || cents(reg.amountPaid) || cents(reg.ticketPrice)) throw new ConflictError('No puede cambiarse una tarifa histórica ni una inscripción con operaciones.');
        await tx.registration.update({ where: { id: reg.id }, data: { ticketTypeId: ticket.id, ticketPrice: ticket.price, balanceDue: ticket.price, updatedByUserId: actorId } });
      } else if (review.code === 'AMBIGUOUS_TARIFF') throw new BadRequestError('Seleccione la tarifa que corresponde a esta inscripción.');
      if (input.externalPlatform || input.externalReference) {
        if (review.code !== 'SOURCE_ASSOCIATION' || !review.registrationId || !input.externalPlatform?.trim() || !input.externalReference?.trim()) throw new BadRequestError('Indique la fuente y su referencia para una asociación explícita.');
        const duplicate = await tx.registration.findFirst({ where: { eventId, externalPlatform: input.externalPlatform.trim(), externalReference: input.externalReference.trim(), id: { not: review.registrationId } } });
        if (duplicate) throw new ConflictError('La referencia ya pertenece a otra inscripción.');
        await tx.registration.update({ where: { id: review.registrationId }, data: { source: 'EXCEL_IMPORT', externalPlatform: input.externalPlatform.trim(), externalReference: input.externalReference.trim(), updatedByUserId: actorId } });
      } else if (review.code === 'SOURCE_ASSOCIATION') throw new BadRequestError('La asociación requiere fuente y referencia confirmadas.');
      const result = await tx.financialReview.update({ where: { id: review.id }, data: { status: 'RESOLVED', resolution: input.reason, resolvedAt: new Date(), resolvedByUserId: actorId } });
      if (review.registrationId) await financeAudit(tx, actorId, eventId, review.registrationId, 'FINANCIAL_REVIEW_RESOLVED', { reviewId, ...input });
      // Attribution and tariff approval do not imply receipt of money. Re-import
      // the source to perform an independently audited, idempotent reconciliation.
      return result;
    });
  }
  static async externalReport(tx: any, input: { eventId: string; registrationId: string; actorId: string; batchId?: string; reportedFull: 'YES' | 'NO' | 'UNKNOWN'; cumulativeAmount?: number; method?: string; reference: string }) {
    const reg = await tx.registration.findFirst({ where: { id: input.registrationId, eventId: input.eventId }, include: { payments: true } });
    if (!reg) throw new NotFoundError('Inscripción fuera de la edición.');
    const recordReview = async (code: string, reason: string) => { await this.review(tx, { eventId: input.eventId, registrationId: reg.id, sourceBatchId: input.batchId, actorId: input.actorId, code, reason, evidence: { reportedFull: input.reportedFull, cumulativeAmount: input.cumulativeAmount, reference: input.reference, method: input.method } }); return { outcome: 'REVIEW', reason }; };
    await tx.registration.update({ where: { id: reg.id }, data: { paymentFullReported: input.reportedFull, externalPaymentMethod: input.method || null, lastExternalSyncAt: new Date() } });
    if (reg.status === 'CANCELLED' || reg.isCourtesy || await tx.courtesyRequest.findUnique({ where: { pendingRegistrationId: reg.id } }) || await tx.refundRequest.findFirst({ where: { registrationId: reg.id, status: { not: 'REJECTED' } } })) return recordReview('PROTECTED_STATE', 'La inscripción tiene cancelación, cortesía, excepción o reembolso; requiere revisión.');
    if (!['EXCEL_IMPORT','HISTORICAL_ONSITE'].includes(reg.source) || !reg.externalReference) return recordReview('SOURCE_ASSOCIATION', 'Debe verificarse la asociación con la inscripción externa antes de acreditar dinero.');
    const oldExternal = reg.payments.filter((p: any) => p.channel === 'EXTERNAL').reduce((n: number, p: any) => n + cents(p.amount), 0);
    const local = reg.payments.filter((p: any) => p.channel === 'ONSITE').reduce((n: number, p: any) => n + cents(p.amount), 0);
    const legacy = reg.payments.filter((p: any) => !['EXTERNAL', 'ONSITE'].includes(p.channel)).reduce((n: number, p: any) => n + cents(p.amount), 0);
    const price = cents(reg.ticketPrice), paid = cents(reg.amountPaid);
    if (legacy) return recordReview('LEGACY_CHANNEL', 'Hay movimientos históricos sin procedencia determinada.');
    if (input.reportedFull === 'NO' && (reg.paymentFullReported === 'YES' || (oldExternal >= price && price > 0))) return recordReview('PAID_TO_UNPAID', 'La fuente cambió SÍ a NO. Se conserva el pago confirmado.');
    if (input.cumulativeAmount === undefined && input.reportedFull !== 'YES') {
      if (input.reportedFull === 'UNKNOWN') return recordReview('UNKNOWN_PAYMENT', 'La fuente no informa un estado de pago inequívoco.');
      return { outcome: 'UNCHANGED' };
    }
    const target = input.cumulativeAmount !== undefined ? cents(input.cumulativeAmount) : price;
    if (target < oldExternal) return recordReview('EXTERNAL_AMOUNT_DECREASED', 'El importe informado disminuyó; no se eliminará dinero confirmado.');
    if (input.method && reg.externalPaymentMethod && input.method !== reg.externalPaymentMethod && oldExternal) await recordReview('METHOD_CHANGED', 'Cambió el método externo; los movimientos anteriores se conservan.');
    if (input.reportedFull === 'YES' && target !== price) return recordReview('FULL_AMOUNT_CONFLICT', 'El indicador de pago completo no coincide con el importe informado.');
    const nextPaid = Math.max(paid, local + target);
    if (nextPaid > price && nextPaid > paid) return recordReview('OVERPAYMENT_CONFLICT', 'La suma de cobros externos y locales excedería la tarifa histórica.');
    const delta = target - oldExternal;
    if (!delta) return { outcome: 'UNCHANGED' };
    const key = createHash('sha256').update([reg.id, reg.externalPlatform, reg.externalReference, 'EXTERNAL', target].join(':')).digest('hex');
    const existing = await tx.payment.findUnique({ where: { idempotencyKey: key } });
    if (existing) return { outcome: 'UNCHANGED' };
    await tx.payment.create({ data: { registrationId: reg.id, amount: money(delta), channel: 'EXTERNAL', idempotencyKey: key, externalReference: input.reference, externalMethod: input.method || null, sourceBatchId: input.batchId, receivedByUserId: null, recordedByUserId: input.actorId, notes: 'Pago informado por plataforma externa; no es cobro de caja EventGrid.' } });
    const balance = Math.max(0, price - nextPaid);
    await tx.registration.update({ where: { id: reg.id }, data: { amountPaid: money(nextPaid), totalAmount: money(nextPaid), balanceDue: money(balance), paymentStatus: balance === 0 && nextPaid > 0 ? 'PAID' : nextPaid > 0 ? 'PARTIAL' : 'PENDING', isVerified: nextPaid > 0, status: nextPaid >= price && price > 0 && reg.status === 'PENDING' ? 'CONFIRMED' : undefined } });
    await financeAudit(tx, input.actorId, input.eventId, reg.id, 'EXTERNAL_PAYMENT_RECONCILED', { before: { amountPaid: money(paid), externalPaid: money(oldExternal) }, after: { amountPaid: money(nextPaid), externalPaid: money(target) }, batchId: input.batchId, reference: input.reference, method: input.method, channel: 'EXTERNAL' });
    return { outcome: 'CREDITED', amount: money(delta) };
  }
  static async summary(eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, include: { settings: true } });
    if (!event) throw new NotFoundError('Edición no encontrada.');
    const rows = await prisma.registration.findMany({ where: { eventId, ...(event.settings?.demoModeEnabled ? {} : { isDemo: false }) }, include: { payments: true, refunds: true } });
    let confirmed = 0, external = 0, onsite = 0, legacy = 0, receivable = 0, expected = 0, refunded = 0, externalRefunds = 0, onsiteRefunds = 0, requested = 0, pendingReturn = 0, courtesyCount = 0, cancelledCount = 0, cancelledPaid = 0;
    for (const reg of rows) {
      const paid = cents(reg.amountPaid), price = cents(reg.ticketPrice);
      if (reg.status === 'CANCELLED') { cancelledCount++; cancelledPaid += paid; }
      if (reg.isCourtesy) courtesyCount++;
      else { confirmed += paid; if (reg.status !== 'CANCELLED') { expected += price; receivable += Math.max(0, price - paid); }
        let allocated = 0; for (const p of reg.payments) { const amount = cents(p.amount); allocated += amount; if (p.channel === 'EXTERNAL') external += amount; else if (p.channel === 'ONSITE') onsite += amount; else legacy += amount; }
        legacy += Math.max(0, paid - allocated);
      }
      for (const r of reg.refunds) {
        if (r.status === 'REFUNDED') { const amount = cents(r.refundedAmount); refunded += amount; if (r.channel === 'EXTERNAL') externalRefunds += amount; else if (r.channel === 'ONSITE') onsiteRefunds += amount; }
        else if (r.status === 'REQUESTED' || r.status === 'REVIEW') requested += cents(r.amount);
        else if (r.status === 'APPROVED' || r.status === 'PENDING_RETURN') pendingReturn += cents(r.approvedAmount);
      }
    }
    return { confirmedPayments: money(confirmed), externalPayments: money(external), onsitePayments: money(onsite), legacyUnattributed: money(legacy), receivable: money(receivable), expectedActive: money(expected), refunded: money(refunded), externalRefunds: money(externalRefunds), onsiteRefunds: money(onsiteRefunds), refundRequested: money(requested), refundPendingReturn: money(pendingReturn), netAccredited: money(confirmed - refunded), netOnsite: money(onsite - onsiteRefunds), netExternal: money(external - externalRefunds), courtesyCount, cancelledCount, cancelledPaid: money(cancelledPaid), netDefinition: 'Pagos acreditados de todos los orígenes menos devoluciones confirmadas; no representa exclusivamente caja EventGrid.' };
  }
  static async requestRefund(eventId: string, actorId: string, input: { paymentId: string; amount: number; reason: string; requestKey: string }) {
    return writeTransaction(async tx => {
      await this.admin(tx, actorId, eventId);
      const previous = await tx.refundRequest.findUnique({ where: { eventId_requestKey: { eventId, requestKey: input.requestKey } } });
      if (previous) { if (previous.paymentId !== input.paymentId || cents(previous.amount) !== cents(input.amount) || previous.reason !== input.reason) throw new ConflictError('La clave corresponde a otra solicitud.'); return previous; }
      const payment = await tx.payment.findFirst({ where: { id: input.paymentId, registration: { eventId } } });
      if (!payment) throw new NotFoundError('Pago fuera de la edición.');
      if (!cents(input.amount) || cents(input.amount) > cents(payment.amount)) throw new BadRequestError('El importe supera el pago original.');
      const refund = await tx.refundRequest.create({ data: { eventId, registrationId: payment.registrationId, paymentId: payment.id, requestKey: input.requestKey, amount: input.amount, channel: payment.channel, reason: input.reason, requestedByUserId: actorId } });
      await financeAudit(tx, actorId, eventId, payment.registrationId, 'REFUND_REQUESTED', { refundId: refund.id, amount: input.amount, channel: payment.channel, reason: input.reason }); return refund;
    });
  }
  static async transitionRefund(eventId: string, actorId: string, id: string, input: { status: string; version: number; amount?: number; reason: string; reference?: string; method?: string; confirmed?: boolean }) {
    return writeTransaction(async tx => {
      await this.admin(tx, actorId, eventId);
      const r = await tx.refundRequest.findFirst({ where: { id, eventId }, include: { payment: true } });
      if (!r) throw new NotFoundError('Solicitud no encontrada.');
      if (r.version !== input.version) throw new ConflictError('La solicitud cambió. Actualice el estado.');
      const allowed: Record<string, string[]> = { REQUESTED: ['REVIEW', 'APPROVED', 'REJECTED'], REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['PENDING_RETURN'], PENDING_RETURN: ['REFUNDED'] };
      if (!allowed[r.status]?.includes(input.status)) throw new BadRequestError('Transición de reembolso no permitida.');
      const approved = input.status === 'APPROVED' ? cents(input.amount ?? r.amount) : cents(r.approvedAmount);
      if (input.status === 'APPROVED' || input.status === 'REFUNDED') {
        const others = await tx.refundRequest.findMany({ where: { paymentId: r.paymentId, id: { not: id }, status: { in: ['APPROVED', 'PENDING_RETURN', 'REFUNDED'] } } });
        const reserved = others.reduce((n, x) => n + cents(x.status === 'REFUNDED' ? x.refundedAmount : x.approvedAmount), 0);
        if (!approved || approved > cents(r.amount) || reserved + approved > cents(r.payment.amount)) throw new BadRequestError('El reembolso supera el pago disponible, descontando otras devoluciones.');
      }
      if (input.status === 'REFUNDED' && (!input.confirmed || !input.reference?.trim() || !input.method?.trim() || !['EXTERNAL', 'ONSITE'].includes(r.channel))) throw new BadRequestError('Confirme la devolución efectivamente realizada, su método, referencia y procedencia.');
      if (input.status === 'REFUNDED') {
        const registration = await tx.registration.findUniqueOrThrow({ where: { id: r.registrationId } });
        if (!registration.attended && registration.status !== 'CANCELLED') throw new BadRequestError('Cancele la entrada antes de confirmar su devolución para impedir nuevos ingresos.');
      }
      const updated = await tx.refundRequest.update({ where: { id }, data: { status: input.status, approvedAmount: input.status === 'APPROVED' ? money(approved) : undefined, decisionReason: input.reason, decidedByUserId: actorId, version: { increment: 1 }, ...(input.status === 'REFUNDED' ? { refundedAmount: money(approved), refundedAt: new Date(), confirmedByUserId: actorId, reference: input.reference!.trim(), method: input.method!.trim() } : {}) } });
      await financeAudit(tx, actorId, eventId, r.registrationId, 'REFUND_' + input.status, { refundId: id, before: r.status, after: input.status, amount: money(approved), reason: input.reason, reference: input.reference }); return updated;
    });
  }
  static async cancel(tx: any, eventId: string, actorId: string, registrationId: string, reason: string, type = 'VOLUNTARY') {
    await this.admin(tx, actorId, eventId);
    const reg = await tx.registration.findFirst({ where: { id: registrationId, eventId } });
    if (!reg) throw new NotFoundError('Inscripción no encontrada.');
    if (reg.attended) throw new ConflictError('La asistencia ya está confirmada y no puede invalidarse mediante una cancelación ordinaria.');
    if (reg.status === 'CANCELLED') throw new ConflictError('La inscripción ya está cancelada.');
    const updated = await tx.registration.update({ where: { id: registrationId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actorId, cancellationReason: reason, cancellationType: type, updatedByUserId: actorId, notes: [reg.notes, '[CANCELACIÓN]: ' + reason].filter(Boolean).join('\n') }, include: { participant: true, ticketType: true } });
    await financeAudit(tx, actorId, eventId, registrationId, 'REGISTRATION_CANCELLED', { before: reg.status, after: 'CANCELLED', reason, type, amountPaidPreserved: Number(reg.amountPaid) }); return { ...updated, previousTshirtSize: reg.tshirtSize || null };
  }
  static async pending(eventId: string) {
    const rows = await prisma.registration.findMany({ where: { eventId, status: { not: 'CANCELLED' }, isCourtesy: false, balanceDue: { gt: 0 } }, include: { participant: true, refunds: true }, orderBy: { createdAt: 'asc' } });
    const requests = await prisma.courtesyRequest.findMany({ where: { eventId, status: 'PENDING' }, select: { registrationId: true } });
    const reviews = await prisma.financialReview.findMany({ where: { eventId, status: 'OPEN' }, select: { registrationId: true } });
    return rows.map(r => ({ ...r, exceptionPending: requests.some(x => x.registrationId === r.id), discrepancy: reviews.some(x => x.registrationId === r.id), requiresReview: r.attended || Number(r.amountPaid) > 0 || requests.some(x => x.registrationId === r.id) || reviews.some(x => x.registrationId === r.id) || r.refunds.some(x => x.status !== 'REJECTED') }));
  }
  static async previewNonpayment(eventId: string, actorId: string, ids: string[]) {
    await this.admin(prisma, actorId, eventId);
    const settings = await prisma.eventSettings.findUnique({ where: { eventId } });
    const rows = (await this.pending(eventId)).filter(r => ids.includes(r.id));
    const result = ids.map(id => { const r = rows.find(x => x.id === id); return { id, eligible: Boolean(r && !r.requiresReview && settings?.paymentDeadlineAt && settings.paymentDeadlineAt <= new Date()), reason: !r ? 'No es un pendiente vigente de esta edición' : r.requiresReview ? 'Requiere revisión de asistencia, abonos, excepción, discrepancia o reembolso' : !settings?.paymentDeadlineAt ? 'No hay fecha límite configurada' : settings.paymentDeadlineAt > new Date() ? 'El plazo aún no ha vencido' : 'Pendiente sin abonos, excepciones ni asistencia', version: r?.updatedAt.toISOString() }; });
    const payload = Buffer.from(JSON.stringify({ eventId, actorId, result, expires: Date.now() + 600000 })).toString('base64url');
    const signature = createHmac('sha256', ENV.JWT_SECRET).update(payload).digest('hex'); return { rows: result, token: payload + '.' + signature };
  }
  static async cancelNonpayment(eventId: string, actorId: string, token: string, reason: string) {
    const [payload, signature = ''] = token.split('.'); const expected = createHmac('sha256', ENV.JWT_SECRET).update(payload || '').digest('hex');
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new BadRequestError('Vista previa inválida.');
    let data: any; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new BadRequestError('Vista previa inválida.'); }
    if (data.eventId !== eventId || data.actorId !== actorId || data.expires < Date.now()) throw new BadRequestError('Vista previa vencida o de otra cuenta/edición.');
    return writeTransaction(async tx => {
      await this.admin(tx, actorId, eventId); const settings = await tx.eventSettings.findUnique({ where: { eventId } });
      if (!settings?.paymentDeadlineAt || settings.paymentDeadlineAt > new Date()) throw new ConflictError('El plazo de pago no está vencido.');
      const eligible = data.result.filter((r: any) => r.eligible); if (!eligible.length) throw new BadRequestError('No hay inscripciones elegibles.');
      const results = [];
      for (const item of eligible) {
        const r = await tx.registration.findFirst({ where: { id: item.id, eventId } });
        if (!r || r.updatedAt.toISOString() !== item.version || r.attended || r.isCourtesy || Number(r.amountPaid) > 0 || r.status === 'CANCELLED' || Number(r.balanceDue) <= 0 || await tx.courtesyRequest.findUnique({ where: { pendingRegistrationId: item.id } }) || await tx.financialReview.findFirst({ where: { eventId, registrationId: item.id, status: 'OPEN' } }) || await tx.refundRequest.findFirst({ where: { eventId, registrationId: item.id, status: { not: 'REJECTED' } } })) throw new ConflictError('Un estado cambió después de la vista previa. Revise nuevamente el lote.');
        results.push(await this.cancel(tx, eventId, actorId, item.id, reason, 'NONPAYMENT'));
      }
      return results;
    });
  }
}
