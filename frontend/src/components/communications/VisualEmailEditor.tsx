import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Type,
  Heading,
  Minus,
  Image,
  User,
  FileBadge,
  QrCode,
  Calendar,
  Clock,
  ExternalLink,
  AlertTriangle,
  FileText,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Code,
  Layers,
  Smartphone,
  Monitor,
  Sparkles,
  Info,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useEdition } from '../../context/EditionContext';

export type EmailBlockType =
  | 'LOGO'
  | 'HEADING'
  | 'TEXT'
  | 'DIVIDER'
  | 'PARTICIPANT_NAME'
  | 'REGISTRATION_DETAILS'
  | 'TICKET_NUMBER'
  | 'QR_CODE'
  | 'DATE_LOCATION'
  | 'SCHEDULE'
  | 'BUTTON'
  | 'NOTICE'
  | 'FOOTER';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  config: {
    text?: string;
    level?: 'h1' | 'h2' | 'h3';
    align?: 'left' | 'center' | 'right';
    buttonText?: string;
    buttonUrl?: string;
    noticeType?: 'info' | 'warning' | 'success';
    noticeText?: string;
  };
}

export interface VisualEmailEditorProps {
  initialSubject?: string;
  initialHtml?: string;
  templateCode?: string;
  templates?: Array<{ code: string; name: string; subject: string; bodyHtml: string }>;
  onSelectTemplate?: (templateCode: string) => void;
  onChangeSubject?: (subject: string) => void;
  onChangeHtml?: (html: string) => void;
  customMessage?: string;
  onChangeCustomMessage?: (msg: string) => void;
  selectedParticipant?: {
    fullName: string;
    email: string;
    registrationNumber: string;
    ticketType?: string;
    institution?: string;
  } | null;
  readOnly?: boolean;
}

const AVAILABLE_VARIABLES = [
  { key: '{{nombre}}', desc: 'Nombre completo del participante' },
  { key: '{{email}}', desc: 'Correo del participante' },
  { key: '{{numero_registro}}', desc: 'Número de ticket/inscripción' },
  { key: '{{tipo_entrada}}', desc: 'Tipo de entrada adquirida' },
  { key: '{{institucion}}', desc: 'Institución o empresa' },
  { key: '{{evento}}', desc: 'Nombre del evento actual' },
  { key: '{{fecha}}', desc: 'Fechas de celebración' },
  { key: '{{lugar}}', desc: 'Ubicación / sede oficial' },
  { key: '{{qr}}', desc: 'Código QR individual del participante' },
  { key: '{{primaryColor}}', desc: 'Color primario de la edición' },
  { key: '{{messageContent}}', desc: 'Mensaje personalizado adicional' },
  { key: '{{scheduleHtml}}', desc: 'Tabla de actividades del cronograma' },
];

