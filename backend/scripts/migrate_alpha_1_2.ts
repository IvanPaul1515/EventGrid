import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    code: 'INSCRIPTION_CONFIRMATION',
    name: 'Confirmación de Inscripción',
    subject: '¡Inscripción confirmada para {{eventName}}! (Ticket {{registrationNumber}})',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #f43f5e; margin-bottom: 8px;">¡Hola, {{participantName}}!</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Tu inscripción para <strong>{{eventName}}</strong> ha sido registrada exitosamente.</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #334155;">
          <p style="margin: 4px 0;"><strong>Número de Ticket:</strong> <span style="font-family: monospace; color: #38bdf8;">{{registrationNumber}}</span></p>
          <p style="margin: 4px 0;"><strong>Tipo de Entrada:</strong> {{ticketType}}</p>
          <p style="margin: 4px 0;"><strong>Fecha del Evento:</strong> {{eventDate}}</p>
          <p style="margin: 4px 0;"><strong>Lugar:</strong> {{eventVenue}}</p>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">Conserva este correo o accede a tu entrada digital a través de la plataforma.</p>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nTu inscripción para {{eventName}} ha sido registrada exitosamente.\nTicket: {{registrationNumber}}\nTipo: {{ticketType}}\nFecha: {{eventDate}}\nLugar: {{eventVenue}}',
    variables: ['participantName', 'eventName', 'eventDate', 'eventVenue', 'registrationNumber', 'ticketType', 'amountPaid', 'balanceDue', 'qrUrl'],
    isSystem: true,
  },
  {
    code: 'DIGITAL_TICKET',
    name: 'Envío de Entrada Digital con QR',
    subject: 'Tu Entrada Digital para {{eventName}} — Ticket {{registrationNumber}}',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; text-align: center;">
        <h2 style="color: #f43f5e; margin-bottom: 4px;">Tu Entrada Digital</h2>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">{{eventName}}</p>
        <div style="background: #1e293b; padding: 24px; border-radius: 16px; margin: 24px 0; border: 1px solid #334155;">
          <h3 style="color: #ffffff; margin: 0 0 8px 0;">{{participantName}}</h3>
          <p style="color: #38bdf8; font-family: monospace; font-size: 16px; font-weight: bold; margin: 0 0 16px 0;">{{registrationNumber}}</p>
          <div style="margin: 16px 0;">
            <img src="{{qrDataUrl}}" alt="Código QR de Acceso" style="width: 180px; height: 180px; border-radius: 12px; background: white; padding: 8px;" />
          </div>
          <p style="color: #cbd5e1; font-size: 13px; margin: 8px 0 0 0;">Presenta este código QR en la mesa de recepción al momento de ingresar.</p>
        </div>
        <div style="text-align: left; background: #0b1120; padding: 14px; border-radius: 10px; font-size: 12px; color: #94a3b8;">
          <p style="margin: 2px 0;"><strong>Fecha:</strong> {{eventDate}}</p>
          <p style="margin: 2px 0;"><strong>Sede:</strong> {{eventVenue}}</p>
          <p style="margin: 2px 0;"><strong>Entrada:</strong> {{ticketType}}</p>
        </div>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nAdjuntamos tu entrada digital para {{eventName}}.\nNúmero de Ticket: {{registrationNumber}}\nPresenta tu código QR en la mesa de recepción.\nFecha: {{eventDate}}\nLugar: {{eventVenue}}',
    variables: ['participantName', 'eventName', 'eventDate', 'eventVenue', 'registrationNumber', 'ticketType', 'qrDataUrl', 'qrUrl'],
    isSystem: true,
  },
  {
    code: 'EVENT_REMINDER',
    name: 'Recordatorio Previo al Evento',
    subject: 'Recordatorio: ¡Nos vemos pronto en {{eventName}}!',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #f43f5e;">¡Falta poco para {{eventName}}!</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Hola <strong>{{participantName}}</strong>, te recordamos los detalles de tu participación:</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 18px 0;">
          <p style="margin: 4px 0;"><strong>Fecha:</strong> {{eventDate}}</p>
          <p style="margin: 4px 0;"><strong>Lugar:</strong> {{eventVenue}}</p>
          <p style="margin: 4px 0;"><strong>Ticket:</strong> {{registrationNumber}}</p>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">Recuerda tener a mano tu entrada digital o identificación para agilizar tu acceso.</p>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nTe recordamos que se aproxima {{eventName}}.\nFecha: {{eventDate}}\nLugar: {{eventVenue}}\nTicket: {{registrationNumber}}',
    variables: ['participantName', 'eventName', 'eventDate', 'eventVenue', 'registrationNumber', 'ticketType'],
    isSystem: true,
  },
  {
    code: 'PAYMENT_CONFIRMATION',
    name: 'Confirmación de Pago',
    subject: 'Comprobante de Pago — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #10b981;">Pago Registrado Correctamente</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Hola <strong>{{participantName}}</strong>, hemos recibido tu pago para <strong>{{eventName}}</strong>.</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 18px 0;">
          <p style="margin: 4px 0;"><strong>Ticket:</strong> {{registrationNumber}}</p>
          <p style="margin: 4px 0;"><strong>Monto Pagado:</strong> RD$ {{amountPaid}}</p>
          <p style="margin: 4px 0;"><strong>Balance Pendiente:</strong> RD$ {{balanceDue}}</p>
        </div>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nHemos registrado tu pago para {{eventName}}.\nTicket: {{registrationNumber}}\nMonto: RD$ {{amountPaid}}\nBalance restante: RD$ {{balanceDue}}',
    variables: ['participantName', 'eventName', 'registrationNumber', 'amountPaid', 'balanceDue'],
    isSystem: true,
  },
  {
    code: 'PENDING_BALANCE',
    name: 'Aviso de Saldo Pendiente',
    subject: 'Aviso de Saldo Pendiente — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #f59e0b;">Aviso de Saldo Pendiente</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Hola <strong>{{participantName}}</strong>, tienes un balance pendiente de pago para completar tu inscripción en <strong>{{eventName}}</strong>.</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 18px 0; border: 1px solid #d97706;">
          <p style="margin: 4px 0;"><strong>Ticket:</strong> {{registrationNumber}}</p>
          <p style="margin: 4px 0;"><strong>Balance Pendiente:</strong> <span style="color: #fbbf24; font-weight: bold;">RD$ {{balanceDue}}</span></p>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">Puedes saldar tu balance en la mesa de recepción o mediante los canales de pago autorizados.</p>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nTienes un saldo pendiente para {{eventName}} de RD$ {{balanceDue}} en tu ticket {{registrationNumber}}.',
    variables: ['participantName', 'eventName', 'registrationNumber', 'amountPaid', 'balanceDue'],
    isSystem: true,
  },
  {
    code: 'INSCRIPTION_CANCELLED',
    name: 'Cancelación de Inscripción',
    subject: 'Aviso de Cancelación — {{eventName}} (Ticket {{registrationNumber}})',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #f43f5e;">Inscripción Cancelada</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Hola <strong>{{participantName}}</strong>, te notificamos que la inscripción asociada al ticket <strong>{{registrationNumber}}</strong> para <strong>{{eventName}}</strong> ha sido cancelada.</p>
        <p style="color: #94a3b8; font-size: 13px;">Si consideras que esto es un error, por favor contacta al comité organizador.</p>
      </div>
    `,
    bodyText: 'Hola {{participantName}},\nTu inscripción con ticket {{registrationNumber}} para {{eventName}} ha sido cancelada.',
    variables: ['participantName', 'eventName', 'registrationNumber'],
    isSystem: true,
  },
  {
    code: 'GENERAL_ANNOUNCEMENT',
    name: 'Comunicaciones Generales',
    subject: 'Información Importante sobre {{eventName}}',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
        <h2 style="color: #f43f5e;">Comunicado Oficial</h2>
        <p style="color: #cbd5e1; font-size: 15px;">Estimado/a <strong>{{participantName}}</strong>,</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 18px 0; color: #f1f5f9;">
          {{messageContent}}
        </div>
        <p style="color: #94a3b8; font-size: 13px;">Atentamente,<br>Comité Organizador de {{eventName}}</p>
      </div>
    `,
    bodyText: 'Estimado/a {{participantName}},\n\n{{messageContent}}\n\nAtentamente,\nComité Organizador de {{eventName}}',
    variables: ['participantName', 'eventName', 'messageContent'],
    isSystem: true,
  },
];

