import { stockSummary } from '../merch/merch.rules.js';

export interface StatisticsFilters {
  from?: string; to?: string; ticketTypeId?: string; size?: string; timezone?: string;
  delivery?: 'DELIVERED' | 'PENDING' | 'NOT_DELIVERED';
}
export interface StatisticsRegistration {
  id: string; eventId: string; status: string; paymentStatus: string; isCourtesy: boolean;
  ticketTypeId: string | null; ticketType?: {name: string} | null;
  ticketPrice: unknown; amountPaid: unknown; balanceDue: unknown;
  source: string; historicalDates: string | null; externalReference: string | null;
  createdAt: Date; attended: boolean; attendedAt: Date | null; qrRevokedAt: Date | null;
  tshirtSize: string | null; tshirtDelivered: boolean; tshirtDeliveryStatus: string | null;
  tshirtNonDeliveryReason: string | null;
}
export interface ShirtAudit { entityId: string | null; changes: unknown; createdAt: Date; }
export const REASONS = {
  SIZE_UNAVAILABLE: 'Talla solicitada agotada', DECLINED: 'El participante no quiso camiseta',
  OTHER: 'Otro motivo', LEGACY_UNKNOWN: 'Sin motivo registrado', PENDING: 'Entrega pendiente',
} as const;
export type Reason = keyof typeof REASONS;
export const statisticsAllowed = (user?: {role: string; scannerOnly?: boolean}) => user?.role === 'ADMIN' && !user.scannerOnly;
export function day(value: Date | string, timezone = 'America/Santo_Domingo'): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(value));
}
export function inDates(value: Date | string | null | undefined, filters: StatisticsFilters) {
  if (!filters.from && !filters.to) return true;
  if (!value || !Number.isFinite(new Date(value).getTime())) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : day(value,filters.timezone);
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
}
export function reasonFor(row: Pick<StatisticsRegistration, 'tshirtNonDeliveryReason' | 'tshirtDeliveryStatus'>): Reason {
  if (row.tshirtNonDeliveryReason === 'Talla solicitada agotada') return 'SIZE_UNAVAILABLE';
  if (row.tshirtNonDeliveryReason === 'El participante no desea camiseta') return 'DECLINED';
  if (row.tshirtNonDeliveryReason === 'Otro motivo') return 'OTHER';
  if (row.tshirtNonDeliveryReason === 'Entrega pendiente' || !row.tshirtNonDeliveryReason && row.tshirtDeliveryStatus === 'PENDING') return 'PENDING';
  return 'LEGACY_UNKNOWN';
}
export function shirtHistory(audits: ShirtAudit[]) {
  const result = new Map<string, {requested: string | null; selected: string | null}>();
  for (const audit of [...audits].sort((a,b) => +new Date(a.createdAt) - +new Date(b.createdAt))) {
    if (!audit.entityId) continue;
    if (result.has(audit.entityId)) continue;
    try {
      const changes = typeof audit.changes === 'string' ? JSON.parse(audit.changes) : audit.changes;
      if (!changes || changes.result !== 'SUCCESS' || changes.action !== 'CHECK_IN') continue;
      result.set(audit.entityId, {requested: typeof changes.requestedTshirtSize === 'string' ? changes.requestedTshirtSize : null,
        selected: typeof changes.finalTshirtSize === 'string' ? changes.finalTshirtSize : null});
    } catch { /* Historical malformed audits remain unknown; never infer the original size. */ }
  }
  return result;
}
export function purchaseDate(row: StatisticsRegistration, timezone?:string): string | null {
  try {
    const date = JSON.parse(row.historicalDates || '{}').purchasedAt;
    const trusted = date?.source === 'ADMIN_REVIEWED' || date?.source === 'EVENTGRID_SERVER' && row.source === 'ONSITE_SALE' ||
      row.source === 'EXCEL_IMPORT' && !!row.externalReference && !!date?.source && date.source !== 'DECLARED';
    if (!trusted || !['DATE','SECOND'].includes(date.precision)) return null;
    if (date.precision === 'DATE') return /^\d{4}-\d{2}-\d{2}$/.test(date.value) && Number.isFinite(Date.parse(date.value)) ? date.value : null;
    return date.zone && Number.isFinite(Date.parse(date.value)) ? day(date.value,timezone) : null;
  } catch { return null; }
}
export function relevantRows(rows: StatisticsRegistration[], eventId: string, filters: StatisticsFilters) {
  return rows.filter(row => row.eventId === eventId && (!filters.ticketTypeId || row.ticketTypeId === filters.ticketTypeId));
}
export function shirtRows(rows: StatisticsRegistration[], filters: StatisticsFilters) {
  return rows.filter(row => row.status !== 'CANCELLED' && row.attended && inDates(row.attendedAt, filters) &&
    (!filters.size || row.tshirtSize === filters.size) && (!filters.delivery ||
      (row.tshirtDelivered ? 'DELIVERED' : row.tshirtDeliveryStatus === 'NOT_DELIVERED' ? 'NOT_DELIVERED' : 'PENDING') === filters.delivery));
}
function groups(rows: {name: string; value: number}[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.name, (map.get(row.name) || 0) + row.value);
  return [...map].map(([name,value]) => ({name,value})).sort((a,b) => a.name.localeCompare(b.name));
}
export function aggregateStatistics(eventId: string, registrations: StatisticsRegistration[], inventory: {
  id: string; size: string; initialQuantity: number; deliveredQuantity: number; staffReservedQuantity: number; staffDeliveredQuantity: number;
}[], audits: ShirtAudit[], caps: {name: string; criterion: string; initialQuantity: number; participantQuota: number; staffQuota: number;
  movements: {kind: string; quantity: number}[]; allocations: {kind: string; status: string}[];
}[], filters: StatisticsFilters = {}) {
  const all = relevantRows(registrations, eventId, {}), scoped = relevantRows(all, eventId, filters);
  const cohort = scoped.filter(row => inDates(row.createdAt, filters)), valid = cohort.filter(row => row.status !== 'CANCELLED');
  const shirts = shirtRows(scoped, filters), history = shirtHistory(audits);
  const sizes = new Set([...inventory.map(row => row.size), ...shirts.map(row => row.tshirtSize).filter((size): size is string => !!size)]);
  for (const row of shirts) { const original = history.get(row.id)?.requested; if (original) sizes.add(original); }
  const shirtStock = inventory.filter(row => !filters.size || row.size === filters.size).map(row => {
    const participantDelivered = all.filter(reg => reg.tshirtDelivered && reg.tshirtSize === row.size).length;
    const delivered = participantDelivered + row.staffDeliveredQuantity;
    const staffReserved = row.staffReservedQuantity - row.staffDeliveredQuantity;
    return {name: row.size, total: row.initialQuantity, delivered, available: row.initialQuantity - delivered,
      participantAvailable: row.initialQuantity - participantDelivered - row.staffReservedQuantity,
      staffReserved, pending: all.filter(reg => reg.status !== 'CANCELLED' && reg.attended && !reg.tshirtDelivered && reg.tshirtDeliveryStatus !== 'NOT_DELIVERED' && reg.tshirtSize === row.size).length,
      discrepancy: participantDelivered !== row.deliveredQuantity || staffReserved < 0 || row.initialQuantity < delivered};
  });
  const totals = shirtStock.reduce((sum,row) => ({total: sum.total + row.total, delivered: sum.delivered + row.delivered,
    available: sum.available + row.available, staffReserved: sum.staffReserved + row.staffReserved}), {total:0,delivered:0,available:0,staffReserved:0});
  const notDelivered = shirts.filter(row => !row.tshirtDelivered);
  const reasons = (Object.keys(REASONS) as Reason[]).map(key => ({key,name:REASONS[key],value:notDelivered.filter(row => reasonFor(row) === key).length}));
  const sizeComparison = [...sizes].filter(size => !filters.size || size === filters.size).map(size => ({name:size,
    requested: shirts.filter(row => history.get(row.id)?.requested === size).length,
    delivered: shirts.filter(row => row.tshirtDelivered && row.tshirtSize === size).length}));
  const sold = scoped.filter(row => row.status !== 'CANCELLED' && !row.isCourtesy && Number(row.ticketPrice) > 0 && Number(row.amountPaid) > 0);
  const purchases = sold.map(row => ({row,date:purchaseDate(row,filters.timezone)}));
  const attendance = scoped.filter(row => row.status !== 'CANCELLED' && row.attended && inDates(row.attendedAt, filters));
  return {
    eventId, timezone:filters.timezone||'America/Santo_Domingo',availableSizes:[...sizes],
    participants: {registered:cohort.length,confirmed:valid.filter(row => row.status === 'CONFIRMED').length,
      valid:valid.filter(row => !row.qrRevokedAt).length,attended:valid.filter(row => row.attended).length,
      absent:valid.filter(row => !row.attended).length,cancelled:cohort.length-valid.length},
    shirts: {...totals, stock:shirtStock, reasons, sizeComparison,
      notDelivered:notDelivered.length, pending:notDelivered.filter(row => row.tshirtDeliveryStatus !== 'NOT_DELIVERED').length,
      unknownRequested:shirts.filter(row => !history.get(row.id)?.requested).length,
      changes:shirts.filter(row => row.tshirtDelivered && !!history.get(row.id)?.requested && history.get(row.id)?.requested !== row.tshirtSize).length},
    caps:caps.map(item => ({name:item.name,criterion:item.criterion,...stockSummary(item.initialQuantity,item.movements),
      groups: (['PARTICIPANT','STAFF'] as const).map(kind => {
        const quota = kind === 'PARTICIPANT' ? item.participantQuota : item.staffQuota;
        const delivered = item.allocations.filter(row => row.kind === kind && row.status === 'DELIVERED').length;
        const pending = item.allocations.filter(row => row.kind === kind && row.status === 'RESERVED').length;
        return {name:kind === 'PARTICIPANT' ? 'Participantes' : 'Staff',quota,assigned:delivered+pending,delivered,pending,available:quota-delivered-pending};
      })})),
    attendanceHours:groups(attendance.filter(row => row.attendedAt).map(row => ({name: `${day(row.attendedAt!,filters.timezone)} ${new Intl.DateTimeFormat('es-DO',{timeZone:filters.timezone||'America/Santo_Domingo',hour:'2-digit',hourCycle:'h23'}).format(row.attendedAt!)}:00`,value:1}))),
    unknownAttendanceTime:attendance.filter(row => !row.attendedAt).length,
    registrationsByDay:groups(cohort.map(row => ({name:day(row.createdAt,filters.timezone),value:1}))),
    sales:{sold:sold.filter(row => inDates(purchaseDate(row,filters.timezone),filters)).length,
      courtesy:valid.filter(row => row.isCourtesy).length,pendingAmount:valid.reduce((sum,row) => sum+Number(row.balanceDue),0),
      recordedPaid:valid.reduce((sum,row) => sum+Number(row.amountPaid),0),
      tickets:groups(purchases.filter(p => inDates(p.date,filters)).map(({row}) => ({name:row.ticketType?.name || 'Sin tipo registrado',value:1}))),
      statuses:groups(valid.map(row => ({name:row.paymentStatus,value:1}))),
      purchasesByDay:groups(purchases.filter(p => p.date && inDates(p.date,filters)).map(p => ({name:p.date!,value:1}))),
      unverifiedPurchases:purchases.filter(p => !p.date).length},
  };
}
