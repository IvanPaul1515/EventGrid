import { executeReconciledImport } from './reconciliation-import.service.js';
import { officialTicket } from '../participants/registrationPolicy.js';
import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { ParticipantsService } from '../participants/participants.service.js';
import * as XLSX from 'xlsx';
import crypto from 'crypto';

// Diccionario de alias lingüísticos para detección automática de columnas históricas de BarCamp
const ALIAS_DICTIONARY: Record<string, string[]> = {
  externalPaymentStatus: ['estado de pago', 'estado pago', 'payment status'],
  externalPlatform: ['plataforma', 'origen', 'plataforma externa', 'plataforma de origen'],
  buyerName: ['comprador', 'nombre comprador'],
  externalReference: [
    'referencia externa',
    'no. registro', 'no registro', 'no.registro', 'no_registro', 'registro', 'no.', 'no',
    'ticket id', 'ticket no', 'ticket', 'id registro', 'id_registro', 'reg id', 'reg_id'
  ],
  firstName: [
    'nombres', 'nombre', 'primer nombre', 'primer_nombre', 'first name', 'first_name', 'name'
  ],
  lastName: [
    'apellidos', 'apellido', 'segundo nombre', 'last name', 'last_name', 'surname'
  ],
  fullName: [
    'nombres apellidos', 'nombres y apellidos', 'nombres_apellidos', 'nombre completo',
    'nombre_completo', 'full name', 'full_name'
  ],
  documentId: [
    'doc. identidad', 'doc identidad', 'doc_identidad', 'documento', 'cédula', 'cedula',
    'identificación', 'identificacion', 'pasaporte', 'id', 'cédula / pasaporte'
  ],
  organizationRnc: ['rnc', 'rnc empresa', 'rnc de empresa'],
  participantCategory: ['categoria', 'categoría', 'categoria participante', 'tipo participante'],
  waitlistFlag: ['lista de espera', 'en espera', 'waitlist'],
  paidFullIndicator: ['pago total', 'pago_total', 'pago completo', 'pagado completo'],
  email: [
    'email', 'e-mail', 'correo', 'correo electrónico', 'correo electronico', 'correo_electronico',
    'mail', 'e_mail'
  ],
  phone: [
    'teléfono', 'telefono', 'celular', 'tel', 'phone', 'móvil', 'movil', 'telefono principal'
  ],
  alternatePhone: [
    'tel alterno', 'tel. alterno', 'tel_alterno', 'teléfono alternativo', 'telefono alternativo',
    'tel 2', 'tel. 2', 'alt phone', 'segundo telefono'
  ],
  institution: [
    'institución', 'institucion', 'empresa', 'universidad', 'colegio', 'company',
    'organization', 'organización', 'organizacion', 'organizacion empresa', 'organización/empresa', 'centro educativo', 'lugar de trabajo', 'instituto'
  ],
  ticketType: [
    'tipo de entrada', 'tipo entrada', 'tipo_de_entrada', 'tipo_entrada', 'ticket type',
    'tipo ticket', 'tarifa'
  ],
  ticketPrice: [
    'precio entrada', 'precio de entrada', 'precio_entrada', 'valor ticket', 'costo entrada', 'tarifa entrada'
  ],
  amountPaid: [
    'monto pagado', 'monto_pagado', 'abonado', 'total abonado', 'pagado'
  ],
  paymentMethod: [
    'forma pago', 'forma de pago', 'forma_pago', 'método de pago', 'metodo de pago',
    'metodo pago', 'metodo_pago', 'payment method', 'tipo pago'
  ],
  totalAmount: [
    'total monetario', 'total', 'monto',
    'precio', 'amount', 'total pagado', 'valor'
  ],
  salesResponsible: [
    'responsable de venta', 'responsable venta', 'responsable_de_venta', 'responsable',
    'vendedor', 'cajero'
  ],
  saleTimestamp: [
    'horario de venta', 'horario venta', 'horario_de_venta', 'fecha de venta', 'fecha venta',
    'fecha_venta', 'fecha', 'hora', 'timestamp', 'date', 'hora venta'
  ],
  status: [
    'estado', 'status', 'confirmación', 'confirmacion', 'estado registro'
  ],
  isCourtesy: [
    'cortesía', 'cortesia', 'es cortesía', 'es cortesia', 'es_cortesia', 'beca'
  ],
  courtesyAuthorizedBy: [
    'autorizado por', 'cortesía autorizada por', 'autorizo cortesia', 'autorizado'
  ],
  attended: [
    'asistencia', 'asistió', 'asistio', 'check-in', 'check in', 'checkin',
    'llegada', 'llegó', 'llego', 'presente', 'entrada', 'asistente', 'asistio?'
  ],
  notes: [
    'notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'comentario'
  ],
};

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

