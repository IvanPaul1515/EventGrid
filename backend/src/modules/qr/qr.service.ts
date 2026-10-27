import { prisma } from '../../config/db.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import QRCode from 'qrcode';
import crypto from 'crypto';

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
        ticketType: registration.ticketType?.name || (registration.isCourtesy ? 'Cortesía' : 'General'),
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

    const updated = await prisma.registration.update({
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

    const qrPayload = `https://eventgrid.app/t/${updated.qrCode}`;
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
    let token = codeOrToken.trim();

    // Extraer token si el escáner capturó la URL completa
    if (token.includes('/t/')) {
      const parts = token.split('/t/');
      token = parts[parts.length - 1];
    } else if (token.startsWith('{') && token.endsWith('}')) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.eg_token || token;
      } catch {
        // mantener token original
      }
    }

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
      return {
        valid: false,
        status: 'INVALID_CODE',
        error: 'TICKET_NOT_FOUND',
        canCheckIn: false,
        message: 'El código o token no corresponde a ninguna inscripción registrada en EventGrid.',
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
