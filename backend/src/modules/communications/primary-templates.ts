import {campaignTemplateNames} from './mail-policy.js';
const messages:Record<string,string>={
 REGISTRATION_CONFIRMATION:'Hemos recibido tu inscripción. {{registrationStateMessage}} {{paymentStateMessage}}',
 DIGITAL_TICKET:'Esta es tu entrada digital vigente. Preséntala en recepción. {{paymentStateMessage}}',
 EVENT_REMINDER:'Te esperamos en {{eventName}}. Revisa la fecha, hora y lugar antes de salir. {{arrivalInstructions}}',
 PAYMENT_REMINDER:'Tu inscripción tiene un saldo pendiente de {{currencySymbol}} {{balanceDue}}. {{paymentInstructions}}',
 KEYNOTE_ANNOUNCEMENT:'{{keynoteSummary}}',GENERAL_ANNOUNCEMENT:'Información del equipo organizador de {{eventName}}.'};
export function primaryTemplate(code:string){if(!messages[code])return null;const content=`Hola {{participantName}},\n\n${messages[code]}\n\nEvento: {{eventName}}\nFecha: {{eventDate}}\nHora: {{eventTime}}\nLugar: {{eventVenue}}\nEntrada: {{registrationNumber}} · {{ticketType}}\nEstado: {{registrationStateMessage}}\nContacto: {{paymentSupportContact}}`;
 return {subject:campaignTemplateNames[code]+' — {{eventName}} · {{registrationNumber}}',bodyText:content,bodyHtml:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#172033;line-height:1.6;border-top:4px solid {{primaryColor}}"><table role="presentation"><tr>{{eventLogoHtml}}</tr></table><h1>${campaignTemplateNames[code]}</h1><p>Hola {{participantName}},</p><p>${messages[code]}</p><div style="padding:16px;background:#f3f4f6;border-radius:12px"><strong>{{eventName}}</strong><p>Fecha: {{eventDate}} · Hora: {{eventTime}}</p><p>Lugar: {{eventVenue}}</p><p>Entrada {{registrationNumber}} · {{ticketType}}</p><p>{{registrationStateMessage}} · {{paymentStateMessage}}</p></div>${code==='DIGITAL_TICKET'?'<p style="text-align:center">{{qr}}</p>':''}{{messageContent}}<p>Contacto: {{paymentSupportContact}}</p><p style="font-size:12px">{{eventName}} · Gestión de eventos con EventGrid</p></div>`};
}
/** Upgrade only an unchanged bundled default; edited templates and historical snapshots stay intact. */
export function effectivePrimaryTemplate<T extends {code:string;subject:string;bodyHtml:string;bodyText?:string|null}>(template:T,legacy:{subject:string;bodyHtml:string;bodyText?:string|null}|undefined):T{
 const updated=primaryTemplate(template.code);return updated&&legacy&&template.subject===legacy.subject&&template.bodyHtml.trim()===legacy.bodyHtml.trim()&&template.bodyText===legacy.bodyText?{...template,...updated}:template;
}
