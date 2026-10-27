// Shared by recipient preview, individual dispatch and each final queue attempt.
type Recipient = { status: string; balanceDue?: unknown; amountPaid?: unknown; paymentStatus?: string; isCourtesy?: boolean; source?: string; ticketPrice?: unknown; cancellationType?: string | null; courtesyRequests?: { status: string }[]; refunds?: { status: string }[] };
export function recipientIneligibility(reg: Recipient, code = ''): string | null {
  const refundStates: Record<string,string[]> = { REFUND_REQUESTED_NOTICE: ['REQUESTED','REVIEW'], REFUND_APPROVED_NOTICE: ['APPROVED'], REFUND_PENDING_NOTICE: ['PENDING_RETURN'], REFUND_NOTICE: ['REFUNDED'] };
  if (refundStates[code]) return reg.refunds?.some(r => refundStates[code].includes(r.status)) ? null : 'No hay una solicitud en el estado de reembolso que esta plantilla describe.';
  if (['INSCRIPTION_CANCELLED', 'CANCELLATION', 'NONPAYMENT_CANCELLATION', 'VOLUNTARY_CANCELLATION'].includes(code)) {
    if (reg.status !== 'CANCELLED') return 'Esta plantilla requiere una inscripción cancelada.';
    if (code === 'NONPAYMENT_CANCELLATION' && reg.cancellationType !== 'NONPAYMENT') return 'La entrada no fue anulada por impago.';
    if (code === 'VOLUNTARY_CANCELLATION' && reg.cancellationType !== 'VOLUNTARY') return 'La entrada no tiene una cancelación voluntaria registrada.';
    return null;
  }
  if (reg.status === 'CANCELLED') return 'La inscripción está cancelada; solo admite avisos de cancelación o devolución.';
  if (['PENDING_BALANCE', 'PAYMENT_REMINDER'].includes(code) && (reg.isCourtesy || Number(reg.balanceDue) <= 0)) return 'La inscripción no tiene un saldo pendiente exigible.';
  if (code === 'DIGITAL_TICKET') {
    if (reg.status !== 'CONFIRMED' || reg.courtesyRequests?.some(r => r.status === 'PENDING')) return 'La entrada requiere confirmación o autorización administrativa antes de emitir el QR.';
    if (!reg.isCourtesy && (Number(reg.balanceDue) > 0 || reg.paymentStatus !== 'PAID' || Number(reg.amountPaid) <= 0)) return 'La entrada no tiene un pago completo confirmado.';
    if (reg.source === 'EXCEL_IMPORT' && !reg.isCourtesy && Number(reg.ticketPrice) <= 0) return 'La tarifa externa requiere conciliación administrativa.';
  }
  return null;
}