export function parseMoney(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).replace(/[^\d.,-]/g, '').trim();
  if (!str) return 0;
  if (str.includes(',') && !str.includes('.')) {
    str = str.replace(',', '.');
  } else if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export function normalizeDocumentId(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10, 11)}`;

  }
  return str;
}

export function normalizePhone(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }
  return str;
}

export function parseExcelDate(val: any): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'number' && val > 20000 && val < 60000) {
    return new Date((val - 25569) * 86400 * 1000);
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val.trim());
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export class ImportService {
  /**
   * Paso 1 y 2: Analizar archivo Excel/CSV y detectar cabeceras automáticamente
   */
  static analyzeFile(base64Data: string, fileName: string, requestedSheet?: string, headerRowIndex?: number) {
    let buffer: Buffer;
    try {
      // Eliminar prefijo data:application/...;base64, si existe
      const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch {
      throw new BadRequestError('El contenido del archivo en base64 es inválido');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellText: true });
    } catch {
      throw new BadRequestError('No se pudo interpretar el archivo como una hoja de cálculo válida (.xlsx, .xls o .csv)');
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new BadRequestError('El archivo no contiene ninguna hoja de cálculo');
    }

    const sheetName = requestedSheet && workbook.SheetNames.includes(requestedSheet)
      ? requestedSheet
      : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestError(`La hoja '${sheetName}' no fue encontrada en el archivo`);
    }

    // Convertir a matriz bidimensional de celdas
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    if (!rawMatrix || rawMatrix.length === 0) {
      throw new BadRequestError('La hoja seleccionada está completamente vacía');
    }

    // Detectar fila de encabezados si no se especificó: buscar fila con más coincidencias de alias
    let detectedHeaderIdx = headerRowIndex !== undefined ? headerRowIndex : 0;
    if (headerRowIndex === undefined) {
      let maxMatches = -1;
      const rowsToScan = Math.min(rawMatrix.length, 10);

      for (let r = 0; r < rowsToScan; r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        let matches = 0;
        for (const cell of row) {
          if (typeof cell !== 'string' || !cell.trim()) continue;
          const norm = normalizeHeader(cell);
          for (const key of Object.keys(ALIAS_DICTIONARY)) {
            if (ALIAS_DICTIONARY[key].some(alias => normalizeHeader(alias) === norm)) {
              matches++;
              break;
            }
          }
        }

        if (matches > maxMatches && matches >= 2) {
          maxMatches = matches;
          detectedHeaderIdx = r;
        }
      }
    }

    const headerRow = rawMatrix[detectedHeaderIdx] || [];
    const usedHeaders = new Set<string>();
    const columns: string[] = headerRow.map((col, idx) => {
      const s = String(col).trim();
      const base = s !== '' ? s : `Columna_${idx + 1}`;
      let key = base, suffix = 2;
      while (usedHeaders.has(key)) key = `${base}_${suffix++}`;
      usedHeaders.add(key);
      return key;
    });

    // Asociación automática de columnas por alias
    const autoMapping: Record<string, string> = {};
    for (const col of columns) {
      const norm = normalizeHeader(col);
      for (const [targetField, aliases] of Object.entries(ALIAS_DICTIONARY)) {
        if (aliases.some(alias => normalizeHeader(alias) === norm)) {
          // Si encontramos match directo y el campo destino aún no está tomado
          if (!Object.values(autoMapping).includes(targetField)) {
            autoMapping[col] = targetField;
            break;
          }
        }
      }
    }

    // Extraer datos usando la fila de cabecera detectada
    const rawJsonRows = rawMatrix.slice(detectedHeaderIdx + 1).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])));
    const validRows = rawJsonRows.filter(row => {
      const values = Object.values(row).map(v => String(v).trim()).filter(Boolean);
      if (!values.length) return false;
      const hasEmail = values.some(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
      const footer = values.some(v => /^(total( de)? (participantes|registros|inscritos)|total general|subtotal)\b/i.test(normalizeHeader(v)));
      return hasEmail || !footer;
    });
    const columnProfiles = columns.map(column => ({ column, generatedHeader: /^Columna_\d+$/.test(column), nonempty: validRows.filter(row => String(row[column]).trim()).length }));
    for (const profile of columnProfiles) if (!profile.nonempty) autoMapping[profile.column] = 'IGNORE';

    return {
      fileName,
      sheets: workbook.SheetNames,
      selectedSheet: sheetName,
      headerRowIndex: detectedHeaderIdx,
      columns,
      autoMapping,
      columnProfiles,
      ignoredRows: rawJsonRows.length - validRows.length,
      totalRows: validRows.length,
      previewRows: validRows.slice(0, 10),
      rows: validRows,
    };
  }

  /**
   * Paso 4: Validar datos, detectar duplicados y verificar formas de pago
   */
  static async validateRows(eventId: string, rows: any[], columnMapping: Record<string, string>, batchDefaults: Record<string, string> = {}) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        paymentMethods: true,
        ticketTypes: true,
        registrations: {
          include: { participant: true },
        },
      },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    // Mapear pagos existentes para normalización
    const existingPaymentMethods = event.paymentMethods.map((pm) => pm.name.toLowerCase().trim());

    // Índices de participantes existentes en esta edición
    const existingEmailsInDb = new Set<string>();
    const existingDocsInDb = new Set<string>();
    const existingRegNumbersInDb = new Set<string>();

    for (const r of event.registrations) {
      if (r.participant.email) existingEmailsInDb.add(r.participant.email.toLowerCase().trim());
      if (r.participant.documentId) existingDocsInDb.add(r.participant.documentId.trim());
      if (r.registrationNumber) existingRegNumbersInDb.add(r.registrationNumber.trim());
    }

    // Índices en el propio archivo para detectar duplicados internos
    const seenEmailsInFile = new Map<string, number>();
    const seenDocsInFile = new Map<string, number>();
    const seenExternal = new Set<string>();

    const rowsSummary: Array<{
      rowNumber: number;
      raw: Record<string, any>;
      normalized: Record<string, any>;
      status: 'VALID' | 'DUPLICATE' | 'ERROR';
      errors: string[];
      isDuplicateInDb: boolean;
      existingTicket?: string;
    }> = [];

    let validCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const rowNum = i + 1;
      const normalized: Record<string, any> = {};
      const errors: string[] = [];
      let isDuplicateInDb = false;
      let existingTicket: string | undefined = undefined;

      // Aplicar mapeo
      for (const [colName, targetField] of Object.entries(columnMapping)) {
        if (!targetField || targetField === 'IGNORE') continue;
        const val = rawRow[colName];
        normalized[targetField] = val !== undefined && val !== null ? String(val).trim() : '';
      }

      // Si tenemos fullName pero falta firstName/lastName, dividir nombres
      if (normalized.fullName && (!normalized.firstName || !normalized.lastName)) {
        const parts = normalized.fullName.split(/\s+/);
        if (parts.length >= 2) {
          normalized.firstName = normalized.firstName || parts[0];
          normalized.lastName = normalized.lastName || parts.slice(1).join(' ');
        } else {
          normalized.firstName = normalized.firstName || normalized.fullName;
          normalized.lastName = normalized.lastName || '—';
        }
      }
      if (!normalized.fullName && (normalized.firstName || normalized.lastName)) {
        normalized.fullName = `${normalized.firstName || ''} ${normalized.lastName || ''}`.trim();
      }

      // Normalizar identificaciones y teléfonos preservando ceros a la izquierda
      if (normalized.documentId) {
        normalized.documentId = normalizeDocumentId(normalized.documentId) || normalized.documentId;
      }
      if (normalized.phone) {
        normalized.phone = normalizePhone(normalized.phone) || normalized.phone;
      }
      if (normalized.alternatePhone) {
        normalized.alternatePhone = normalizePhone(normalized.alternatePhone) || normalized.alternatePhone;
      }

      for (const [field, value] of Object.entries(batchDefaults)) if (!normalized[field]) normalized[field] = value;
      // Old mapping clients are accepted, but their source number is never an internal number.
      normalized.externalReference = String(normalized.externalReference || normalized.registrationNumber || '').trim() || null;
      normalized.externalPlatform = String(normalized.externalPlatform || 'Excel').trim();
      const externalKey = normalized.externalReference ? normalized.externalPlatform + ':' + normalized.externalReference : null;
      if (externalKey) {
        if (seenExternal.has(externalKey)) errors.push('Referencia externa repetida en este archivo');
        seenExternal.add(externalKey);
        const duplicate = event.registrations.find(r => r.externalPlatform === normalized.externalPlatform && r.externalReference === normalized.externalReference);
        if (duplicate) { isDuplicateInDb = true; existingTicket = duplicate.registrationNumber; }
      }

      // 1. Validar campos obligatorios mínimos
      if (!normalized.firstName) {
        errors.push('Falta el nombre del participante');
      }
      if (!normalized.email) {
        errors.push('Falta el correo electrónico');
      } else {
        const emailLower = normalized.email.toLowerCase();
        normalized.email = emailLower;
        // Validación básica de formato de correo
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailLower)) {
          errors.push(`Correo electrónico inválido: '${normalized.email}'`);
        }
      }

      const yesNo = (value: unknown) => ['si','yes','true','1'].includes(normalizeHeader(String(value ?? ''))) ? 'YES' : ['no','false','0'].includes(normalizeHeader(String(value ?? ''))) ? 'NO' : 'UNKNOWN';
      normalized.paidFullIndicator = yesNo(normalized.paidFullIndicator);
      normalized.waitlistState = yesNo(normalized.waitlistFlag);
      for (const key of ['totalAmount','ticketPrice','amountPaid']) {
        const original = normalized[key];
        normalized[key + 'Provided'] = original !== undefined && String(original).trim() !== '';
        if (normalized[key + 'Provided'] && (/[a-záéíóú]/i.test(String(original).replace(/RD|DOP/gi,'')) || !/[0-9]/.test(String(original)))) errors.push('La columna monetaria ' + key + ' no contiene un importe. Use el indicador Pago Total para SÍ/NO.');
        normalized[key] = parseMoney(original);
        if (normalized[key] < 0 || !Number.isFinite(normalized[key]) || Math.abs(normalized[key]*100-Math.round(normalized[key]*100))>0.00001) errors.push('Importe inválido en ' + key);
      }

      // 3. Reglas de Cortesía
      let isCourtesy = false;
      const pmStr = normalized.paymentMethod ? String(normalized.paymentMethod).toLowerCase() : '';
      if (pmStr.includes('cortes') || normalized.isCourtesy === 'SÍ' || normalized.isCourtesy === 'SI' || normalized.isCourtesy === 'true' || normalized.isCourtesy === '1') {
        isCourtesy = true;
        normalized.totalAmount = 0.0;
        normalized.ticketPrice = 0.0;
        normalized.amountPaid = 0.0;
        normalized.isCourtesy = true;
      }
      normalized.isCourtesy = isCourtesy;

      // 4. Asistencia y Estado de confirmación
      let isAttendedFromFile = false;
      if (normalized.attended) {
        const attStr = String(normalized.attended).toLowerCase().trim();
        isAttendedFromFile = ['sí', 'si', 'true', '1', 'presente', 'asistió', 'asistio', 'yes', 'y'].includes(attStr);
      }
      if (normalized.status === 'ATTENDED') {
        normalized.status = 'CONFIRMED';
        isAttendedFromFile = true;
      } else if (!normalized.status || !['CONFIRMED', 'PENDING', 'CANCELLED'].includes(normalized.status)) {
        normalized.status = 'PENDING';
      }
      normalized.attended = isAttendedFromFile;
      if (isAttendedFromFile) errors.push('La asistencia no puede importarse: confirme el ingreso mediante check-in.');

      // 5. Detección de duplicados internos dentro de este mismo Excel

      if (normalized.documentId) {
        const docTrim = normalized.documentId.trim();
        if (seenDocsInFile.has(docTrim)) {
          errors.push(`Documento de identidad repetido en la fila ${seenDocsInFile.get(docTrim)} de este mismo archivo`);
        } else {
          seenDocsInFile.set(docTrim, rowNum);
        }
      }

      const documentKey = (value: string) => String(value || '').toUpperCase().replace(/[\s-]/g, '');
      const byReference = normalized.externalReference ? event.registrations.find(r => r.externalReference === normalized.externalReference && r.externalPlatform === normalized.externalPlatform) : undefined;
      const documentMatches = normalized.documentId ? event.registrations.filter(r => documentKey(r.participant.documentId || '') === documentKey(normalized.documentId)) : [];
      const matched = byReference || (documentMatches.length === 1 ? documentMatches[0] : undefined);
      if (matched) {
        isDuplicateInDb = true; existingTicket = matched.registrationNumber; normalized.existingRegistrationId = matched.id;
        const documentConflict = byReference && normalized.documentId && matched.participant.documentId && documentKey(normalized.documentId) !== documentKey(matched.participant.documentId);
        const referenceConflict = !byReference && normalized.externalReference && matched.externalReference && (matched.externalReference !== normalized.externalReference || matched.externalPlatform !== normalized.externalPlatform);
        normalized.identityConflict = Boolean(documentConflict || referenceConflict || documentMatches.length > 1);
        normalized.reconciliation = normalized.identityConflict ? 'IDENTITY_CONFLICT' : matched.paymentFullReported === 'YES' && normalized.paidFullIndicator === 'NO' ? 'PAID_TO_UNPAID' : normalized.paidFullIndicator === 'YES' && matched.paymentStatus !== 'PAID' ? 'UNPAID_TO_PAID' : 'EXISTING';
        normalized.personalChanges = ['firstName','lastName','email','phone','institution'].filter(key => normalized[key] && normalized[key] !== (matched.participant as any)[key]);
        normalized.methodChanged = Boolean(normalized.paymentMethod && matched.externalPaymentMethod && normalized.paymentMethod !== matched.externalPaymentMethod);
      } else if (normalized.email && event.registrations.some(r => r.participant.email.toLowerCase() === normalized.email && !normalized.documentId && !normalized.externalReference)) {
        normalized.identityConflict = true; normalized.reconciliation = 'IDENTITY_CONFLICT';
      } else normalized.reconciliation = 'NEW';

      const paidTickets = event.ticketTypes.filter(t => t.isActive && Number(t.price) > 0);
      const approvedTicket = batchDefaults.tariffApproved === 'true' ? paidTickets.find(t => t.id === batchDefaults.ticketTypeId) : undefined;
      const namedTicket = normalized.ticketType ? paidTickets.find(t => t.name.toLowerCase() === String(normalized.ticketType).toLowerCase()) : undefined;
      const applicablePrice = matched ? Number(matched.ticketPrice) : normalized.ticketPriceProvided ? normalized.ticketPrice : Number((approvedTicket || namedTicket || (paidTickets.length === 1 ? paidTickets[0] : undefined))?.price || 0);
      normalized.applicableTicketPrice = applicablePrice;
      normalized.tariffNeedsReview = !matched && applicablePrice <= 0;
      normalized.forecastExternalPaid = normalized.paidFullIndicator === 'YES' && applicablePrice > 0 ? applicablePrice : null;

      // Clasificación de estado de fila
      let rowStatus: 'VALID' | 'DUPLICATE' | 'ERROR' = 'VALID';
      if (errors.length > 0) {
        rowStatus = 'ERROR';
        errorCount++;
      } else if (isDuplicateInDb) {
        rowStatus = 'DUPLICATE';
        duplicateCount++;
      } else {
        validCount++;
      }

      rowsSummary.push({
        rowNumber: rowNum,
        raw: rawRow,
        normalized,
        status: rowStatus,
        errors,
        isDuplicateInDb,
        existingTicket,
      });
    }

    return {
      totalRows: rows.length,
      validRows: validCount,
      duplicateRows: duplicateCount,
      errorRows: errorCount,
      rowsSummary,
      reconciliation: {
        newRecords: rowsSummary.filter(r => r.normalized.reconciliation === 'NEW').length,
        paidTransitions: rowsSummary.filter(r => r.normalized.reconciliation === 'UNPAID_TO_PAID').length,
        discrepancies: rowsSummary.filter(r => r.normalized.identityConflict || r.normalized.reconciliation === 'PAID_TO_UNPAID' || r.normalized.methodChanged).length,
        absentRecords: event.registrations.filter(r => r.source === 'EXCEL_IMPORT' && rowsSummary.some(row => row.normalized.externalPlatform === r.externalPlatform) && !rowsSummary.some(row => row.normalized.existingRegistrationId === r.id || (row.normalized.externalReference === r.externalReference && row.normalized.externalPlatform === r.externalPlatform))).map(r => ({ id: r.id, registrationNumber: r.registrationNumber, action: 'PRESERVED' })),
      },
    };
  }

  /**
   * Paso 6: Ejecutar la importación por lotes de forma transaccional en PostgreSQL
   */
  static async executeImport(
    eventId: string,
    userId: string,
    fileName: string,
    fileSize: number,
    rows: any[],
    columnMapping: Record<string, string>,
    conflictStrategy: 'SKIP' | 'UPDATE' | 'ONLY_NEW' = 'SKIP',
    batchDefaults: Record<string, string> = {}
  ) {
    const validation = await this.validateRows(eventId, rows, columnMapping, batchDefaults);
    if (validation.rowsSummary.some(row => row.normalized?.isCourtesy)) throw new BadRequestError('Las cortesías requieren aprobación administrativa individual.');
    return executeReconciledImport({ eventId, userId, fileName, fileSize, rows, columnMapping, conflictStrategy, batchDefaults, validation });
  }

  /**
   * Obtener historial de lotes de importación de una edición
   */
  static async getBatches(eventId: string) {
    const batches = await prisma.importBatch.findMany({
      where: { eventId },
      include: {
        importedByUser: {
          select: { id: true, fullName: true, email: true },
        },
        _count: {
          select: { errors: true, registrations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches;
  }

  /**
   * Eliminar un lote de importación específico y todas sus inscripciones asociadas
   */
  static async deleteBatch(batchId: string, eventId?: string) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundError('Lote de importación no encontrado');
    }
    if (eventId && batch.eventId !== eventId) {
      throw new BadRequestError('El lote no corresponde a la edición activa');
    }

    const res = await ParticipantsService.deleteImported(batch.eventId, batchId);
    return {
      batchId,
      fileName: batch.fileName,
      deletedRegistrationsCount: res.deletedRegistrationsCount,
      deletedParticipantsCount: res.deletedParticipantsCount,
      deletedPaymentsCount: res.deletedPaymentsCount,
      deletedAttendanceCount: res.deletedAttendanceCount,
      deletedEmailsCount: 0,
    };
  }

  /**
   * Eliminar todas las importaciones de Excel y registros asociados de la edición
   */
  static async deleteAllImported(eventId: string) {
    const batchesCount = await prisma.importBatch.count({ where: { eventId } });
    const res = await ParticipantsService.deleteImported(eventId);
    return {
      deletedBatchesCount: batchesCount,
      deletedRegistrationsCount: res.deletedRegistrationsCount,
      deletedParticipantsCount: res.deletedParticipantsCount,
      deletedPaymentsCount: res.deletedPaymentsCount,
      deletedAttendanceCount: res.deletedAttendanceCount,
      deletedEmailsCount: 0,
    };
  }

  /**
   * Descargar reporte de errores de un lote
   */
  static async getBatchErrorReport(batchId: string) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { errors: true },
    });
    if (!batch) throw new NotFoundError('Lote de importación no encontrado');

    const rows = batch.errors.map((e) => ({
      'Fila': e.rowNumber,
      'Campo con Inconsistencia': e.fieldName || 'General',
      'Mensaje de Error': e.errorMessage,
      'Datos Crudos': typeof e.rawRowData === 'string' ? e.rawRowData : JSON.stringify(e.rawRowData || {}),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Errores de Carga');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer,
      filename: `Reporte_Errores_${batch.fileName.replace(/\.[^/.]+$/, '')}_${batch.id.slice(0, 8)}.xlsx`,
    };
  }
}
