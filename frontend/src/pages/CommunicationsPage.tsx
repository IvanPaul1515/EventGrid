import React, { useState, useEffect } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { communicationsService } from '../../src/services/communications.service';
import { EmailConfig, EmailTemplate, EmailLog } from '../types';
import {
  Mail,
  Server,
  FileText,
  Send,
  History,
  CheckCircle2,
  AlertTriangle,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Users,
  Copy,
  Info,
  Sparkles,
  Search,
  Filter,
  Check,
} from 'lucide-react';

export const CommunicationsPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  const [activeTab, setActiveTab] = useState<'smtp' | 'templates' | 'bulk' | 'logs'>('templates');

  // Estado SMTP
  const [smtpConfig, setSmtpConfig] = useState<Partial<EmailConfig>>({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromEmail: '',
    fromName: '',
    replyToEmail: '',
    isEnabled: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [smtpFeedback, setSmtpFeedback] = useState<{ type: 'success' | 'error'; message: string; simulated?: boolean } | null>(null);

  // Estado Plantillas
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado Envíos Masivos
  const [bulkTargetGroup, setBulkTargetGroup] = useState<'ALL' | 'PAID' | 'PENDING' | 'ATTENDED' | 'NOT_ATTENDED'>('ALL');
  const [bulkTemplateCode, setBulkTemplateCode] = useState<string>('REMINDER');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkCustomBody, setBulkCustomBody] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkConfirmationModal, setBulkConfirmationModal] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado Historial
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>('');
  const [logsSearch, setLogsSearch] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Cargar datos al cambiar evento o pestaña
  useEffect(() => {
    if (currentEvent) {
      if (activeTab === 'smtp' && isAdmin) {
        loadSmtpConfig();
      } else if (activeTab === 'templates') {
        loadTemplates();
      } else if (activeTab === 'bulk') {
        loadTemplates();
      } else if (activeTab === 'logs') {
        loadLogs();
      }
    }
  }, [currentEvent, activeTab]);

  const loadSmtpConfig = async () => {
    if (!currentEvent) return;
    try {
      const config = await communicationsService.getConfig(currentEvent.id);
      if (config) {
        setSmtpConfig({
          ...config,
          password: '', // Por seguridad no viene la clave real
        });
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadTemplates = async () => {
    if (!currentEvent) return;
    try {
      const data = await communicationsService.getTemplates(currentEvent.id);
      setTemplates(data);
      if (data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0]);
        setTemplateSubject(data[0].subject);
        setTemplateBody(data[0].bodyHtml);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadLogs = async () => {
    if (!currentEvent) return;
    try {
      setLoadingLogs(true);
      const res = await communicationsService.getLogs({
        eventId: currentEvent.id,
        status: logsStatusFilter || undefined,
        search: logsSearch || undefined,
        page: logsPage,
      });
      setLogs(res.logs);
      setLogsTotal(res.total);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Guardar SMTP
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent) return;
    try {
      setSavingSmtp(true);
      setSmtpFeedback(null);
      await communicationsService.saveConfig({
        ...smtpConfig,
        eventId: currentEvent.id,
      });
      setSmtpFeedback({ type: 'success', message: 'Configuración SMTP guardada exitosamente.' });
    } catch (err: any) {
      setSmtpFeedback({ type: 'error', message: err?.response?.data?.message || 'Error al guardar SMTP' });
    } finally {
      setSavingSmtp(false);
    }
  };

  // Probar SMTP
  const handleTestSmtp = async () => {
    if (!currentEvent) return;
    try {
      setTestingSmtp(true);
      setSmtpFeedback(null);
      const res = await communicationsService.testConnection(currentEvent.id, testEmailRecipient || user?.email);
      setSmtpFeedback({
        type: 'success',
        message: res.message,
        simulated: res.simulated,
      });
    } catch (err: any) {
      setSmtpFeedback({
        type: 'error',
        message: err?.response?.data?.message || 'Error durante la prueba de conexión SMTP',
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  // Seleccionar plantilla
  const handleSelectTemplate = (tmpl: EmailTemplate) => {
    setSelectedTemplate(tmpl);
    setTemplateSubject(tmpl.subject);
    setTemplateBody(tmpl.bodyHtml);
    setPreviewTemplate(false);
    setTemplateFeedback(null);
  };

  // Guardar plantilla
  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      setSavingTemplate(true);
      setTemplateFeedback(null);
      const updated = await communicationsService.updateTemplate(selectedTemplate.id, {
        subject: templateSubject,
        bodyHtml: templateBody,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTemplate(updated);
      setTemplateFeedback({ type: 'success', message: 'Plantilla actualizada exitosamente.' });
    } catch (err: any) {
      setTemplateFeedback({ type: 'error', message: err?.response?.data?.message || 'Error al guardar plantilla' });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Enviar Masivo
  const handleConfirmBulkSend = async () => {
    if (!currentEvent) return;
    try {
      setSendingBulk(true);
      setBulkFeedback(null);
      const res = await communicationsService.sendBulkEmail({
        eventId: currentEvent.id,
        templateCode: bulkTemplateCode,
        targetGroup: bulkTargetGroup,
        customSubject: bulkSubject || undefined,
        customBodyHtml: bulkCustomBody || undefined,
      });
      setBulkFeedback({ type: 'success', message: res.message });
      setBulkConfirmationModal(false);
      // Actualizar logs
      if (activeTab === 'logs') loadLogs();
    } catch (err: any) {
      setBulkFeedback({ type: 'error', message: err?.response?.data?.message || 'Error en envío masivo' });
      setBulkConfirmationModal(false);
    } finally {
      setSendingBulk(false);
    }
  };

  const copyVariable = (varName: string) => {
    navigator.clipboard.writeText(`{{${varName}}}`);
    alert(`Variable {{${varName}}} copiada al portapapeles`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              Comunicaciones & Sistema de Correos
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Gestión de plantillas dinámicas, entradas digitales por correo, envíos masivos y conexión SMTP de <strong>{currentEvent?.name}</strong>.
          </p>
        </div>

        {/* Pestañas */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('smtp')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'smtp'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Configuración SMTP</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Plantillas</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('bulk')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'bulk'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Envíos Masivos</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial</span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: CONFIGURACIÓN SMTP */}
      {activeTab === 'smtp' && isAdmin && (
        <div className="space-y-6 max-w-3xl">
          {smtpFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                smtpFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              {smtpFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <div>
                <p>{smtpFeedback.message}</p>
                {smtpFeedback.simulated && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Modo seguro activo: La verificación se realizó en entorno simulado sin conectar con servidores externos.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSaveSmtp} className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <Server className="w-4 h-4 text-primary" />
              Parámetros de Servidor SMTP Saliente
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Servidor SMTP (Host)
                </label>
                <input
                  type="text"
                  value={smtpConfig.host || ''}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                  placeholder="smtp.gmail.com / mail.ejemplo.com"
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Puerto SMTP
                </label>
                <input
                  type="number"
                  value={smtpConfig.port || 587}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, port: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Usuario / Correo Autenticación
                </label>
                <input
                  type="text"
                  value={smtpConfig.user || ''}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                  placeholder="notificaciones@barcamp.org.do"
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Contraseña SMTP (Oculta)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={smtpConfig.password || ''}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                    placeholder="Dejar en blanco para no modificar"
                    className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Correo Remitente Visible (From)
                </label>
                <input
                  type="email"
                  value={smtpConfig.fromEmail || ''}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                  placeholder="tickets@eventgrid.app"
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  Nombre del Remitente Visible
                </label>
                <input
                  type="text"
                  value={smtpConfig.fromName || ''}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                  placeholder="EventGrid — BarCamp RD"
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={smtpConfig.secure ?? false}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Usar SSL/TLS Directo (Puerto 465)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={smtpConfig.isEnabled ?? true}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, isEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Habilitar servicio de correos</span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="correo.prueba@ejemplo.com"
                  className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs w-56 font-mono"
                />
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={testingSmtp}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs border border-border transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testingSmtp ? 'Probando...' : 'Probar Conexión'}
                </button>
              </div>

              <button
                type="submit"
                disabled={savingSmtp}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSmtp ? 'Guardando...' : 'Guardar Configuración SMTP'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PESTAÑA 2: PLANTILLAS DE CORREO */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Plantillas */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Plantillas del Evento ({templates.length})
            </h3>
            <div className="space-y-1.5">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all cursor-pointer ${
                    selectedTemplate?.id === tmpl.id
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-sm'
                      : 'bg-card border-border hover:bg-muted/60 text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{tmpl.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{tmpl.code}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-1">
                    {tmpl.subject}
                  </p>
                </button>
              ))}
            </div>

            {/* Listado de Variables Disponibles */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-2 mt-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Variables Dinámicas Disponibles
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Haga clic en cualquiera para copiarla al portapapeles:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'nombre_completo',
                  'primer_nombre',
                  'apellido',
                  'numero_registro',
                  'tipo_entrada',
                  'precio_entrada',
                  'balance_pendiente',
                  'nombre_evento',
                  'lugar_evento',
                  'fecha_evento',
                  'qr_token',
                  'enlace_entrada',
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => copyVariable(v)}
                    className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono font-medium text-foreground border border-border cursor-pointer transition-colors"
                    title={`Copiar {{${v}}}`}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editor de la Plantilla Seleccionada */}
          <div className="lg:col-span-2 space-y-4">
            {selectedTemplate ? (
              <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
                {templateFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      templateFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {templateFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{templateFeedback.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{selectedTemplate.name}</h3>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">
                      Código: {selectedTemplate.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(!previewTemplate)}
                      className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground border border-border transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{previewTemplate ? 'Ver Código HTML' : 'Ver Vista Previa'}</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleSaveTemplate}
                        disabled={savingTemplate}
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingTemplate ? 'Guardando...' : 'Guardar Plantilla'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1.5">
                    Asunto del Mensaje
                  </label>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1.5">
                    {previewTemplate ? 'Vista Previa del Correo' : 'Cuerpo HTML de la Plantilla'}
                  </label>

                  {previewTemplate ? (
                    <div className="p-4 rounded-xl bg-background border border-border min-h-[300px] max-h-[500px] overflow-y-auto">
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-xs"
                        dangerouslySetInnerHTML={{
                          __html: templateBody
                            .replace(/\{\{nombre_completo\}\}/g, 'Juan Carlos Pérez')
                            .replace(/\{\{primer_nombre\}\}/g, 'Juan')
                            .replace(/\{\{numero_registro\}\}/g, 'BC26-0042')
                            .replace(/\{\{tipo_entrada\}\}/g, 'General (Preventa)')
                            .replace(/\{\{nombre_evento\}\}/g, currentEvent?.name || 'BarCamp RD 2026')
                            .replace(/\{\{lugar_evento\}\}/g, currentEvent?.venue || 'PUCMM Santiago')
                            .replace(/\{\{fecha_evento\}\}/g, '20 de Octubre de 2026')
                            .replace(/\{\{qr_token\}\}/g, 'eg_qr_demo_token_12345'),
                        }}
                      />
                    </div>
                  ) : (
                    <textarea
                      value={templateBody}
                      onChange={(e) => setTemplateBody(e.target.value)}
                      rows={14}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground bg-card rounded-2xl border border-border text-xs">
                Seleccione una plantilla del listado para editarla o consultar su contenido.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 3: ENVÍOS MASIVOS */}
      {activeTab === 'bulk' && isAdmin && (
        <div className="space-y-6 max-w-3xl">
          {bulkFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                bulkFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{bulkFeedback.message}</span>
            </div>
          )}

          <div className="p-6 rounded-2xl bg-card border border-border space-y-5">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <Users className="w-4 h-4 text-primary" />
              Envío Masivo Controlado a Grupos de Participantes
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1.5">
                  Grupo Destinatario
                </label>
                <select
                  value={bulkTargetGroup}
                  onChange={(e) => setBulkTargetGroup(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ALL">Todos los participantes registrados en la edición</option>
                  <option value="PAID">Participantes con pago completado</option>
                  <option value="PENDING">Participantes con balance pendiente de pago</option>
                  <option value="ATTENDED">Participantes que ya asistieron (Check-in registrado)</option>
                  <option value="NOT_ATTENDED">Participantes que aún no han llegado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1.5">
                  Plantilla a Emitir
                </label>
                <select
                  value={bulkTemplateCode}
                  onChange={(e) => setBulkTemplateCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1.5">
                  Asunto Personalizado (Opcional)
                </label>
                <input
                  type="text"
                  value={bulkSubject}
                  onChange={(e) => setBulkSubject(e.target.value)}
                  placeholder="Dejar en blanco para usar el asunto original de la plantilla"
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Protección de pruebas: Si el evento se encuentra en Modo Demo o en entorno de evaluación sin credenciales SMTP de producción configuradas, todos los envíos serán simulados de forma segura y registrados en el historial con estado <strong>SIMULATED</strong>.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setBulkConfirmationModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Preparar Envío Masivo</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal de Confirmación Obligatoria Masiva */}
          {bulkConfirmationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-primary">
                  <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm">Confirmación de Envío Masivo</h4>
                    <p className="text-xs text-muted-foreground">Emisión masiva de correos electrónicos</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  ¿Desea confirmar el envío de la plantilla seleccionada al grupo <strong>{bulkTargetGroup}</strong> para el evento <strong>{currentEvent?.name}</strong>?
                </p>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setBulkConfirmationModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBulkSend}
                    disabled={sendingBulk}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {sendingBulk ? 'Enviando correos...' : 'Confirmar Envío'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 4: HISTORIAL DE ENVÍOS (LOGS) */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={logsSearch}
                onChange={(e) => setLogsSearch(e.target.value)}
                placeholder="Buscar por correo o asunto..."
                className="w-full max-w-xs px-3 py-1.5 bg-background border border-border rounded-lg text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={logsStatusFilter}
                onChange={(e) => setLogsStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-medium"
              >
                <option value="">Todos los Estados</option>
                <option value="SENT">Enviados (SENT)</option>
                <option value="SIMULATED">Simulados (SIMULATED)</option>
                <option value="FAILED">Fallidos (FAILED)</option>
              </select>

              <button
                type="button"
                onClick={loadLogs}
                disabled={loadingLogs}
                className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs border border-border transition-colors cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Destinatario</th>
                    <th className="px-4 py-3">Plantilla</th>
                    <th className="px-4 py-3">Asunto</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha y Hora</th>
                    <th className="px-4 py-3">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        Cargando historial de comunicaciones...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No se registran envíos de correos para esta edición.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-foreground">{log.recipientName}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{log.recipientEmail}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded border border-border text-foreground">
                            {log.templateCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 truncate max-w-xs">{log.subject}</td>
                        <td className="px-4 py-3">
                          {log.status === 'SENT' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              ENVIADO
                            </span>
                          ) : log.status === 'SIMULATED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                              SIMULADO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30" title={log.errorMessage}>
                              FALLIDO
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {log.sentByUser?.fullName || 'Sistema'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
