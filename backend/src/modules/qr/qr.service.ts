import {speakerSummary} from '../speakers/speaker-summary.js';
import { prisma } from '../../config/db.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { ticketToken } from './qr-input.js';

export class QrService {
  static payload(token: string) { return `${(process.env.PUBLIC_APP_URL || 'https://eventgrid.app').replace(/\/$/,'')}/t/${encodeURIComponent(token)}`; }
  /**
   * Generar o consultar código QR y entrada digital para una inscripción
   */
  static async getTicketQr(registrationId: string) {
    let registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        event: {
          include: { settings: true },
        },
      },
    });

    if (!registration) throw new NotFoundError('Inscripción no encontrada');

    const speaker=await speakerSummary(registration.eventId,registration.id);
    if(speaker?.credentialRevokedAt)throw new BadRequestError('La credencial de charlista está revocada.');

    // Si aún no tiene token QR asignado, generar uno seguro
    if (!registration.qrCode) {
      const secureToken = `eg_qr_${crypto.randomBytes(16).toString('hex')}`;
      registration = await prisma.registration.update({
        where: { id: registrationId },
        data: {
          qrCode: secureToken,
          qrGeneratedAt: new Date(),
        },
        include: {
          participant: true,
          ticketType: true,
          paymentMethod: true,
          event: {
            include: { settings: true },
          },
        },
      });
    }

    // Contenido del QR: Token seguro no identificable con datos personales
    const qrPayload = this.payload(registration.qrCode!);

    // Generar imagen QR en Base64 Data URL (alta resolución con margen para lectura rápida)
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });

    const eventSettings = registration.event.settings;

    return {
      token: registration.qrCode,
      qrToken: registration.qrCode,
      qrPayload,
      qrDataUrl,
      generatedAt: (registration.qrGeneratedAt || registration.createdAt).toISOString(),
      revokedAt: registration.qrRevokedAt ? registration.qrRevokedAt.toISOString() : null,
      speaker,
      registrationId: registration.id,
      registrationNumber: registration.registrationNumber,
      registration: {
        id: registration.id,
        registrationNumber: registration.registrationNumber,
        status: registration.status,
        paymentStatus: registration.paymentStatus,
        isCourtesy: registration.isCourtesy,
        attended: registration.attended,
        attendedAt: registration.attendedAt ? registration.attendedAt.toISOString() : undefined,
        ticketType: speaker||registration.participantCategory==='SPEAKER'?'Charlista':registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
        price: Number(registration.ticketPrice ?? registration.totalAmount ?? 0),
      },
      participant: {
        id: registration.participant.id,
        fullName: registration.participant.fullName,
        firstName: registration.participant.firstName,
        lastName: registration.participant.lastName,
        email: registration.participant.email,
        documentId: registration.participant.documentId || undefined,
        institution: registration.participant.institution || undefined,
      },
      event: {
        id: registration.event.id,
        name: registration.event.name,
        year: registration.event.year,
        venue: registration.event.venue,
        startDate: registration.event.startDate.toISOString(),
        endDate: registration.event.endDate.toISOString(),
        logoUrl: eventSettings?.logoUrl || undefined,
        currencySymbol: eventSettings?.currencySymbol || 'RD$',
      },
      ticket: {
        eventName: registration.event.name,
        editionYear: registration.event.year,
        venue: registration.event.venue,
        startDate: registration.event.startDate,
        endDate: registration.event.endDate,
        logoUrl: registration.event.settings?.logoUrl,
        primaryColor: registration.event.settings?.primaryColor || '#e11d48',
        participantName: registration.participant.fullName,
        participantInstitution: registration.participant.institution,
        ticketTypeName: registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
        ticketPrice: Number(registration.ticketPrice ?? registration.totalAmount ?? 0),
        status: registration.status,
        paymentStatus: registration.paymentStatus,
        attended: registration.attended,
        attendedAt: registration.attendedAt,
      },
    };
  }

  /**
   * Revocar el código QR actual y regenerar uno nuevo inmediatamente
   */
  static async revokeAndRegenerate(registrationId: string, userId?: string, reason?: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) throw new NotFoundError('Inscripción no encontrada');

    const newSecureToken = `eg_qr_${crypto.randomBytes(16).toString('hex')}`;
    const now = new Date();

    const updated = await writeTransaction(async tx => {
      // Retain only a one-way fingerprint so a known revoked credential can be
      // distinguished safely from an unknown QR, without retaining the secret.
      const current = await tx.registration.findUniqueOrThrow({ where: { id: registrationId } });
      if (current.qrCode) {
        const fingerprint = crypto.createHash('sha256').update(current.qrCode).digest('hex');
        const changes = { registrationId, eventId: registration.eventId, reason: reason || 'Rotación administrativa' };
        await tx.auditLog.create({ data: { action: 'QR_REVOKED', entity: 'REGISTRATION', entityId: fingerprint, userId: userId || null, changes: (ENV.DATABASE_URL?.startsWith('file:') ? JSON.stringify(changes) : changes) as any } });
      }
      return tx.registration.update({
      where: { id: registrationId },
      data: {
        qrCode: newSecureToken,
        qrRevokedAt: now,
        qrGeneratedAt: now,
        updatedByUserId: userId,
      },
      include: {
        participant: true,
        ticketType: true,
        event: {
          include: { settings: true },
        },
      },
      });
    });

    const qrPayload = this.payload(updated.qrCode!);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    return {
      message: 'Código QR revocado y regenerado exitosamente.',
      newQrToken: updated.qrCode,
      qrDataUrl,
      revokedAt: now,
      registration: updated,
    };
  }

  /**
   * Validar y procesar lectura de escaneo de QR
   * REGLA: Nunca marca asistencia automáticamente. Valida y devuelve la ficha y el estado.
   */
  static async validateAndScan(codeOrToken: string, activeEventId?: string) {
    const parsed = ticketToken(codeOrToken);
    if (!parsed.token) return { valid:false,status:parsed.pairing?'PAIRING_CODE':'INVALID_CODE',canCheckIn:false,registration:null,message:parsed.pairing?'Utiliza Escanear QR de vinculación.':'Entrada no válida.' };
    const token = parsed.token;

    // Buscar inscripción por token seguro o por número de registro
    const registration = await prisma.registration.findFirst({
      where: {
        OR: [
          { qrCode: token },
          { registrationNumber: token },
        ],
      },
      include: {
        participant: true,
        ticketType: true,
        paymentMethod: true,
        attendedByUser: { select: { id: true, fullName: true, email: true } },
        event: {
          select: {
            id: true,
            name: true,
            year: true,
            venue: true,
          },
        },
      },
    });

    if (!registration) {
      const revoked = await prisma.auditLog.findFirst({ where: { action: 'QR_REVOKED', entity: 'REGISTRATION', entityId: crypto.createHash('sha256').update(token).digest('hex') }, select: { id: true } });
      return {
        valid: false,
        status: revoked ? 'REVOKED' : 'INVALID_CODE',
        error: 'TICKET_NOT_FOUND',
        canCheckIn: false,
        message: revoked ? 'Esta entrada fue revocada. Consulte con recepción.' : 'No se pudo verificar esta entrada.',
        registration: null,
      };
    }

    // Validar si pertenece a la edición activa seleccionada
    if (activeEventId && registration.eventId !== activeEventId) {
      return {
        valid: false,
        status: 'EDITION_MISMATCH',
        error: 'EDITION_MISMATCH',
        canCheckIn: false,
        message: `Esta entrada pertenece a "${registration.event.name}", no a la edición actualmente en gestión.`,
        registration,
      };
    }

    const speakerCredential=await speakerSummary(registration.eventId,registration.id);if(speakerCredential?.credentialRevokedAt)return {valid:false,status:'REVOKED',canCheckIn:false,registration:null,message:'Esta credencial fue revocada.'};if(speakerCredential)registration.participantCategory='SPEAKER';

    // Validar si la inscripción está cancelada
    if (registration.status === 'CANCELLED') {
      return {
        valid: false,
        status: 'CANCELLED',
        error: 'REGISTRATION_CANCELLED',
        canCheckIn: false,
        message: 'La inscripción asociada a esta entrada se encuentra CANCELADA.',
        registration,
      };
    }

    // Validar si ya asistió
    if (registration.attended) {
      const arrivedTime = registration.attendedAt
        ? new Date(registration.attendedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'hora desconocida';
      const registrar = registration.attendedByUser?.fullName || 'Operador';

      return {
        valid: true,
        status: 'ALREADY_CHECKED_IN',
        alreadyAttended: true,
        canCheckIn: false,
        message: `Asistencia ya registrada previamente a las ${arrivedTime} por ${registrar}.`,
        attendedAt: registration.attendedAt,
        attendedBy: registration.attendedByUser?.fullName,
        registration,
      };
    }

    // Entrada válida y disponible para confirmar entrada
    return {
      valid: true,
      status: 'VALID',
      alreadyAttended: false,
      canCheckIn: true,
      message: 'Entrada válida y vigente. Puede confirmar la asistencia del participante.',
      registration,
    };
  }
}
