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
  onChangeSubject?: (subject: string) => void;
  onChangeHtml?: (html: string) => void;
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
];

export const VisualEmailEditor: React.FC<VisualEmailEditorProps> = ({
  initialSubject = '',
  initialHtml = '',
  onChangeSubject,
  onChangeHtml,
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

  // Asunto y contenido HTML
  const [subject, setSubject] = useState(initialSubject);
  const [rawHtml, setRawHtml] = useState(initialHtml);

  // Lista de bloques
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
              <td align="center" style="padding: 24px 20px 16px 20px; background-color: ${primaryColor};">
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
                <h${b.config.level === 'h1' ? '1' : b.config.level === 'h2' ? '2' : '3'} style="margin: 0; font-size: ${fontSize}; font-weight: 700; color: #111827; line-height: 1.3;">
                  ${b.config.text || ''}
                </h${b.config.level === 'h1' ? '1' : b.config.level === 'h2' ? '2' : '3'}>
              </td>
            </tr>
          `;
        case 'PARTICIPANT_NAME':
          return `
            <tr>
              <td style="padding: 12px 24px 6px 24px;">
                <div style="font-size: 16px; font-weight: 600; color: #374151;">
                  ${b.config.text || 'Estimado(a) {{nombre}}:'}
                </div>
              </td>
            </tr>
          `;
        case 'TEXT':
          return `
            <tr>
              <td align="${b.config.align || 'left'}" style="padding: 8px 24px; font-size: 14px; line-height: 1.6; color: #4b5563;">
                ${b.config.text || ''}
              </td>
            </tr>
          `;
        case 'DIVIDER':
          return `
            <tr>
              <td style="padding: 16px 24px;">
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 0;" />
              </td>
            </tr>
          `;
        case 'REGISTRATION_DETAILS':
          return `
            <tr>
              <td style="padding: 14px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">Participante:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #111827;">{{nombre}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">Tipo de Entrada:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #111827;">{{tipo_entrada}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">Institución:</td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #111827;">{{institucion}}</td>
                  </tr>
                </table>
              </td>
            </tr>
          `;
        case 'TICKET_NUMBER':
          return `
            <tr>
              <td align="center" style="padding: 12px 24px;">
                <div style="display: inline-block; background-color: #f3f4f6; border: 2px dashed ${primaryColor}; border-radius: 8px; padding: 10px 24px;">
                  <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6b7280; display: block; letter-spacing: 1px;">Número de Registro</span>
                  <span style="font-size: 22px; font-weight: 800; font-family: monospace; color: #111827;">{{numero_registro}}</span>
                </div>
              </td>
            </tr>
          `;
        case 'QR_CODE':
          return `
            <tr>
              <td align="center" style="padding: 18px 24px;">
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                  {{qr}}
                  <p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; font-weight: 500;">Presenta este código en el acceso principal</p>
                </div>
              </td>
            </tr>
          `;
        case 'DATE_LOCATION':
          return `
            <tr>
              <td style="padding: 10px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                  <tr>
                    <td style="font-size: 13px; color: #334155;">
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
                  <strong style="font-size: 13px; color: #111827;">Cronograma Destacado</strong>
                  <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">09:00 AM — Apertura y Keynote Inaugural<br/>10:30 AM — Inicio de Sesiones Técnicas Simultáneas</p>
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
              <td align="center" style="padding: 24px 20px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
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
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.07); border: 1px solid #e5e7eb;">
          ${renderedBlocks.join('')}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  };

  // Re-generar HTML al cambiar bloques si está en modo bloques
  useEffect(() => {
    if (editorMode === 'blocks') {
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
    const newId = `b-${Date.now()}`;
    let newConfig: any = {};
    if (type === 'HEADING') newConfig = { text: 'Nuevo Encabezado', level: 'h2', align: 'left' };
    if (type === 'TEXT') newConfig = { text: 'Escribe tu párrafo informativo aquí.', align: 'left' };
    if (type === 'BUTTON') newConfig = { buttonText: 'Confirmar Asistencia', buttonUrl: '#' };
    if (type === 'NOTICE') newConfig = { noticeType: 'info', noticeText: 'Aviso importante sobre el evento.' };

    setBlocks([...blocks, { id: newId, type, config: newConfig }]);
  };

  const handleRemoveBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    const newBlocks = [...blocks];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIdx];
    newBlocks[targetIdx] = temp;
    setBlocks(newBlocks);
  };

  const handleUpdateBlockConfig = (id: string, updates: Partial<EmailBlock['config']>) => {
    setBlocks(
      blocks.map((b) => (b.id === id ? { ...b, config: { ...b.config, ...updates } } : b))
    );
  };

  // Generar HTML final para el iframe de vista previa con datos de muestra (o del participante seleccionado)
  const previewHtmlDoc = useMemo(() => {
    let html = editorMode === 'blocks' ? renderBlocksToHtml(blocks) : rawHtml;

    // Datos para sustitución segura
    const pName = selectedParticipant?.fullName || 'María Pérez Fernández';
    const pEmail = selectedParticipant?.email || 'maria.perez@ejemplo.edu.do';
    const pTicket = selectedParticipant?.registrationNumber || 'BC26-1042';
    const pType = selectedParticipant?.ticketType || 'Entrada General';
    const pInst = selectedParticipant?.institution || 'Pontificia Universidad Católica Madre y Maestra';
    const eDate = currentEvent?.startDate ? new Date(currentEvent.startDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : '24 de Octubre de 2026';
    const eVenue = currentEvent?.venue || 'Campus Principal, Santo Domingo';

    const mockQrSvg = `
      <div style="background-color: #000000; padding: 12px; display: inline-block; border-radius: 8px;">
        <svg width="140" height="140" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#ffffff" />
          <rect x="10" y="10" width="25" height="25" fill="#000000" />
          <rect x="65" y="10" width="25" height="25" fill="#000000" />
          <rect x="10" y="65" width="25" height="25" fill="#000000" />
          <rect x="15" y="15" width="15" height="15" fill="#ffffff" />
          <rect x="70" y="15" width="15" height="15" fill="#ffffff" />
          <rect x="15" y="70" width="15" height="15" fill="#ffffff" />
          <rect x="18" y="18" width="9" height="9" fill="#000000" />
          <rect x="73" y="18" width="9" height="9" fill="#000000" />
          <rect x="18" y="73" width="9" height="9" fill="#000000" />
          <rect x="45" y="45" width="10" height="10" fill="#000000" />
          <rect x="40" y="20" width="15" height="8" fill="#000000" />
          <rect x="40" y="72" width="15" height="8" fill="#000000" />
          <rect x="72" y="45" width="8" height="15" fill="#000000" />
        </svg>
      </div>
    `;

    // Reemplazos de variables de plantilla
    html = html.split('{{nombre}}').join(pName);
    html = html.split('{{email}}').join(pEmail);
    html = html.split('{{numero_registro}}').join(pTicket);
    html = html.split('{{tipo_entrada}}').join(pType);
    html = html.split('{{institucion}}').join(pInst);
    html = html.split('{{evento}}').join(eventName);
    html = html.split('{{fecha}}').join(eDate);
    html = html.split('{{lugar}}').join(eVenue);
    html = html.split('{{qr}}').join(mockQrSvg);

    return html;
  }, [blocks, rawHtml, editorMode, selectedParticipant, currentEvent, eventName, primaryColor, eventLogo]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Barra de Controles Superiores: Modo de edición, Selector de Asunto y Vistas */}
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

        {/* Selector de Modo Bloques vs HTML y Viewport Desktop/Mobile */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
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

          {/* Toggle móvil en pantallas pequeñas */}
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

      {/* Layout de dos paneles en Desktop (Izquierda: Edición, Derecha: Vista Previa en Vivo) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-h-[580px]">
        {/* PANEL IZQUIERDO: REDACCIÓN Y BLOQUES (Visible siempre en PC, condicional en móvil) */}
        <div
          className={`lg:col-span-6 xl:col-span-6 flex flex-col gap-3.5 bg-card border border-border rounded-xl p-4 shadow-sm max-h-[750px] overflow-y-auto ${
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
                  <span className="text-[11px] text-muted-foreground">Haz clic para agregar</span>
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

              {/* Lista Ordenable y Configurable de Bloques */}
              <div className="space-y-2.5">
                {blocks.map((block, index) => (
                  <div
                    key={block.id}
                    className="border border-border rounded-xl p-3 bg-background shadow-xs hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-border/60 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                          Bloque: {block.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 cursor-pointer"
                          title="Mover arriba"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(index, 'down')}
                          disabled={index === blocks.length - 1}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 cursor-pointer"
                          title="Mover abajo"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-500/10 cursor-pointer ml-1"
                          title="Eliminar bloque"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Contenido editable según tipo de bloque */}
                    {block.type === 'HEADING' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={block.config.text || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { text: e.target.value })}
                          placeholder="Texto del título"
                          className="w-full px-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <div className="flex items-center gap-4 text-xs">
                          <label className="flex items-center gap-1 text-muted-foreground">
                            <span>Nivel:</span>
                            <select
                              value={block.config.level || 'h1'}
                              onChange={(e) => handleUpdateBlockConfig(block.id, { level: e.target.value as any })}
                              className="px-2 py-0.5 bg-background border border-border rounded text-xs"
                            >
                              <option value="h1">H1 (Grande)</option>
                              <option value="h2">H2 (Mediano)</option>
                              <option value="h3">H3 (Pequeño)</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1 text-muted-foreground">
                            <span>Alineación:</span>
                            <select
                              value={block.config.align || 'center'}
                              onChange={(e) => handleUpdateBlockConfig(block.id, { align: e.target.value as any })}
                              className="px-2 py-0.5 bg-background border border-border rounded text-xs"
                            >
                              <option value="left">Izquierda</option>
                              <option value="center">Centrado</option>
                              <option value="right">Derecha</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )}

                    {(block.type === 'TEXT' || block.type === 'PARTICIPANT_NAME') && (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={block.config.text || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { text: e.target.value })}
                          placeholder="Contenido del mensaje..."
                          className="w-full px-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Info className="w-3 h-3 text-primary" />
                          <span>Puedes incluir variables como {`{{nombre}}`} o {`{{evento}}`}.</span>
                        </div>
                      </div>
                    )}

                    {block.type === 'BUTTON' && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Texto del Botón</label>
                          <input
                            type="text"
                            value={block.config.buttonText || ''}
                            onChange={(e) => handleUpdateBlockConfig(block.id, { buttonText: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs bg-muted/40 border border-border rounded-lg text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">URL Enlace</label>
                          <input
                            type="text"
                            value={block.config.buttonUrl || ''}
                            onChange={(e) => handleUpdateBlockConfig(block.id, { buttonUrl: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs bg-muted/40 border border-border rounded-lg text-foreground"
                          />
                        </div>
                      </div>
                    )}

                    {block.type === 'NOTICE' && (
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground">Tipo de Aviso:</span>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`notice-${block.id}`}
                              checked={block.config.noticeType === 'info'}
                              onChange={() => handleUpdateBlockConfig(block.id, { noticeType: 'info' })}
                            />
                            <span>Informativo</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`notice-${block.id}`}
                              checked={block.config.noticeType === 'warning'}
                              onChange={() => handleUpdateBlockConfig(block.id, { noticeType: 'warning' })}
                            />
                            <span>Advertencia</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`notice-${block.id}`}
                              checked={block.config.noticeType === 'success'}
                              onChange={() => handleUpdateBlockConfig(block.id, { noticeType: 'success' })}
                            />
                            <span>Éxito</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={block.config.noticeText || ''}
                          onChange={(e) => handleUpdateBlockConfig(block.id, { noticeText: e.target.value })}
                          placeholder="Texto destacado de aviso"
                          className="w-full px-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground"
                        />
                      </div>
                    )}

                    {block.type === 'LOGO' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Image className="w-4 h-4 text-primary" />
                        <span>Encabezado con color oficial ({primaryColor}) y logo del evento.</span>
                      </div>
                    )}

                    {block.type === 'QR_CODE' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-emerald-500" />
                        <span>Generará dinámicamente el código QR individual único de cada participante.</span>
                      </div>
                    )}

                    {block.type === 'REGISTRATION_DETAILS' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <FileBadge className="w-4 h-4 text-primary" />
                        <span>Muestra tarjeta con Nombre, Entrada e Institución del destinatario.</span>
                      </div>
                    )}

                    {block.type === 'TICKET_NUMBER' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-500" />
                        <span>Inserta el número de registro oficial con marco punteado.</span>
                      </div>
                    )}

                    {block.type === 'DATE_LOCATION' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <span>Muestra fecha oficial y sede física configuradas para la edición.</span>
                      </div>
                    )}

                    {block.type === 'SCHEDULE' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-500" />
                        <span>Incluye bloque con horas destacadas de keynote y conferencias.</span>
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
                <span className="text-[11px] text-muted-foreground">Compatible con tablas de correo estándar</span>
              </div>
              <textarea
                value={rawHtml}
                onChange={(e) => handleRawHtmlChange(e.target.value)}
                rows={22}
                className="w-full p-3 font-mono text-xs bg-muted/30 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                placeholder="<html>...</html>"
              />
              {/* Píldoras de variables disponibles para copiar */}
              <div className="bg-muted/20 border border-border rounded-lg p-2.5">
                <span className="text-[11px] font-bold text-muted-foreground block mb-1.5">
                  Variables dinámicas disponibles:
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

        {/* PANEL DERECHO: VISTA PREVIA EN VIVO (Conmutador Desktop / Móvil iPhone) */}
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
                <span className="hidden sm:inline text-[11px]">Móvil</span>
              </button>
            </div>
          </div>

          {/* Marco de Vista Previa Aislado (Iframe Sandbox para Máxima Seguridad) */}
          <div className="flex-1 flex items-center justify-center bg-muted/40 p-3 rounded-xl border border-border/70 overflow-hidden">
            <div
              className={`transition-all duration-200 bg-white shadow-lg overflow-hidden flex flex-col ${
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

              {/* Iframe aislado: no scripts, no acceso al DOM del panel */}
              <iframe
                title="Vista Previa de Correo"
                srcDoc={previewHtmlDoc}
                sandbox="allow-same-origin"
                className="w-full flex-1 border-0 bg-white"
              />
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
            <span>Renderizado seguro en tiempo real sin scripts externos.</span>
            <span>Colores de edición aplicados ({primaryColor})</span>
          </div>
        </div>
      </div>
    </div>
  );
};
