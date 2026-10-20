import { prisma } from '../../config/db.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import * as XLSX from 'xlsx';

// Diccionario de alias lingüísticos para detección automática de columnas históricas de BarCamp
const ALIAS_DICTIONARY: Record<string, string[]> = {
  registrationNumber: [
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
    'identificación', 'identificacion', 'pasaporte', 'id', 'rnc', 'cédula / pasaporte'
  ],
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
    'organization', 'organización', 'organizacion', 'centro educativo', 'lugar de trabajo', 'instituto'
  ],
  ticketType: [
    'tipo de entrada', 'tipo entrada', 'tipo_de_entrada', 'tipo_entrada', 'ticket type',
    'tipo ticket', 'tarifa', 'categoría', 'categoria'
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
    'pago total', 'pago_total', 'total', 'monto', 'monto pagado', 'monto_pagado',
    'precio', 'amount', 'total pagado', 'valor'
  ],
  salesResponsible: [
    'responsable de venta', 'responsable venta', 'responsable_de_venta', 'responsable',
    'vendedor', 'cajero', 'registrado por', 'creado por'
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
  notes: [
    'notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'comentario'
  ],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');
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
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
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
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
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
            if (ALIAS_DICTIONARY[key].includes(norm)) {
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
    const columns: string[] = headerRow.map((col, idx) => {
      const s = String(col).trim();
      return s !== '' ? s : `Columna_${idx + 1}`;
    });

    // Asociación automática de columnas por alias
    const autoMapping: Record<string, string> = {};
    for (const col of columns) {
      const norm = normalizeHeader(col);
      for (const [targetField, aliases] of Object.entries(ALIAS_DICTIONARY)) {
        if (aliases.includes(norm)) {
          // Si encontramos match directo y el campo destino aún no está tomado
          if (!Object.values(autoMapping).includes(targetField)) {
            autoMapping[col] = targetField;
            break;
          }
        }
      }
    }

    // Extraer datos usando la fila de cabecera detectada
    const rawJsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
      range: detectedHeaderIdx,
      defval: '',
      blankrows: false,
    });

    // Filtrar filas completamente vacías
    const validRows = rawJsonRows.filter((r) => {
      const values = Object.values(r).map((v) => String(v).trim()).filter((v) => v !== '');
      return values.length > 0;
    });

    return {
      fileName,
      sheets: workbook.SheetNames,
      selectedSheet: sheetName,
      headerRowIndex: detectedHeaderIdx,
      columns,
      autoMapping,
      totalRows: validRows.length,
      previewRows: validRows.slice(0, 10),
      rows: validRows,
    };
  }

  /**
   * Paso 4: Validar datos, detectar duplicados y verificar formas de pago
   */
  static async validateRows(eventId: string, rows: any[], columnMapping: Record<string, string>) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        paymentMethods: true,
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

      // 2. Normalizar monto
      let amount = 0;
      if (normalized.totalAmount) {
        const cleanAmount = String(normalized.totalAmount)
          .replace(/[RD$$,\s]/gi, '')
          .trim();
        const parsedAmt = parseFloat(cleanAmount);
        if (isNaN(parsedAmt) || parsedAmt < 0) {
          errors.push(`Monto inválido: '${normalized.totalAmount}'`);
        } else {
          amount = parsedAmt;
        }
      }
      normalized.totalAmount = amount;

      // 3. Reglas de Cortesía
      let isCourtesy = false;
      const pmStr = normalized.paymentMethod ? String(normalized.paymentMethod).toLowerCase() : '';
      if (pmStr.includes('cortes') || normalized.isCourtesy === 'SÍ' || normalized.isCourtesy === 'true' || normalized.isCourtesy === '1') {
        isCourtesy = true;
        normalized.totalAmount = 0.0;
        normalized.isCourtesy = true;
      }
      normalized.isCourtesy = isCourtesy;

      // 4. Estado de confirmación por defecto: PENDING si no viene en el archivo
      let isAttendedFromFile = false;
      if (normalized.status === 'ATTENDED') {
        normalized.status = 'CONFIRMED';
        isAttendedFromFile = true;
      } else if (!normalized.status || !['CONFIRMED', 'PENDING', 'CANCELLED'].includes(normalized.status)) {
        normalized.status = 'PENDING';
      }

      // 5. Detección de duplicados internos dentro de este mismo Excel
      if (normalized.email) {
        if (seenEmailsInFile.has(normalized.email)) {
          errors.push(`Correo repetido en la fila ${seenEmailsInFile.get(normalized.email)} de este mismo archivo`);
        } else {
          seenEmailsInFile.set(normalized.email, rowNum);
        }
      }

      if (normalized.documentId) {
        const docTrim = normalized.documentId.trim();
        if (seenDocsInFile.has(docTrim)) {
          errors.push(`Documento de identidad repetido en la fila ${seenDocsInFile.get(docTrim)} de este mismo archivo`);
        } else {
          seenDocsInFile.set(docTrim, rowNum);
        }
      }

      // 6. Detección de duplicados contra la base de datos de ESTA edición
      if (normalized.email && existingEmailsInDb.has(normalized.email)) {
        isDuplicateInDb = true;
        const reg = event.registrations.find((r) => r.participant.email?.toLowerCase() === normalized.email);
        existingTicket = reg?.registrationNumber;
      } else if (normalized.documentId && existingDocsInDb.has(normalized.documentId.trim())) {
        isDuplicateInDb = true;
        const reg = event.registrations.find((r) => r.participant.documentId === normalized.documentId.trim());
        existingTicket = reg?.registrationNumber;
      } else if (normalized.registrationNumber && existingRegNumbersInDb.has(normalized.registrationNumber.trim())) {
        isDuplicateInDb = true;
        existingTicket = normalized.registrationNumber.trim();
      }

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
    conflictStrategy: 'SKIP' | 'UPDATE' | 'ONLY_NEW' = 'SKIP'
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        settings: true,
        paymentMethods: true,
        salesResponsibles: true,
        ticketTypes: true,
      },
    });
    if (!event) throw new NotFoundError('Edición no encontrada');

    // 1. Validar filas antes de escribir
    const validation = await this.validateRows(eventId, rows, columnMapping);

    // 2. Crear lote de importación (ImportBatch)
    const batch = await prisma.importBatch.create({
      data: {
        eventId,
        importedByUserId: userId,
        fileName,
        fileSize,
        totalRows: rows.length,
        validRows: validation.validRows,
        importedRows: 0,
        updatedRows: 0,
        skippedRows: 0,
        errorRows: validation.errorRows,
        mappingConfig: JSON.stringify(columnMapping),
      },
    });

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errorsToRecord: Array<{ rowNumber: number; fieldName: string; errorMessage: string; rawRowData: any }> = [];

    // Catálogo en memoria de métodos de pago y responsables para evitar consultas repetitivas
    const paymentMethodsMap = new Map<string, string>();
    for (const pm of event.paymentMethods) {
      paymentMethodsMap.set(pm.name.toLowerCase().trim(), pm.id);
    }

    const salesResponsiblesMap = new Map<string, string>();
    for (const sr of event.salesResponsibles) {
      salesResponsiblesMap.set(sr.name.toLowerCase().trim(), sr.id);
    }

    const prefix = event.settings?.registrationPrefix || `BC${String(event.year).slice(-2)}-`;
    let nextRegNum = (await prisma.registration.count({ where: { eventId } })) + 1;

    // Procesamiento secuencial transaccional por fila
    for (const item of validation.rowsSummary) {
      if (item.status === 'ERROR') {
        errorCount++;
        errorsToRecord.push({
          rowNumber: item.rowNumber,
          fieldName: 'validation',
          errorMessage: item.errors.join('; '),
          rawRowData: item.raw,
        });
        continue;
      }

      const n = item.normalized;

      // Si es un duplicado en base de datos
      if (item.isDuplicateInDb) {
        if (conflictStrategy === 'SKIP' || conflictStrategy === 'ONLY_NEW') {
          skippedCount++;
          continue;
        } else if (conflictStrategy === 'UPDATE') {
          // Estrategia Actualizar: buscar registro existente y actualizarlo
          try {
            const existingReg = await prisma.registration.findFirst({
              where: {
                eventId,
                OR: [
                  { participant: { email: n.email } },
                  n.documentId ? { participant: { documentId: n.documentId } } : {},
                ],
              },
              include: { participant: true },
            });

            if (existingReg) {
              await prisma.registration.update({
                where: { id: existingReg.id },
                data: {
                  totalAmount: n.isCourtesy ? 0 : Number(n.totalAmount || 0),
                  isCourtesy: n.isCourtesy || false,
                  status: n.status || existingReg.status,
                  notes: n.notes || existingReg.notes,
                },
              });

              // Actualizar datos del participante físico si hay nuevos
              await prisma.participant.update({
                where: { id: existingReg.participantId },
                data: {
                  firstName: n.firstName || existingReg.participant.firstName,
                  lastName: n.lastName || existingReg.participant.lastName,
                  fullName: `${n.firstName} ${n.lastName}`,
                  phone: n.phone || existingReg.participant.phone,
                  alternatePhone: n.alternatePhone || existingReg.participant.alternatePhone,
                  documentId: n.documentId || existingReg.participant.documentId,
                },
              });

              updatedCount++;
              continue;
            }
          } catch (e: any) {
            errorCount++;
            errorsToRecord.push({
              rowNumber: item.rowNumber,
              fieldName: 'update',
              errorMessage: e.message || 'Error al actualizar registro existente',
              rawRowData: item.raw,
            });
            continue;
          }
        }
      }

      // Registro nuevo: Resolver o crear método de pago
      let resolvedPaymentId: string | null = null;
      if (n.paymentMethod && n.paymentMethod.trim() !== '') {
        const pmKey = n.paymentMethod.toLowerCase().trim();
        if (paymentMethodsMap.has(pmKey)) {
          resolvedPaymentId = paymentMethodsMap.get(pmKey)!;
        } else {
          // Crear nuevo método de pago si no existe
          try {
            const newPm = await prisma.paymentMethod.create({
              data: {
                eventId,
                name: n.paymentMethod.trim(),
              },
            });
            paymentMethodsMap.set(pmKey, newPm.id);
            resolvedPaymentId = newPm.id;
          } catch {
            resolvedPaymentId = null;
          }
        }
      }

      // Resolver o crear responsable de venta
      let resolvedRespId: string | null = null;
      if (n.salesResponsible && n.salesResponsible.trim() !== '') {
        const srKey = n.salesResponsible.toLowerCase().trim();
        if (salesResponsiblesMap.has(srKey)) {
          resolvedRespId = salesResponsiblesMap.get(srKey)!;
        } else {
          try {
            const newSr = await prisma.salesResponsible.create({
              data: {
                eventId,
                name: n.salesResponsible.trim(),
              },
            });
            salesResponsiblesMap.set(srKey, newSr.id);
            resolvedRespId = newSr.id;
          } catch {
            resolvedRespId = null;
          }
        }
      }

      // Resolver o crear persona física
      try {
        let participant = null;
        if (n.documentId) {
          participant = await prisma.participant.findFirst({ where: { documentId: n.documentId } });
        }
        if (!participant && n.email) {
          participant = await prisma.participant.findFirst({ where: { email: n.email } });
        }

        const fullName = `${n.firstName} ${n.lastName}`.trim();
        if (participant) {
          participant = await prisma.participant.update({
            where: { id: participant.id },
            data: {
              firstName: n.firstName,
              lastName: n.lastName,
              fullName,
              phone: n.phone || participant.phone,
              alternatePhone: n.alternatePhone || participant.alternatePhone,
              documentId: n.documentId || participant.documentId,
              institution: n.institution || participant.institution,
            },
          });
        } else {
          participant = await prisma.participant.create({
            data: {
              firstName: n.firstName,
              lastName: n.lastName,
              fullName,
              email: n.email,
              documentId: n.documentId || null,
              phone: n.phone || null,
              alternatePhone: n.alternatePhone || null,
              institution: n.institution || null,
            },
          });
        }

        // Resolver tipo de entrada de la edición
        let matchedTicketType = null;
        if (n.ticketType && n.ticketType.trim()) {
          const ttQuery = n.ticketType.toLowerCase().trim();
          matchedTicketType = event.ticketTypes.find((t) => t.name.toLowerCase().includes(ttQuery));
        }
        if (!matchedTicketType && event.ticketTypes.length > 0) {
          if (n.isCourtesy) {
            matchedTicketType = event.ticketTypes.find((t) => t.price === 0) || null;
          } else {
            matchedTicketType = event.ticketTypes.find((t) => t.price > 0) || event.ticketTypes[0];
          }
        }

        const ticketPrice = n.isCourtesy
          ? 0
          : (n.ticketPrice ? Number(n.ticketPrice) : (matchedTicketType ? Number(matchedTicketType.price) : Number(n.totalAmount || 0)));
        const amountPaid = n.isCourtesy
          ? 0
          : (n.amountPaid ? Number(n.amountPaid) : Number(n.totalAmount || 0));
        const balanceDue = Math.max(0, ticketPrice - amountPaid);

        // Generar número de registro único
        let regNum = n.registrationNumber ? String(n.registrationNumber).trim() : '';
        if (!regNum) {
          let candidate = `${prefix}${String(nextRegNum).padStart(4, '0')}`;
          while (await prisma.registration.findUnique({ where: { eventId_registrationNumber: { eventId, registrationNumber: candidate } } })) {
            nextRegNum++;
            candidate = `${prefix}${String(nextRegNum).padStart(4, '0')}`;
          }
          regNum = candidate;
          nextRegNum++;
        }

        const paymentStatus = n.isCourtesy
          ? 'COURTESY'
          : balanceDue === 0 && amountPaid > 0
          ? 'PAID'
          : amountPaid > 0 && balanceDue > 0
          ? 'PARTIAL'
          : 'PENDING';

        // Crear inscripción vinculada al lote
        await prisma.registration.create({
          data: {
            eventId,
            participantId: participant.id,
            registrationNumber: regNum,
            source: 'EXCEL_IMPORT',
            importBatchId: batch.id,
            ticketTypeId: matchedTicketType ? matchedTicketType.id : null,
            ticketPrice,
            amountPaid,
            balanceDue,
            totalAmount: amountPaid,
            isVerified: n.isCourtesy ? true : (n.isVerified === 'SÍ' || n.isVerified === 'true' || amountPaid > 0),
            isCourtesy: n.isCourtesy || false,
            courtesyAuthorizedBy: n.isCourtesy ? (n.courtesyAuthorizedBy || 'Comité Organizador') : null,
            courtesyReason: n.isCourtesy ? (n.courtesyReason || 'Cortesía importada') : null,
            courtesyDate: n.isCourtesy ? new Date() : null,
            paymentMethodId: resolvedPaymentId,
            paymentStatus,
            salesResponsibleId: resolvedRespId,
            status: n.status === 'ATTENDED' ? 'CONFIRMED' : (n.status || (balanceDue === 0 || n.isCourtesy ? 'CONFIRMED' : 'PENDING')),
            attended: n.status === 'ATTENDED',
            attendedAt: n.status === 'ATTENDED' ? new Date() : null,
            notes: n.notes || null,
            saleTimestamp: n.saleTimestamp ? new Date(n.saleTimestamp) : new Date(),
          },
        });

        importedCount++;
      } catch (err: any) {
        errorCount++;
        errorsToRecord.push({
          rowNumber: item.rowNumber,
          fieldName: 'database',
          errorMessage: err.message || 'Error al persistir en base de datos',
          rawRowData: item.raw,
        });
      }
    }

    // Guardar errores individuales si ocurrieron
    if (errorsToRecord.length > 0) {
      const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
      for (const err of errorsToRecord) {
        await prisma.importError.create({
          data: {
            importBatchId: batch.id,
            rowNumber: err.rowNumber,
            fieldName: err.fieldName,
            errorMessage: err.errorMessage,
            rawRowData: isSqlite ? JSON.stringify(err.rawRowData) : (err.rawRowData as any),
          },
        });
      }
    }

    // Actualizar resumen del lote
    const updatedBatch = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: importedCount,
        updatedRows: updatedCount,
        skippedRows: skippedCount,
        errorRows: errorCount,
      },
    });

    return {
      batchId: batch.id,
      fileName,
      totalRows: rows.length,
      importedCount,
      updatedCount,
      skippedCount,
      errorCount,
      errors: errorsToRecord,
    };
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
          select: { errors: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches;
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