async function main() {
  console.log('🔄 Ejecutando migración Alpha 1.2...');

  // 1. Asignar QR tokens únicos a registros que no lo tengan
  const registrationsWithoutQr = await prisma.registration.findMany({
    where: { qrCode: null },
    select: { id: true, registrationNumber: true },
  });

  console.log(`📋 Encontradas ${registrationsWithoutQr.length} inscripciones sin código QR.`);
  for (const reg of registrationsWithoutQr) {
    const secureToken = `eg_qr_${crypto.randomBytes(16).toString('hex')}`;
    await prisma.registration.update({
      where: { id: reg.id },
      data: {
        qrCode: secureToken,
        qrGeneratedAt: new Date(),
      },
    });
  }
  console.log(`✅ Códigos QR únicos generados para ${registrationsWithoutQr.length} inscripciones.`);

  // 2. Sembrar plantillas de correo predeterminadas para los eventos existentes
  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  for (const ev of events) {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = await prisma.emailTemplate.findFirst({
        where: { eventId: ev.id, code: tpl.code },
      });
      if (!existing) {
        await prisma.emailTemplate.create({
          data: {
            eventId: ev.id,
            code: tpl.code,
            name: tpl.name,
            subject: tpl.subject,
            bodyHtml: tpl.bodyHtml,
            bodyText: tpl.bodyText,
            variables: JSON.stringify(tpl.variables),
            isSystem: tpl.isSystem,
          },
        });
      }
    }
  }
  console.log(`✅ Plantillas de correo sembradas para ${events.length} eventos.`);

  console.log('🎉 Migración Alpha 1.2 completada con éxito.');
}

main()
  .catch((e) => {
    console.error('Error durante la migración Alpha 1.2:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