export const VisualEmailEditor: React.FC<VisualEmailEditorProps> = ({
  initialSubject = '',
  initialHtml = '',
  templateCode = 'INSCRIPTION_CONFIRMATION',
  templates = [],
  onSelectTemplate,
  onChangeSubject,
  onChangeHtml,
  customMessage = '',
  onChangeCustomMessage,
  selectedParticipant,
  readOnly = false,
}) => {
  const { currentEvent } = useEdition();
  const primaryColor = currentEvent?.settings?.primaryColor || '#e11d48';
  const eventLogo = currentEvent?.settings?.logoUrl || '';
  const eventName = currentEvent?.name || 'BarCamp RD 2026';

  // Modo de edición: Bloques interactivos vs HTML directo
  const [editorMode, setEditorMode] = useState<'blocks' | 'html'>('blocks');

  // Modo de vista previa: Desktop vs Mobile (iPhone)
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');

  // En pantallas móviles: alternar entre pestaña de edición y vista previa
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');

  // Asunto y contenido HTML interno
  const [subject, setSubject] = useState(initialSubject);
  const [rawHtml, setRawHtml] = useState(initialHtml);
  const hasUserEditedBlocks = React.useRef(false);

  // Sincronizar cuando cambian las props iniciales (ej. al cambiar de plantilla en el padre)
  useEffect(() => {
    if (initialSubject !== undefined) {
      setSubject(initialSubject);
    }
  }, [initialSubject]);

  useEffect(() => {
    if (initialHtml !== undefined && initialHtml !== '') {
      setRawHtml(initialHtml);
    }
  }, [initialHtml]);

  // Lista inicial de bloques predefinidos
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => [
    { id: 'b-logo', type: 'LOGO', config: {} },
    {
      id: 'b-title',
      type: 'HEADING',
      config: { text: '¡Bienvenido a BarCamp RD!', level: 'h1', align: 'center' },
    },
    {
      id: 'b-part',
      type: 'PARTICIPANT_NAME',
      config: { text: 'Hola, {{nombre}}:' },
    },
    {
      id: 'b-text',
      type: 'TEXT',
      config: {
        text: 'Tu participación en {{evento}} ha sido confirmada formalmente. A continuación encontrarás los detalles de tu registro y tu entrada digital.',
        align: 'left',
      },
    },
    { id: 'b-details', type: 'REGISTRATION_DETAILS', config: {} },
    { id: 'b-ticket', type: 'TICKET_NUMBER', config: {} },
    { id: 'b-qr', type: 'QR_CODE', config: {} },
    {
      id: 'b-btn',
      type: 'BUTTON',
      config: { buttonText: 'Ver Agenda y Cronograma', buttonUrl: 'https://barcamp.org.do' },
    },
    { id: 'b-divider', type: 'DIVIDER', config: {} },
    {
      id: 'b-notice',
      type: 'NOTICE',
      config: {
        noticeType: 'info',
        noticeText: 'Por favor presenta este correo con tu código QR al ingresar para acelerar tu check-in.',
      },
    },
    { id: 'b-footer', type: 'FOOTER', config: {} },
  ]);

  // Actualizar asunto hacia el padre
  const handleSubjectChange = (val: string) => {
    setSubject(val);
    if (onChangeSubject) onChangeSubject(val);
  };

  // Convertir bloques a HTML para email
  const renderBlocksToHtml = (currentBlocks: EmailBlock[]): string => {
    const renderedBlocks = currentBlocks.map((b) => {
      switch (b.type) {
        case 'LOGO':
          return `
            <tr>
              <td align="center" style="padding: 24px 20px 16px 20px; background-color: #140d0d; border-bottom: 1px solid #261a1a;">
                <span style="display: inline-block; font-family: monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${primaryColor}; background-color: rgba(237, 41, 23, 0.12); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(237, 41, 23, 0.3); margin-bottom: 8px;">BARCAMP RD 2026</span><br/>
                ${
                  eventLogo
                    ? `<img src="${eventLogo}" alt="${eventName}" style="max-height: 54px; max-width: 220px; display: block; border: 0;" />`
                    : `<h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">${eventName}</h2>`
                }
              </td>
            </tr>
          `;
        case 'HEADING':
          const fontSize = b.config.level === 'h1' ? '24px' : b.config.level === 'h2' ? '20px' : '16px';
          return `
            <tr>
              <td align="${b.config.align || 'left'}" style="padding: 20px 24px 8px 24px;">
                <h${b.config.level === 'h1' ? '1' : b.config.level === 'h2' ? '2' : '3'} style="margin: 0; font-size: ${fontSize}; font-weight: 700; color: #f5f1ec; line-height: 1.3; letter-spacing: -0.3px;">
                  ${b.config.text || ''}
                </h${b.config.level === 'h1' ? '1' : b.config.level === 'h2' ? '2' : '3'}>
              </td>
            </tr>
          `;
        case 'PARTICIPANT_NAME':
          return `
            <tr>
              <td style="padding: 12px 24px 6px 24px;">
                <div style="font-size: 16px; font-weight: 600; color: #f5f1ec;">
                  ${b.config.text || 'Estimado(a) {{nombre}}:'}
                </div>
              </td>
            </tr>
          `;
        case 'TEXT':
          return `
            <tr>
              <td align="${b.config.align || 'left'}" style="padding: 8px 24px; font-size: 14px; line-height: 1.6; color: #e5dfd8;">
                ${b.config.text || ''}
              </td>
            </tr>
          `;
        case 'DIVIDER':
          return `
            <tr>
              <td style="padding: 16px 24px;">
                <hr style="border: 0; border-top: 1px solid #261a1a; margin: 0;" />
              </td>
            </tr>
          `;
        case 'REGISTRATION_DETAILS':
          return `
            <tr>
              <td style="padding: 14px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 12px; padding: 16px;">
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #a8a09a;">Participante:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #f5f1ec;">{{nombre}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #a8a09a;">Tipo de Entrada:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #f5f1ec;">{{tipo_entrada}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #a8a09a;">Institución:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #f5f1ec;">{{institucion}}</td>
                  </tr>
                </table>
              </td>
            </tr>
          `;
        case 'TICKET_NUMBER':
          return `
            <tr>
              <td align="center" style="padding: 12px 24px;">
                <div style="display: inline-block; background-color: #181111; border: 2px dashed ${primaryColor}; border-radius: 8px; padding: 10px 24px;">
                  <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #a8a09a; display: block; letter-spacing: 1px;">Número de Registro</span>
                  <span style="font-size: 22px; font-weight: 800; font-family: monospace; color: #f5f1ec;">{{numero_registro}}</span>
                </div>
              </td>
            </tr>
          `;
        case 'QR_CODE':
          return `
            <tr>
              <td align="center" style="padding: 18px 24px;">
                <div style="background-color: #160f0f; border: 1px dashed #3d2424; border-radius: 14px; padding: 18px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                  {{qr}}
                  <p style="margin: 8px 0 0 0; font-size: 11px; color: #a8a09a; font-weight: 500;">Presenta este código en el acceso principal</p>
                </div>
              </td>
            </tr>
          `;
        case 'DATE_LOCATION':
          return `
            <tr>
              <td style="padding: 10px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #181111; border: 1px solid #2d1c1c; border-radius: 10px; padding: 14px;">
                  <tr>
                    <td style="font-size: 13px; color: #e5dfd8;">
                      <strong>Fecha:</strong> {{fecha}}<br/>
                      <strong>Lugar:</strong> {{lugar}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          `;
        case 'SCHEDULE':
          return `
            <tr>
              <td style="padding: 12px 24px;">
                <div style="border-left: 3px solid ${primaryColor}; padding-left: 12px; margin: 4px 0;">
                  <strong style="font-size: 13px; color: #f5f1ec;">Cronograma de Actividades</strong>
                  {{scheduleHtml}}
                </div>
              </td>
            </tr>
          `;
        case 'BUTTON':
          return `
            <tr>
              <td align="center" style="padding: 20px 24px;">
                <a href="${b.config.buttonUrl || '#'}" target="_blank" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                  ${b.config.buttonText || 'Ver Detalles'}
                </a>
              </td>
            </tr>
          `;
        case 'NOTICE':
          const borderClr = b.config.noticeType === 'warning' ? '#f59e0b' : b.config.noticeType === 'success' ? '#10b981' : '#3b82f6';
          const bgClr = b.config.noticeType === 'warning' ? '#fffbeb' : b.config.noticeType === 'success' ? '#ecfdf5' : '#eff6ff';
          return `
            <tr>
              <td style="padding: 12px 24px;">
                <div style="background-color: ${bgClr}; border-left: 4px solid ${borderClr}; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1f2937;">
                  ${b.config.noticeText || ''}
                </div>
              </td>
            </tr>
          `;
        case 'FOOTER':
          return `
            <tr>
              <td align="center" style="padding: 24px 20px; background-color: #0c0808; border-top: 1px solid #261a1a; font-size: 11px; color: #6b6460;">
                <p style="margin: 0 0 6px 0;">Este mensaje fue generado automáticamente por <strong>EventGrid</strong> para ${eventName}.</p>
                <p style="margin: 0;">Para consultas o asistencia, responde directamente a este correo.</p>
              </td>
            </tr>
          `;
        default:
          return '';
      }
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || eventName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0707; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f1ec;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0707; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #110c0c; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6); border: 1px solid #261a1a;">
          <tr><td style="height: 6px; background-color: ${primaryColor}; line-height: 6px; font-size: 1px;">&nbsp;</td></tr>\n          ${renderedBlocks.join('')}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  };

  // Re-generar HTML al cambiar bloques SOLO si el usuario ha modificado activamente los bloques
  useEffect(() => {
    if (editorMode === 'blocks' && hasUserEditedBlocks.current) {
      const generated = renderBlocksToHtml(blocks);
      setRawHtml(generated);
      if (onChangeHtml) onChangeHtml(generated);
    }
  }, [blocks, editorMode, primaryColor, eventLogo, eventName]);

  // Actualizar rawHtml cuando se edita manualmente en modo HTML
  const handleRawHtmlChange = (val: string) => {
    setRawHtml(val);
    if (onChangeHtml) onChangeHtml(val);
  };

  // Operaciones con bloques
  const handleAddBlock = (type: EmailBlockType) => {
    hasUserEditedBlocks.current = true;
    const newId = `b-${Date.now()}`;
    let newConfig: any = {};
    if (type === 'HEADING') newConfig = { text: 'Nuevo Encabezado', level: 'h2', align: 'left' };
    if (type === 'TEXT') newConfig = { text: 'Escribe tu párrafo informativo aquí.', align: 'left' };
    if (type === 'BUTTON') newConfig = { buttonText: 'Confirmar Asistencia', buttonUrl: '#' };
    if (type === 'NOTICE') newConfig = { noticeType: 'info', noticeText: 'Aviso importante sobre el evento.' };

    setBlocks([...blocks, { id: newId, type, config: newConfig }]);
  };

  const handleRemoveBlock = (id: string) => {
    hasUserEditedBlocks.current = true;
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;
    hasUserEditedBlocks.current = true;

    const newBlocks = [...blocks];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIdx];
    newBlocks[targetIdx] = temp;
    setBlocks(newBlocks);
  };

  const handleUpdateBlockConfig = (id: string, updates: Partial<EmailBlock['config']>) => {
    hasUserEditedBlocks.current = true;
    setBlocks(
      blocks.map((b) => (b.id === id ? { ...b, config: { ...b.config, ...updates } } : b))
    );
  };

  // Generar HTML final para el iframe de vista previa con datos de muestra o del participante real
  const previewHtmlDoc = useMemo(() => {
    let html = rawHtml || renderBlocksToHtml(blocks);

    // Datos para sustitución segura
    const pName = selectedParticipant ? selectedParticipant.fullName : 'María Pérez Fernández (Ejemplo)';
    const pFirstName = pName.split(' ')[0] || 'María';
    const pEmail = selectedParticipant?.email || 'maria.perez@ejemplo.edu.do';
    const pTicket = selectedParticipant?.registrationNumber || 'BC26-1042';
    const pType = selectedParticipant?.ticketType || 'Entrada General';
    const pInst = selectedParticipant?.institution || 'Pontificia Universidad Católica Madre y Maestra (PUCMM)';
    const eDate = currentEvent?.startDate
      ? new Date(currentEvent.startDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })
      : '7 de Noviembre de 2026';
    const eVenue = currentEvent?.venue || 'Campus Santiago de los Caballeros, PUCMM';

    // SVG QR oficial con diseño responsivo
    const qrSvg = `
      <div style="text-align: center; margin: 12px 0;">
        <div style="display: inline-block; padding: 14px; background: #ffffff; border: 2px solid ${primaryColor}; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);">
          <svg width="150" height="150" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="#ffffff" />
            <rect x="8" y="8" width="26" height="26" fill="#0f172a" rx="2" />
            <rect x="12" y="12" width="18" height="18" fill="#ffffff" rx="1" />
            <rect x="16" y="16" width="10" height="10" fill="${primaryColor}" rx="1" />
            
            <rect x="66" y="8" width="26" height="26" fill="#0f172a" rx="2" />
            <rect x="70" y="12" width="18" height="18" fill="#ffffff" rx="1" />
            <rect x="74" y="16" width="10" height="10" fill="${primaryColor}" rx="1" />
            
            <rect x="8" y="66" width="26" height="26" fill="#0f172a" rx="2" />
            <rect x="12" y="70" width="18" height="18" fill="#ffffff" rx="1" />
            <rect x="16" y="74" width="10" height="10" fill="${primaryColor}" rx="1" />
            
            <rect x="42" y="14" width="6" height="6" fill="#0f172a" />
            <rect x="52" y="14" width="6" height="12" fill="#0f172a" />
            <rect x="42" y="26" width="16" height="6" fill="#0f172a" />
            <rect x="14" y="42" width="12" height="6" fill="#0f172a" />
            <rect x="30" y="42" width="8" height="8" fill="${primaryColor}" />
            <rect x="44" y="42" width="12" height="12" fill="#0f172a" />
            <rect x="62" y="42" width="10" height="6" fill="#0f172a" />
            <rect x="78" y="42" width="8" height="14" fill="#0f172a" />
            <rect x="14" y="54" width="6" height="8" fill="#0f172a" />
            <rect x="26" y="54" width="12" height="6" fill="#0f172a" />
            <rect x="62" y="54" width="14" height="6" fill="#0f172a" />
            <rect x="42" y="62" width="8" height="16" fill="#0f172a" />
            <rect x="56" y="62" width="6" height="8" fill="#0f172a" />
            <rect x="68" y="66" width="18" height="8" fill="#0f172a" />
            <rect x="42" y="82" width="14" height="6" fill="#0f172a" />
            <rect x="62" y="80" width="12" height="8" fill="#0f172a" />
            <rect x="80" y="80" width="8" height="8" fill="${primaryColor}" />
          </svg>
        </div>
      </div>
    `;

    // Tabla de cronograma oficial para {{scheduleHtml}}
    const scheduleHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">
        <tr style="background: rgba(0,0,0,0.03); border-bottom: 2px solid ${primaryColor};">
          <th style="padding: 8px 12px; text-align: left; font-size: 12px;">Hora</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 12px;">Actividad</th>
          <th style="padding: 8px 12px; text-align: left; font-size: 12px;">Lugar</th>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-family: monospace; color: #475569;">08:30 AM</td>
          <td style="padding: 8px 12px; font-weight: 600;">Registro y acreditación de participantes</td>
          <td style="padding: 8px 12px; color: #64748b;">Vestíbulo Principal</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-family: monospace; color: #475569;">09:30 AM</td>
          <td style="padding: 8px 12px; font-weight: 600;">Inteligencia artificial aplicada al desarrollo de software</td>
          <td style="padding: 8px 12px; color: #64748b;">Auditorio A</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-family: monospace; color: #475569;">11:00 AM</td>
          <td style="padding: 8px 12px; font-weight: 600;">Ciberseguridad: amenazas y buenas prácticas</td>
          <td style="padding: 8px 12px; color: #64748b;">Auditorio B</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-family: monospace; color: #475569;">02:00 PM</td>
          <td style="padding: 8px 12px; font-weight: 600;">Desarrollo web moderno y aplicaciones progresivas</td>
          <td style="padding: 8px 12px; color: #64748b;">Auditorio A</td>
        </tr>
      </table>
    `;

    // Reemplazos de variables de plantilla tanto en español como formato backend
    html = html.split('{{nombre}}').join(pName);
    html = html.split('{{participantName}}').join(pName);
    html = html.split('{{participantFirstName}}').join(pFirstName);
    html = html.split('{{email}}').join(pEmail);
    html = html.split('{{participantEmail}}').join(pEmail);
    html = html.split('{{numero_registro}}').join(pTicket);
    html = html.split('{{registrationNumber}}').join(pTicket);
    html = html.split('{{tipo_entrada}}').join(pType);
    html = html.split('{{ticketType}}').join(pType);
    html = html.split('{{ticketPrice}}').join('RD$ 1,750.00');
    html = html.split('{{amountPaid}}').join('RD$ 1,750.00');
    html = html.split('{{balanceDue}}').join('RD$ 0.00');
    const paymentBadge = '<span style="display: inline-block; font-size: 11px; font-weight: 700; color: #34d399; background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); padding: 2px 8px; border-radius: 4px;">Confirmado</span>';
    html = html.split('{{paymentStatusText}}').join('Pago Confirmado');
    html = html.split('{{paymentStatusBadgeHtml}}').join(paymentBadge);
    html = html.split('{{estado_pago}}').join('Pago Confirmado');
    html = html.split('{{estado_pago_badge}}').join(paymentBadge);
    html = html.split('{{currencySymbol}}').join('RD$');
    const instHtml = pInst ? `<p style="margin: 3px 0 0 0; font-size: 12px; color: #64748b;">${pInst}</p>` : '';
    const logoHtml = eventLogo ? `<td valign="top" align="right" style="width: 60px; padding-left: 12px;"><img src="${eventLogo}" alt="${eventName}" width="52" height="52" style="display: block; width: 52px; height: 52px; object-fit: contain; border-radius: 10px; border: 1px solid #e2e8f0; padding: 2px; background-color: #ffffff;" /></td>` : '';
    const customMessageHtml = customMessage && customMessage.trim() !== ''
      ? `<tr><td style="padding: 0 28px 12px 28px;"><div style="padding: 12px 16px; background-color: #f8fafc; border-left: 3px solid ${primaryColor}; border-radius: 4px; font-size: 13px; color: #334155;">${customMessage}</div></td></tr>`
      : '';
    const qrDataUrlSafe = 'data:image/svg+xml;utf8,' + encodeURIComponent(qrSvg);

    html = html.split('{{institucion}}').join(pInst);
    html = html.split('{{institution}}').join(pInst);
    html = html.split('{{institutionHtml}}').join(instHtml);
    html = html.split('{{evento}}').join(eventName);
    html = html.split('{{eventName}}').join(eventName);
    html = html.split('{{eventYear}}').join(String(currentEvent?.year || 2026));
    html = html.split('{{fecha}}').join(eDate);
    html = html.split('{{eventDate}}').join(eDate);
    html = html.split('{{lugar}}').join(eVenue);
    html = html.split('{{eventVenue}}').join(eVenue);
    html = html.split('{{primaryColor}}').join(primaryColor);
    html = html.split('{{eventColor}}').join(primaryColor);
    html = html.split('{{eventLogoHtml}}').join(logoHtml);
    html = html.split('{{eventLogo}}').join(eventLogo || '');
    html = html.split('{{logoUrl}}').join(eventLogo || '');
    html = html.split('cid:event-logo').join(eventLogo || '');
    html = html.split('cid:ticket-qr-code').join(qrDataUrlSafe);
    html = html.split('{{qrDataUrl}}').join(qrDataUrlSafe);
    html = html.split('{{qr}}').join(`<img src="${qrDataUrlSafe}" alt="Código QR de Acceso" width="200" height="200" style="display: block; margin: 0 auto; width: 200px; height: 200px; border: 0;" />`);
    html = html.split('{{qrUrl}}').join('https://eventgrid.app/t/' + pTicket);
    html = html.split('{{scheduleHtml}}').join(scheduleHtml);
    html = html.split('{{messageContent}}').join(customMessageHtml);

    return html;
  }, [
    blocks,
    rawHtml,
    editorMode,
    selectedParticipant,
    currentEvent,
    eventName,
    primaryColor,
    eventLogo,
    subject,
    customMessage,
  ]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Barra de Controles Superiores: Asunto, Selector de Plantilla y Modo de Edición */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Asunto del Correo */}
        <div className="flex-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Asunto del Correo Electrónico
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            disabled={readOnly}
            placeholder="Ej: Confirmación de Inscripción — {{evento}}"
            className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
          />
        </div>

        {/* Selector de Plantilla (si se proporcionan templates) */}
        {templates && templates.length > 0 && onSelectTemplate && (
          <div className="w-full md:w-auto shrink-0">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Plantilla Base
            </label>
            <select
              value={templateCode}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'CUSTOM_BLOCKS') {
                  setEditorMode('blocks');
                } else {
                  onSelectTemplate(val);
                }
              }}
              className="w-full md:w-auto px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
              <option value="CUSTOM_BLOCKS">★ Personalizado por Bloques Visuales</option>
            </select>
          </div>
        )}

        {/* Selector de Modo Bloques vs HTML y Viewport Desktop/Mobile */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0 pt-2 md:pt-0">
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setEditorMode('blocks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                editorMode === 'blocks'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bloques Visuales</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('html')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                editorMode === 'html'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Código HTML</span>
            </button>
          </div>

          {/* Toggle móvil en pantallas pequeñas (oculto en desktop) */}
          <div className="flex md:hidden items-center bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setMobileTab('edit')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                mobileTab === 'edit' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                mobileTab === 'preview' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Vista Previa
            </button>
          </div>
        </div>
      </div>

      {/* Mensaje Personalizado Opcional (si se provee handler) */}
      {onChangeCustomMessage && (
        <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-1.5">
            <span>Mensaje Personalizado Adicional (Opcional)</span>
            <span className="text-[10px] text-muted-foreground font-normal">
              Se inserta en la variable {'{{messageContent}}'}
            </span>
          </label>
          <input
            type="text"
            value={customMessage}
            onChange={(e) => onChangeCustomMessage(e.target.value)}
            placeholder="Escriba un mensaje complementario para el participante..."
            className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* Layout de dos paneles en Desktop (Izquierda: Edición, Derecha: Vista Previa en Vivo Permanente) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-h-[600px]">
        {/* PANEL IZQUIERDO: REDACCIÓN Y BLOQUES (Visible siempre en PC, condicional en móvil) */}
        <div
          className={`lg:col-span-6 xl:col-span-6 flex flex-col gap-3.5 bg-card border border-border rounded-xl p-4 shadow-sm max-h-[780px] overflow-y-auto ${
            mobileTab === 'edit' ? 'block' : 'hidden lg:block'
          }`}
        >
          {editorMode === 'blocks' ? (
            <>
              {/* Barra de Biblioteca de Bloques Rápidos */}
              <div className="border border-border/80 rounded-xl p-3 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    Biblioteca de Bloques Predefinidos
                  </span>
                  <span className="text-[11px] text-muted-foreground">Clic para agregar</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddBlock('HEADING')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Heading className="w-3 h-3" /> Título
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('TEXT')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Type className="w-3 h-3" /> Párrafo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('BUTTON')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Botón Enlace
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('QR_CODE')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <QrCode className="w-3 h-3" /> Código QR
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('REGISTRATION_DETAILS')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <FileBadge className="w-3 h-3" /> Ficha Registro
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('TICKET_NUMBER')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <FileText className="w-3 h-3" /> N° Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('DATE_LOCATION')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Calendar className="w-3 h-3" /> Fecha y Lugar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('SCHEDULE')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Clock className="w-3 h-3" /> Cronograma
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('NOTICE')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="w-3 h-3" /> Alerta
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddBlock('DIVIDER')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border hover:border-primary hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Minus className="w-3 h-3" /> Separador
                  </button>
                </div>
              </div>

              {/* Lista de Bloques en el Correo */}
              <div className="space-y-2.5">
                {blocks.map((block, index) => (
                  <div
                    key={block.id}
                    className="border border-border rounded-xl p-3 bg-background/80 hover:border-border/80 transition-all shadow-xs flex flex-col gap-2.5"
                  >
                    {/* Cabecera del Bloque */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-[10px] font-mono text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {block.type === 'LOGO' && 'Logotipo del Evento'}
                          {block.type === 'HEADING' && 'Encabezado'}
                          {block.type === 'PARTICIPANT_NAME' && 'Nombre del Participante'}
                          {block.type === 'TEXT' && 'Párrafo de Texto'}
                          {block.type === 'DIVIDER' && 'Línea Separadora'}
                          {block.type === 'REGISTRATION_DETAILS' && 'Detalles de Inscripción'}
                          {block.type === 'TICKET_NUMBER' && 'Número de Ticket'}
                          {block.type === 'QR_CODE' && 'Código QR Individual'}
                          {block.type === 'DATE_LOCATION' && 'Fecha y Ubicación'}
                          {block.type === 'SCHEDULE' && 'Cronograma de Actividades'}
                          {block.type === 'BUTTON' && 'Botón con Enlace'}
                          {block.type === 'NOTICE' && 'Aviso Destacado'}
                          {block.type === 'FOOTER' && 'Pie de Página'}
                        </span>
                      </div>

                      {/* Botones de acción del bloque: Reordenar y Eliminar */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 cursor-pointer"
                          title="Mover arriba"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(index, 'down')}
                          disabled={index === blocks.length - 1}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 cursor-pointer"
                          title="Mover abajo"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1 rounded hover:bg-rose-500/10 text-rose-400 cursor-pointer"
                          title="Eliminar bloque"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Contenido editable según el tipo de bloque */}
                    {block.type === 'HEADING' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={block.config.text || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { text: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground font-semibold"
                          placeholder="Texto del título..."
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={block.config.level || 'h1'}
                            onChange={(e) => handleUpdateBlockConfig(block.id, { level: e.target.value as any })}
                            className="px-2 py-1 text-xs bg-muted/40 border border-border rounded text-foreground"
                          >
                            <option value="h1">Nivel H1 (Grande)</option>
                            <option value="h2">Nivel H2 (Mediano)</option>
                            <option value="h3">Nivel H3 (Pequeño)</option>
                          </select>
                          <select
                            value={block.config.align || 'left'}
                            onChange={(e) => handleUpdateBlockConfig(block.id, { align: e.target.value as any })}
                            className="px-2 py-1 text-xs bg-muted/40 border border-border rounded text-foreground"
                          >
                            <option value="left">Izquierda</option>
                            <option value="center">Centrado</option>
                            <option value="right">Derecha</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {block.type === 'TEXT' && (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={block.config.text || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { text: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground resize-none leading-relaxed"
                          placeholder="Texto del párrafo..."
                        />
                        <select
                          value={block.config.align || 'left'}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { align: e.target.value as any })}
                          className="px-2 py-1 text-xs bg-muted/40 border border-border rounded text-foreground"
                        >
                          <option value="left">Alineación Izquierda</option>
                          <option value="center">Centrado</option>
                          <option value="right">Alineación Derecha</option>
                        </select>
                      </div>
                    )}

                    {block.type === 'BUTTON' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={block.config.buttonText || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { buttonText: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground font-semibold"
                          placeholder="Texto del botón..."
                        />
                        <input
                          type="text"
                          value={block.config.buttonUrl || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { buttonUrl: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground font-mono"
                          placeholder="URL del enlace..."
                        />
                      </div>
                    )}

                    {block.type === 'NOTICE' && (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={block.config.noticeText || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { noticeText: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground resize-none"
                          placeholder="Mensaje de aviso..."
                        />
                        <select
                          value={block.config.noticeType || 'info'}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { noticeType: e.target.value as any })}
                          className="px-2 py-1 text-xs bg-muted/40 border border-border rounded text-foreground"
                        >
                          <option value="info">Información (Azul)</option>
                          <option value="warning">Advertencia (Ámbar)</option>
                          <option value="success">Éxito / Confirmación (Verde)</option>
                        </select>
                      </div>
                    )}

                    {block.type === 'PARTICIPANT_NAME' && (
                      <input
                        type="text"
                        value={block.config.text || ''}
                        onChange={(e) => handleUpdateBlockConfig(block.id, { text: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground"
                        placeholder="Ej: Hola, {{nombre}}:"
                      />
                    )}

                    {block.type === 'LOGO' && (
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span>Aplica el logotipo del evento y el color de marca ({primaryColor}).</span>
                        <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: primaryColor }} />
                      </div>
                    )}

                    {block.type === 'QR_CODE' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-primary" />
                        <span>Genera un código QR individual y dinámico para cada asistente.</span>
                      </div>
                    )}

                    {block.type === 'REGISTRATION_DETAILS' && (
                      <div className="text-xs text-muted-foreground">
                        <span>Tabla estructurada con Nombre, Tipo de Entrada e Institución.</span>
                      </div>
                    )}

                    {block.type === 'TICKET_NUMBER' && (
                      <div className="text-xs text-muted-foreground">
                        <span>Caja destacada con el código de registro (ej. BC26-1042).</span>
                      </div>
                    )}

                    {block.type === 'DATE_LOCATION' && (
                      <div className="text-xs text-muted-foreground">
                        <span>Muestra la fecha oficial y el campus/lugar de celebración.</span>
                      </div>
                    )}

                    {block.type === 'SCHEDULE' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-500" />
                        <span>Incluye bloque con las charlas y horarios confirmados del cronograma.</span>
                      </div>
                    )}

                    {block.type === 'DIVIDER' && (
                      <div className="text-xs text-muted-foreground">
                        <span>Línea horizontal divisoria estilizada.</span>
                      </div>
                    )}

                    {block.type === 'FOOTER' && (
                      <div className="text-xs text-muted-foreground">
                        <span>Pie de página legal oficial con referencia a EventGrid.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Modo Editor HTML Avanzado */
            <div className="flex flex-col gap-2.5 h-full">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="text-xs font-bold text-foreground">Editor de Código Fuente HTML</span>
                <span className="text-[11px] text-muted-foreground">Compatible con clientes de correo</span>
              </div>
              <textarea
                value={rawHtml}
                onChange={(e) => handleRawHtmlChange(e.target.value)}
                rows={22}
                className="w-full p-3 font-mono text-xs bg-muted/30 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed resize-y"
                placeholder="<html>...</html>"
              />
              {/* Píldoras de variables disponibles para copiar */}
              <div className="bg-muted/20 border border-border rounded-lg p-2.5">
                <span className="text-[11px] font-bold text-muted-foreground block mb-1.5">
                  Variables dinámicas disponibles (clic para insertar):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleRawHtmlChange(rawHtml + ' ' + v.key)}
                      className="px-2 py-0.5 rounded text-[11px] bg-background border border-border hover:border-primary text-foreground hover:text-primary font-mono cursor-pointer transition-colors"
                      title={v.desc}
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PANEL DERECHO: VISTA PREVIA EN VIVO PERMANENTE (Conmutador Desktop / Móvil iPhone) */}
        <div
          className={`lg:col-span-6 xl:col-span-6 flex flex-col gap-3 bg-card border border-border rounded-xl p-4 shadow-sm min-h-[640px] ${
            mobileTab === 'preview' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Cabecera del Panel de Vista Previa */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Vista Previa en Vivo
              </span>
            </div>

            {/* Selector Desktop / iPhone */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setPreviewViewport('desktop')}
                className={`p-1.5 rounded text-xs flex items-center gap-1 cursor-pointer transition-all ${
                  previewViewport === 'desktop'
                    ? 'bg-card text-primary shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista de escritorio"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">PC</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport('mobile')}
                className={`p-1.5 rounded text-xs flex items-center gap-1 cursor-pointer transition-all ${
                  previewViewport === 'mobile'
                    ? 'bg-card text-primary shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista móvil (iPhone)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">iPhone</span>
              </button>
            </div>
          </div>

          {/* Marco de Vista Previa Aislado (Iframe Sandbox para Máxima Seguridad) */}
          <div className="flex-1 flex items-center justify-center bg-muted/40 p-3 rounded-xl border border-border/70 overflow-hidden">
            <div
              className={`transition-all duration-200 bg-[#0a0707] shadow-lg overflow-hidden flex flex-col ${
                previewViewport === 'mobile'
                  ? 'w-[360px] h-[580px] rounded-[36px] border-[8px] border-slate-800'
                  : 'w-full h-[580px] rounded-xl border border-border'
              }`}
            >
              {/* Barra superior de simulación iPhone */}
              {previewViewport === 'mobile' && (
                <div className="h-5 bg-slate-800 flex items-center justify-center shrink-0">
                  <div className="w-16 h-3 bg-slate-900 rounded-full" />
                </div>
              )}

              {/* Iframe aislado: cero scripts, renderiza en tiempo real */}
              <iframe
                title="Vista Previa de Correo"
                srcDoc={previewHtmlDoc}
                sandbox="allow-same-origin"
                className="w-full flex-1 border-0 bg-[#0a0707]"
              />
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
            <span>Se actualiza automáticamente al escribir o cambiar opciones.</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }} />
              Marca {primaryColor}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
