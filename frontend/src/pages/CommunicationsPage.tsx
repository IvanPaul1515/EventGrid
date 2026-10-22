import React, { useState, useEffect, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { VisualEmailEditor } from '../components/communications/VisualEmailEditor';
import { communicationsService, EmailPreviewResult, EmailBatchJobInfo } from '../services/communications.service';
import { participantsService } from '../services/participants.service';
import { EmailConfig, EmailTemplate, EmailLog, Registration } from '../types';
import {
  Mail,
  Server,
  FileText,
  Send,
  History,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  RotateCcw,
  Eye,
  Users,
  Copy,
  Info,
  Sparkles,
  Search,
  Filter,
  Check,
  Smartphone,
  Monitor,
  X,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Loader2,
  ArrowRight,
  Layers,
  RefreshCw,
  StopCircle,
  Play,
} from 'lucide-react';

export const CommunicationsPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole(['ADMIN']);

  // Pestañas: 1. Redactar y enviar, 2. Plantillas, 3. Envíos masivos, 4. Historial y seguimiento
  const [activeTab, setActiveTab] = useState<'compose' | 'templates' | 'bulk' | 'batches' | 'logs'>('compose');

  // Estado del servicio SMTP (para banner informativo en cabecera)
  const [serviceConfig, setServiceConfig] = useState<EmailConfig | null>(null);

  // ==========================================
  // ESTADO 5: COLA Y LOTES PERSISTENTES (Fase 4)
  // ==========================================
  const [batchJobs, setBatchJobs] = useState<EmailBatchJobInfo[]>([]);
  const [loadingBatchJobs, setLoadingBatchJobs] = useState(false);
  const [selectedBatchJob, setSelectedBatchJob] = useState<(EmailBatchJobInfo & { items: any[] }) | null>(null);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null);
  const [uncertainModalOpen, setUncertainModalOpen] = useState(false);
  const [uncertainTargetBatchId, setUncertainTargetBatchId] = useState<string | null>(null);
  const [uncertainCount, setUncertainCount] = useState<number>(0);
  const [confirmedDuplicateRisk, setConfirmedDuplicateRisk] = useState(false);
  const [uncertainReason, setUncertainReason] = useState("");
  const [retryingUncertain, setRetryingUncertain] = useState(false);

  // ==========================================
  // ESTADO 1: REDACTAR Y ENVIAR (INDIVIDUAL)
  // ==========================================
  const [participantSearch, setParticipantSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Registration[]>([]);
  const [searchingParticipants, setSearchingParticipants] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);

  const [composeTemplateCode, setComposeTemplateCode] = useState('DIGITAL_TICKET');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeCustomMessage, setComposeCustomMessage] = useState('');
  const [composeBodyHtml, setComposeBodyHtml] = useState('');
  const [sendingSingle, setSendingSingle] = useState(false);
  const [singleFeedback, setSingleFeedback] = useState<{ type: 'success' | 'error'; message: string; simulated?: boolean } | null>(null);

  // Envío de prueba individual
  const [showTestSendModal, setShowTestSendModal] = useState(false);
  const [testSendRecipient, setTestSendRecipient] = useState('');
  const [sendingTestMail, setSendingTestMail] = useState(false);

  // ==========================================
  // ESTADO 2: VISTA PREVIA REAL (QA-11)
  // ==========================================
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewResult | null>(null);

  // ==========================================
  // ESTADO 3: PLANTILLAS
  // ==========================================
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // ==========================================
  // ESTADO 4: ENVÍOS MASIVOS (WIZARD GUIADO)
  // ==========================================
  const [bulkStep, setBulkStep] = useState<1 | 2 | 3 | 4>(1);
  const [bulkTargetGroup, setBulkTargetGroup] = useState<
    'ALL' | 'CONFIRMED' | 'PAID' | 'PENDING' | 'PENDING_PAYMENT' | 'PARTIAL' | 'COURTESY' | 'ATTENDED' | 'NOT_ATTENDED'
  >('ALL');
  const [bulkTicketTypeId, setBulkTicketTypeId] = useState<string>('');
  const [bulkDateFrom, setBulkDateFrom] = useState<string>('');
  const [bulkDateTo, setBulkDateTo] = useState<string>('');
  const [bulkQuotaWarning, setBulkQuotaWarning] = useState<string | null>(null);
  const [bulkTemplateCode, setBulkTemplateCode] = useState<string>('EVENT_REMINDER');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkCustomMessage, setBulkCustomMessage] = useState('');
  const [bulkRecipientsPreview, setBulkRecipientsPreview] = useState<Registration[]>([]);
  const [bulkStats, setBulkStats] = useState({
    total: 0,
    eligible: 0,
    validEmails: 0,
    invalidEmails: 0,
    cancelled: 0,
    demo: 0,
    duplicates: 0,
  });
  const [bulkSampleRecipients, setBulkSampleRecipients] = useState<any[]>([]);
  const [bulkSimulateOnly, setBulkSimulateOnly] = useState(false);
  const [bulkDeliveryMode, setBulkDeliveryMode] = useState<'REAL' | 'SIMULATION'>('REAL');
  const [confirmedBulkDemoSending, setConfirmedBulkDemoSending] = useState(false);
  const [singleSimulateOnly, setSingleSimulateOnly] = useState(false);
  const [previewSampleType, setPreviewSampleType] = useState<'MOCK' | 'PARTICIPANT'>('MOCK');
  const [loadingBulkStats, setLoadingBulkStats] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total: number;
    sent: number;
    simulated: number;
    failed: number;
    batchId?: string;
    message: string;
  } | null>(null);

  // ==========================================
  // ESTADO 5: HISTORIAL Y SEGUIMIENTO
  // ==========================================
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>('ALL');
  const [logsSearch, setLogsSearch] = useState('');
  const [logsBatchFilter, setLogsBatchFilter] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  // Estados para control de duplicados y filtros inteligentes (Fase QA Integral)
  const [singleDuplicateWarning, setSingleDuplicateWarning] = useState<{
    message: string;
    previousSentAt?: string;
  } | null>(null);
  const [singleResendReason, setSingleResendReason] = useState('Reenvío autorizado expresamente');
  const [excludeAlreadyNotified, setExcludeAlreadyNotified] = useState(true);
  const [forceResendBulk, setForceResendBulk] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [excludedList, setExcludedList] = useState<Array<{ registrationId: string; fullName: string; email: string; reason: string }>>([]);
  const [todaySentByEventGrid, setTodaySentByEventGrid] = useState(0);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [alreadyNotifiedCount, setAlreadyNotifiedCount] = useState(0);
  const [logsTemplateFilter, setLogsTemplateFilter] = useState('ALL');
  const [logsDateFrom, setLogsDateFrom] = useState('');
  const [logsDateTo, setLogsDateTo] = useState('');


  // Cargar estado inicial
  useEffect(() => {
    if (currentEvent) {
      loadServiceStatus();
      loadTemplates();
      if (activeTab === 'logs') {
        loadLogs();
      }
    }
  }, [currentEvent, activeTab]);

  const loadBatchJobs = async () => {
    if (!currentEvent) return;
    try {
      setLoadingBatchJobs(true);
      const jobs = await communicationsService.getBatchJobs(currentEvent.id);
      setBatchJobs(jobs);
    } catch (err) {
      console.error('Error cargando lotes de correo:', err);
    } finally {
      setLoadingBatchJobs(false);
    }
  };

  const handleCancelBatch = async (jobId: string) => {
    if (!confirm('¿Está seguro de que desea cancelar los envíos pendientes de este lote?')) return;
    try {
      setCancellingBatchId(jobId);
      await communicationsService.cancelBatchJob(jobId);
      await loadBatchJobs();
      if (selectedBatchJob?.id === jobId) {
        const updated = await communicationsService.getBatchJob(jobId);
        setSelectedBatchJob(updated);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Error al cancelar el lote');
    } finally {
      setCancellingBatchId(null);
    }
  };

  const handleRetryFailedBatch = async (jobId: string) => {
    try {
      setRetryingBatchId(jobId);
      await communicationsService.retryFailedBatchJob(jobId);
      await loadBatchJobs();
      if (selectedBatchJob?.id === jobId) {
        const updated = await communicationsService.getBatchJob(jobId);
        setSelectedBatchJob(updated);
      }
      alert('Reintento de correos fallidos programado correctamente.');
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Error al reintentar envíos fallidos');
    } finally {
      setRetryingBatchId(null);
    }
  };

  const handleOpenRetryUncertainModal = (job: any) => {
    const uncertain = job.items ? job.items.filter((i: any) => i.status === 'UNKNOWN_DELIVERY_STATUS').length : (job.failedCount || 0);
    setUncertainTargetBatchId(job.id);
    setUncertainCount(uncertain);
    setConfirmedDuplicateRisk(false);
    setUncertainReason('');
    setUncertainModalOpen(true);
  };

  const handleConfirmRetryUncertain = async () => {
    if (!uncertainTargetBatchId) return;
    if (!confirmedDuplicateRisk) {
      alert('Debe confirmar explícitamente que comprende y acepta el riesgo de enviar correos duplicados.');
      return;
    }
    if (!uncertainReason.trim() || uncertainReason.trim().length < 5) {
      alert('Debe especificar un motivo justificado (mínimo 5 caracteres).');
      return;
    }
    try {
      setRetryingUncertain(true)
      await communicationsService.retryUncertainBatchJob(uncertainTargetBatchId, {
        confirmedDuplicateRisk: true,
        reason: uncertainReason.trim(),
      });
      setUncertainModalOpen(false);
      await loadBatchJobs();
      if (selectedBatchJob?.id === uncertainTargetBatchId) {
        const updated = await communicationsService.getBatchJob(uncertainTargetBatchId);
        setSelectedBatchJob(updated);
      }
      alert('Reintento de envíos inciertos autorizado y programado correctamente.');
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Error al autorizar reintento de inciertos');
    } finally {
      setRetryingUncertain(false);
    }
  };

  const loadServiceStatus = async () => {
    if (!currentEvent) return;
    try {
      const config = await communicationsService.getConfig(currentEvent.id);
      setServiceConfig(config);
    } catch (err) {
      console.error('Error cargando estado de servicio SMTP:', err);
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
      if (data.length > 0 && !composeSubject) {
        const defaultTmpl = data.find((t) => t.code === 'DIGITAL_TICKET') || data.find((t) => t.code === 'INSCRIPTION_CONFIRMATION') || data[0];
        setComposeTemplateCode(defaultTmpl.code);
        setComposeSubject(defaultTmpl.subject);
        setComposeBodyHtml(defaultTmpl.bodyHtml);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Buscar participantes para redactar individual
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (participantSearch.trim().length >= 2 && currentEvent) {
        try {
          setSearchingParticipants(true);
          const res = await participantsService.list({
            search: participantSearch.trim(),
            limit: 8,
          });
          setSearchResults(res.data);
        } catch (err) {
          console.error(err);
        } finally {
          setSearchingParticipants(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [participantSearch, currentEvent]);

  // Manejar cambio de plantilla en Redactar
  const handleComposeTemplateChange = (code: string) => {
    setComposeTemplateCode(code);
    const tmpl = templates.find((t) => t.code === code);
    if (tmpl) {
      setComposeSubject(tmpl.subject);
      setComposeBodyHtml(tmpl.bodyHtml);
    }
  };

  // Abrir Vista Previa Real (QA-11)
  const handleOpenPreview = async (templateCode: string, customSub?: string, customBody?: string, customMsg?: string) => {
    try {
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      const res = await communicationsService.previewEmail({
        eventId: currentEvent?.id,
        registrationId: selectedRegistration?.id || null,
        templateCode,
        customSubject: customSub || null,
        customBodyHtml: customBody || null,
        customMessage: customMsg || null,
      });
      setPreviewData(res);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al generar la vista previa del correo.');
      setPreviewModalOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Enviar correo individual con protección contra duplicados (Fase QA Integral)
  const handleSendSingleEmail = async (force = false) => {
    if (!selectedRegistration || !currentEvent) return;
    try {
      setSendingSingle(true);
      setSingleFeedback(null);
      const res = await communicationsService.sendSingleEmail({
        eventId: currentEvent.id,
        registrationId: selectedRegistration.id,
        templateCode: composeTemplateCode,
        customSubject: composeSubject || undefined,
        customBodyHtml: composeBodyHtml || undefined,
        customMessage: composeCustomMessage || undefined,
        forceResend: force,
        confirmedResend: force,
        resendReason: force ? singleResendReason : undefined,
      });

      setSingleFeedback({
        type: 'success',
        message: res.message,
        simulated: res.status === 'SIMULATED',
      });
      setSingleDuplicateWarning(null);
    } catch (err: any) {
      const isDup =
        err?.response?.data?.details?.code === 'DUPLICATE_COMMUNICATION_WARNING' ||
        err?.response?.data?.message?.includes('¿Deseas reenviarlo?');

      if (isDup && !force) {
        setSingleDuplicateWarning({
          message: err?.response?.data?.message || 'Este participante ya recibió un envío de este tipo.',
          previousSentAt: err?.response?.data?.details?.previousSentAt,
        });
      } else {
        setSingleFeedback({
          type: 'error',
          message: err?.response?.data?.message || 'Error al enviar correo.',
        });
      }
    } finally {
      setSendingSingle(false);
    }
  };

  // Enviar correo de prueba para Redactar
  const handleSendTestMail = async () => {
    if (!testSendRecipient || !testSendRecipient.includes('@')) {
      alert('Por favor ingrese un correo válido para recibir la prueba.');
      return;
    }
    try {
      setSendingTestMail(true);
      const res = await communicationsService.testConnection(currentEvent?.id, testSendRecipient.trim());
      alert(res.message);
      setShowTestSendModal(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al enviar prueba.');
    } finally {
      setSendingTestMail(false);
    }
  };

  // Guardar plantilla
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    try {
      setSavingTemplate(true);
      setTemplateFeedback(null);
      await communicationsService.updateTemplate(selectedTemplate.id, {
        subject: templateSubject,
        bodyHtml: templateBody,
      });
      setTemplateFeedback({ type: 'success', message: 'Plantilla actualizada exitosamente.' });
      await loadTemplates();
    } catch (err: any) {
      setTemplateFeedback({ type: 'error', message: err?.response?.data?.message || 'Error al guardar plantilla.' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const copyVariable = (v: string) => {
    navigator.clipboard.writeText(`{{${v}}}`);
    setCopiedVar(v);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  // Cargar estadísticas y muestra para envíos masivos
  useEffect(() => {
    if (activeTab === 'bulk' && currentEvent) {
      loadBulkRecipients();
    }
  }, [bulkTargetGroup, bulkTicketTypeId, bulkDateFrom, bulkDateTo, currentEvent, activeTab]);

  const loadBulkRecipients = async () => {
    if (!currentEvent) return;
    try {
      setLoadingBulkStats(true);
      const res = await communicationsService.validateRecipients({
        eventId: currentEvent.id,
        targetGroup: bulkTargetGroup,
        ticketTypeId: bulkTicketTypeId || undefined,
        dateFrom: bulkDateFrom || undefined,
        dateTo: bulkDateTo || undefined,
      });
      setBulkStats({
        total: res.totalSelected,
        eligible: res.eligibleCount,
        validEmails: res.validEmailsCount,
        invalidEmails: res.invalidEmailsCount,
        cancelled: res.cancelledCount,
        demo: res.demoCount,
        duplicates: res.duplicateCount,
      });
      setBulkSampleRecipients(res.sampleRecipients || []);
      setBulkQuotaWarning(res.quotaWarning || null);
    } catch (err) {
      console.error('Error al prevalidar destinatarios:', err);
    } finally {
      setLoadingBulkStats(false);
    }
  };

  // Ejecutar envío masivo
  const handleExecuteBulkSend = async () => {
    if (!currentEvent) return;
    try {
      setSendingBulk(true);
      setBulkResult(null);
      const res = await communicationsService.sendBulkEmail({
        eventId: currentEvent.id,
        templateCode: bulkTemplateCode,
        targetGroup: bulkTargetGroup,
        ticketTypeId: bulkTicketTypeId || undefined,
        dateFrom: bulkDateFrom || undefined,
        dateTo: bulkDateTo || undefined,
        customSubject: bulkSubject || undefined,
        customMessage: bulkCustomMessage || undefined,
        mode: bulkDeliveryMode,
        simulateOnly: bulkDeliveryMode === 'SIMULATION',
        confirmedDemoSending: confirmedBulkDemoSending,
      });

      setBulkResult(res);
      setBulkStep(4);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al procesar el lote de correos.');
    } finally {
      setSendingBulk(false);
    }
  };

  // Cargar Historial
  const loadLogs = async (page = logsPage) => {
    if (!currentEvent) return;
    try {
      setLoadingLogs(true);
      const res = await communicationsService.getLogs({
        eventId: currentEvent.id,
        status: logsStatusFilter !== 'ALL' ? logsStatusFilter : undefined,
        search: logsSearch || undefined,
        batchId: logsBatchFilter || undefined,
        templateCode: logsTemplateFilter !== 'ALL' ? logsTemplateFilter : undefined,
        dateFrom: logsDateFrom || undefined,
        dateTo: logsDateTo || undefined,
        page,
        limit: 15,
      });
      setLogs(res.logs || []);
      setLogsTotal(res.total || 0);
      setLogsPage(res.page || 1);
      setLogsTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabecera y Banner de Estado SMTP */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              {currentEvent?.name || 'Edición Activa'}
            </span>
            <span className="text-xs text-muted-foreground">• Módulo de Comunicaciones Oficiales</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-primary" />
            <span>Comunicaciones y Mensajería</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestione el envío de entradas digitales, recordatorios con QR oficial y comunicados masivos auditados.
          </p>
        </div>

        {/* Tarjeta de Estado del Servicio SMTP y Enlace a Administración */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                serviceConfig?.isEnabled
                  ? serviceConfig.host.includes('example') || serviceConfig.host.includes('mailtrap')
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-emerald-400'
                  : 'bg-zinc-600'
              }`}
            />
            <div className="text-xs">
              <span className="font-bold text-foreground">Servicio SMTP: </span>
              <span
                className={`font-semibold ${
                  serviceConfig?.isEnabled
                    ? serviceConfig.host.includes('example') || serviceConfig.host.includes('mailtrap')
                      ? 'text-sky-400'
                      : 'text-emerald-400'
                    : 'text-muted-foreground'
                }`}
              >
                {serviceConfig?.isEnabled
                  ? serviceConfig.host.includes('example') || serviceConfig.host.includes('mailtrap')
                    ? 'Modo Simulación'
                    : 'Activo'
                  : 'Desactivado'}
              </span>
            </div>
          </div>

          {isAdmin && (
            <Link
              to="/settings?tab=email"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 pl-2 border-l border-border"
            >
              <span>Configuración técnica</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Pestañas Principales */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-card border border-border">
        <button
          onClick={() => setActiveTab('compose')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'compose'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Redactar y Enviar</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Plantillas Oficiales</span>
        </button>

        <button
          onClick={() => setActiveTab('bulk')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'bulk'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Envíos Masivos</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('batches');
            loadBatchJobs();
          }}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'batches'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Cola de Lotes</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('logs');
            loadLogs(1);
          }}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Historial y Seguimiento</span>
        </button>
      </div>

      {/* ========================================================
          PESTAÑA 1: REDACTAR Y ENVIAR (INDIVIDUAL)
      ======================================================== */}
      {activeTab === 'compose' && (
        <div className="space-y-4">
          {/* Barra superior de Selección de Destinatario y Acciones de Envío */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Búsqueda y Destinatario Seleccionado */}
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative min-w-[280px] max-w-md">
                  <input
                    type="text"
                    placeholder="Buscar destinatario por nombre, correo o ticket..."
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                  />
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  {searchingParticipants && (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}

                  {/* Menú flotante de resultados de búsqueda */}
                  {searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto border border-border rounded-xl p-1 bg-card shadow-xl">
                      {searchResults.map((reg) => (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            setSelectedRegistration(reg);
                            setParticipantSearch('');
                            setSearchResults([]);
                          }}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer flex flex-col gap-0.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">{reg.participant.fullName}</span>
                            <span className="font-mono text-[10px] text-primary">{reg.registrationNumber}</span>
                          </div>
                          <span className="text-muted-foreground text-[11px]">{reg.participant.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Badge de Destinatario Seleccionado */}
                {selectedRegistration ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="flex items-baseline gap-1.5">
                      <strong className="text-foreground">{selectedRegistration.participant.fullName}</strong>
                      <span className="font-mono text-[10px] text-primary">{selectedRegistration.registrationNumber}</span>
                      <span className="text-muted-foreground text-[11px] hidden sm:inline">({selectedRegistration.participant.email})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRegistration(null)}
                      className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                      title="Quitar selección"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-xl border border-border/60">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Vista previa en vivo activa con datos de ejemplo. Seleccione un participante para enviar.</span>
                  </div>
                )}
              </div>

              {/* Botones de Envío y Prueba */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowTestSendModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-bold border border-border transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Probar envío</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSingleEmail(false)}
                  disabled={sendingSingle || !selectedRegistration}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-md shadow-primary/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {sendingSingle ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {selectedRegistration
                          ? `Enviar a ${selectedRegistration.participant.firstName}`
                          : 'Seleccionar destinatario'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Alerta de Duplicado si existe */}
            {singleDuplicateWarning && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{singleDuplicateWarning?.message}</span>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setSingleDuplicateWarning(null)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-muted/60 hover:bg-muted text-foreground cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendSingleEmail(true)}
                    disabled={sendingSingle}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sí, reenviar correo</span>
                  </button>
                </div>
              </div>
            )}

            {/* Feedback de Éxito o Error */}
            {singleFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                  singleFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                }`}
              >
                {singleFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{singleFeedback.message}</span>
              </div>
            )}
          </div>

          {/* EDITOR VISUAL INTEGRADO CON VISTA PREVIA PERMANENTE A LA DERECHA */}
          <VisualEmailEditor
            initialSubject={composeSubject}
            initialHtml={composeBodyHtml}
            templateCode={composeTemplateCode}
            templates={templates}
            onSelectTemplate={(code) => handleComposeTemplateChange(code)}
            onChangeSubject={(sub) => setComposeSubject(sub)}
            onChangeHtml={(html) => setComposeBodyHtml(html)}
            customMessage={composeCustomMessage}
            onChangeCustomMessage={(msg) => setComposeCustomMessage(msg)}
            selectedParticipant={
              selectedRegistration
                ? {
                    fullName: selectedRegistration.participant.fullName,
                    email: selectedRegistration.participant.email,
                    registrationNumber: selectedRegistration.registrationNumber,
                    ticketType: selectedRegistration.ticketType?.name || (selectedRegistration.isCourtesy ? 'Cortesía' : 'General'),
                    institution: selectedRegistration.participant.institution || '',
                  }
                : null
            }
          />
        </div>
      )}

      {/* ========================================================
          PESTAÑA 2: PLANTILLAS OFICIALES
      ======================================================== */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Plantillas */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              Catálogo de Plantillas
            </h3>
            <div className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(t);
                    setTemplateSubject(t.subject);
                    setTemplateBody(t.bodyHtml);
                    setTemplateFeedback(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                    selectedTemplate?.id === t.id
                      ? 'bg-primary/10 border-primary shadow-sm text-foreground'
                      : 'bg-card border-border hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground">{t.name}</span>
                    {t.isSystem && (
                      <span className="text-[10px] bg-background px-1.5 py-0.5 rounded border border-border font-mono">
                        Sistema
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] truncate opacity-80">{t.subject}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Editor de Plantilla Seleccionada */}
          <div className="lg:col-span-2 space-y-4">
            {selectedTemplate && (
              <form onSubmit={handleSaveTemplate} className="p-6 rounded-2xl bg-card border border-border space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span>{selectedTemplate.name}</span>
                    </h3>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{selectedTemplate.code}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenPreview(selectedTemplate.code, templateSubject, templateBody)}
                    className="px-3.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center gap-1.5 border border-border transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <span>Vista previa</span>
                  </button>
                </div>

                {/* Asunto */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Asunto Predeterminado
                  </label>
                  <input
                    type="text"
                    required
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Variables Disponibles */}
                <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>Variables Dinámicas Disponibles</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Haga clic para copiar</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'participantName',
                      'eventName',
                      'registrationNumber',
                      'ticketType',
                      'eventVenue',
                      'eventDate',
                      'qrDataUrl',
                      'qrUrl',
                      'amountPaid',
                      'balanceDue',
                      'currencySymbol',
                      'messageContent',
                    ].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => copyVariable(v)}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer flex items-center gap-1 ${
                          copiedVar === v
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-card text-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        <span>{`{{${v}}}`}</span>
                        {copiedVar === v ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contenido HTML */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Contenido HTML de la Plantilla
                  </label>
                  <textarea
                    rows={12}
                    required
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  />
                </div>

                {templateFeedback && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      templateFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{templateFeedback.message}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-border flex justify-end">
                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-primary/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingTemplate ? 'Guardando...' : 'Guardar Cambios en Plantilla'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          PESTAÑA 3: ENVÍOS MASIVOS (WIZARD GUIADO 4 PASOS)
      ======================================================== */}
      {activeTab === 'bulk' && (
        <div className="max-w-4xl space-y-6">
          {/* Indicador de Pasos */}
          <div className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between">
            {[
              { num: 1, label: '1. Destinatarios' },
              { num: 2, label: '2. Plantilla y Asunto' },
              { num: 3, label: '3. Vista Previa' },
              { num: 4, label: '4. Progreso y Resultado' },
            ].map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    bulkStep === s.num
                      ? 'bg-primary text-white shadow-sm'
                      : bulkStep > s.num
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {bulkStep > s.num ? '✓' : s.num}
                </span>
                <span
                  className={`text-xs font-bold hidden sm:inline ${
                    bulkStep === s.num ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* PASO 1: SELECCIÓN DE DESTINATARIOS */}
          {bulkStep === 1 && (
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
              <div>
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Paso 1: Segmentación de Destinatarios</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Seleccione el grupo objetivo al que desea enviar el comunicado masivo.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { id: 'ALL', label: 'Todos los Elegibles', desc: 'Inscripciones no canceladas' },
                  { id: 'CONFIRMED', label: 'Confirmados', desc: 'Estado Confirmado' },
                  { id: 'PAID_WITHOUT_CONFIRMATION', label: 'Pagados sin Confirmar', desc: 'Pagos completos sin confirmación enviada' },
                  { id: 'COURTESY_WITHOUT_CONFIRMATION', label: 'Cortesías sin Notificar', desc: 'Cortesías sin confirmación enviada' },
                  { id: 'WITHOUT_DIGITAL_TICKET', label: 'Sin Entrada Digital', desc: 'Confirmados sin ticket digital enviado' },
                  { id: 'PAID', label: 'Pagos Completos', desc: 'Pagados y Cortesías' },
                  { id: 'PENDING_PAYMENT', label: 'Pagos Pendientes', desc: 'Con saldo pendiente' },
                  { id: 'COURTESY', label: 'Cortesías / Becas', desc: 'Inscripciones de cortesía' },
                  { id: 'PARTIAL', label: 'Pagos Parciales', desc: 'Abonado con saldo restante' },
                  { id: 'FAILED_COMMUNICATION', label: 'Con Envío Fallido', desc: 'Destinatarios con error de envío previo' },
                  { id: 'WITHOUT_REMINDER', label: 'Sin Recordatorio', desc: 'Confirmados sin recordatorio de evento' },
                  { id: 'ATTENDED', label: 'Ya Asistieron', desc: 'Con Check-in realizado' },
                  { id: 'NOT_ATTENDED', label: 'No Han Asistido', desc: 'Pendientes de ingreso' },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setBulkTargetGroup(g.id as any)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      bulkTargetGroup === g.id
                        ? 'bg-primary/10 border-primary text-foreground shadow-sm'
                        : 'bg-background border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <span className="font-bold text-xs text-foreground">{g.label}</span>
                    <span className="text-[11px] opacity-75">{g.desc}</span>
                  </button>
                ))}
              </div>

              {/* Filtros avanzados de segmentación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-background border border-border">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                    Tipo de Entrada
                  </label>
                  <select
                    value={bulkTicketTypeId}
                    onChange={(e) => setBulkTicketTypeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="">Todos los tipos de entrada</option>
                    {(currentEvent?.ticketTypes || []).map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({currentEvent?.settings?.currencySymbol || 'RD$'} {t.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                    Registrados Desde
                  </label>
                  <input
                    type="date"
                    value={bulkDateFrom}
                    onChange={(e) => setBulkDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                    Registrados Hasta
                  </label>
                  <input
                    type="date"
                    value={bulkDateTo}
                    onChange={(e) => setBulkDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
              </div>

                            {/* Controles de Prevención de Duplicados en Masa (Fase QA Integral) */}
              <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-2">
                <span className="text-xs font-bold text-foreground block">Opciones de Deduplicación y Reenvío Seguro:</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={excludeAlreadyNotified}
                    onChange={(e) => setExcludeAlreadyNotified(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary bg-background border-border"
                  />
                  <span>Excluir por defecto participantes que ya recibieron esta comunicación previamente</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={forceResendBulk}
                    onChange={(e) => setForceResendBulk(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 bg-background border-border"
                  />
                  <span>Autorizar reenvío a los ya notificados (registra auditoría de reenvío masivo)</span>
                </label>
              </div>

              {/* Alerta de Cuota Diaria Brevo */}
              {bulkQuotaWarning && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-2 text-xs text-blue-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{bulkQuotaWarning}</span>
                </div>
              )}

              {/* Resumen Exacto de Destinatarios y Exclusiones (Sección 8) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-background border border-border">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Total en Segmento</p>
                  <p className="text-xl font-black text-foreground mt-0.5">{bulkStats.total}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-emerald-500">Elegibles para Envío</p>
                  <p className="text-xl font-black text-emerald-500 mt-0.5">{bulkStats.eligible}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-amber-500">Ya Notificados</p>
                  <p className="text-xl font-black text-amber-500 mt-0.5">{alreadyNotifiedCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-rose-500">Excluidos / Inválidos</p>
                  <p className="text-xl font-black text-rose-500 mt-0.5">{bulkStats.cancelled + bulkStats.invalidEmails + bulkStats.duplicates}</p>
                </div>
                <div className="flex items-center justify-center sm:justify-end col-span-2 sm:col-span-1">
                  {excludedList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowExcludedModal(true)}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span>Revisar Excluidos ({excludedList.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Muestra de Destinatarios */}
              {bulkRecipientsPreview.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Muestra Preliminar de Destinatarios:
                  </p>
                  <div className="border border-border rounded-xl divide-y divide-border bg-background">
                    {bulkRecipientsPreview.map((r) => (
                      <div key={r.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-foreground">{r.participant.fullName}</span>
                          <span className="text-muted-foreground text-[11px] ml-2 font-mono">
                            {r.participant.email}
                          </span>
                        </div>
                        <span className="font-mono text-primary font-bold">{r.registrationNumber}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setBulkStep(2)}
                  disabled={bulkStats.total === 0}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>Siguiente: Plantilla</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: PLANTILLA Y CONTENIDO */}
          {bulkStep === 2 && (
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
              <div>
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Paso 2: Selección de Plantilla y Asunto</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Elija la plantilla que recibirán los {bulkStats.total} destinatarios seleccionados.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Plantilla de Correo
                  </label>
                  <select
                    value={bulkTemplateCode}
                    onChange={(e) => {
                      setBulkTemplateCode(e.target.value);
                      const t = templates.find((x) => x.code === e.target.value);
                      if (t) setBulkSubject(t.subject);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {templates.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Asunto del Correo Masivo
                  </label>
                  <input
                    type="text"
                    value={bulkSubject}
                    onChange={(e) => setBulkSubject(e.target.value)}
                    placeholder="Asunto personalizado para este lote..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Mensaje Adicional Opcional
                  </label>
                  <textarea
                    rows={4}
                    value={bulkCustomMessage}
                    onChange={(e) => setBulkCustomMessage(e.target.value)}
                    placeholder="Texto personalizado a insertar en la plantilla..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setBulkStep(1)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={() => setBulkStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <span>Siguiente: Vista Previa</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: VISTA PREVIA Y CONFIRMACIÓN EXPLÍCITA */}
          {bulkStep === 3 && (
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
              <div>
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  <span>Paso 3: Verificación y Confirmación de Envío</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revise los parámetros del lote antes de iniciar el procesamiento.
                </p>
              </div>

              {/* Selector de Modo de Envío Masivo */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
                  Modo de Procesamiento del Lote
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      bulkDeliveryMode === 'REAL'
                        ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary'
                        : 'bg-card border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkDeliveryMode"
                      value="REAL"
                      checked={bulkDeliveryMode === 'REAL'}
                      onChange={() => setBulkDeliveryMode('REAL')}
                      className="mt-0.5 text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-bold text-xs text-foreground">Envío Masivo Real (SMTP)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Entrega real a través del servidor SMTP configurado hacia los buzones de los participantes.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      bulkDeliveryMode === 'SIMULATION'
                        ? 'bg-amber-500/10 border-amber-500 text-foreground ring-1 ring-amber-500'
                        : 'bg-card border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkDeliveryMode"
                      value="SIMULATION"
                      checked={bulkDeliveryMode === 'SIMULATION'}
                      onChange={() => setBulkDeliveryMode('SIMULATION')}
                      className="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-bold text-xs text-foreground">Simular Campaña Masiva</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Registra el lote y las métricas como SIMULATED sin contactar al servidor SMTP externo.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Advertencia y confirmación obligatoria si está en modo demo y se elige envío real */}
                {bulkDeliveryMode === 'REAL' && currentEvent?.settings?.demoModeEnabled && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 space-y-2 mt-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium leading-relaxed">
                        <strong>Atención:</strong> La edición está en <strong>Modo Demostración</strong>. Al confirmar el envío masivo real, los correos saldrán efectivamente por el servidor SMTP a las direcciones reales registradas en la edición.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 pt-1 border-t border-amber-500/20 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmedBulkDemoSending}
                        onChange={(e) => setConfirmedBulkDemoSending(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 bg-background border-border"
                      />
                      <span className="text-xs font-bold text-foreground">
                        Confirmo que deseo realizar el envío masivo real hacia correos externos aun en modo demo
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Alerta de Seguridad Destacada */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-1">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Confirmación de Envío Masivo</span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                  Está a punto de iniciar el procesamiento para <strong>{bulkStats.total} participantes</strong> con la plantilla{' '}
                  <strong>{bulkTemplateCode}</strong> en modo <strong>{bulkDeliveryMode === 'REAL' ? 'ENVÍO REAL (SMTP)' : 'SIMULACIÓN'}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenPreview(bulkTemplateCode, bulkSubject, undefined, bulkCustomMessage)}
                  className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center gap-2 border border-border"
                >
                  <Eye className="w-4 h-4 text-primary" />
                  <span>Ver Correo de Muestra en Modal</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setBulkStep(2)}
                  disabled={
                    sendingBulk ||
                    (bulkDeliveryMode === 'REAL' && currentEvent?.settings?.demoModeEnabled && !confirmedBulkDemoSending)
                  }
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkSend}
                  disabled={sendingBulk}
                  className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-lg shadow-primary/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {sendingBulk ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{sendingBulk ? 'Procesando lote...' : `Confirmar y Enviar a ${bulkStats.total} Destinatarios`}</span>
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: PROGRESO Y RESULTADO */}
          {bulkStep === 4 && bulkResult && (
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Procesamiento de Lote Completado</h3>
                <p className="text-xs text-muted-foreground">{bulkResult.message}</p>
                {bulkResult.batchId && (
                  <p className="text-xs font-mono text-primary font-bold">Identificador de Lote: {bulkResult.batchId}</p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-background border border-border text-center">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Total</p>
                  <p className="text-2xl font-black text-foreground mt-1">{bulkResult.total}</p>
                </div>
                <div className="p-4 rounded-xl bg-background border border-emerald-500/20 text-center">
                  <p className="text-[10px] uppercase font-bold text-emerald-400">Enviados</p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">{bulkResult.sent}</p>
                </div>
                <div className="p-4 rounded-xl bg-background border border-sky-500/20 text-center">
                  <p className="text-[10px] uppercase font-bold text-sky-400">Simulados</p>
                  <p className="text-2xl font-black text-sky-400 mt-1">{bulkResult.simulated}</p>
                </div>
                <div className="p-4 rounded-xl bg-background border border-rose-500/20 text-center">
                  <p className="text-[10px] uppercase font-bold text-rose-400">Fallidos</p>
                  <p className="text-2xl font-black text-rose-400 mt-1">{bulkResult.failed}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setBulkStep(1);
                    setBulkResult(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Nuevo Envío Masivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (bulkResult.batchId) {
                      setLogsBatchFilter(bulkResult.batchId);
                    }
                    setActiveTab('logs');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <History className="w-4 h-4" />
                  <span>Ver en Cola de Lotes</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PESTAÑA: COLA DE LOTES PERSISTENTES (Fase 4 / QA-31)
      ======================================================== */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-foreground">Cola de Lotes de Envíos Masivos</h3>
              <p className="text-xs text-muted-foreground">
                Monitoreo, estado de despacho y control de reintentos seguros.
              </p>
            </div>
            <button
              type="button"
              onClick={loadBatchJobs}
              disabled={loadingBatchJobs}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 border border-primary/20 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingBatchJobs ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                    <th className="pb-3 pl-2">ID Lote / Fecha</th>
                    <th className="pb-3">Asunto</th>
                    <th className="pb-3 text-center">Modo</th>
                    <th className="pb-3 text-center">Total</th>
                    <th className="pb-3 text-center">Enviados</th>
                    <th className="pb-3 text-center">Simulados</th>
                    <th className="pb-3 text-center">Fallidos</th>
                    <th className="pb-3 text-center">Estado</th>
                    <th className="pb-3 text-right pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batchJobs.length > 0 ? (
                    batchJobs.map((job) => {
                      const failed = job.failedCount || 0;
                      return (
                        <tr key={job.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 pl-2 font-mono text-[11px]">
                            <p className="font-bold text-foreground">{job.id.slice(0, 16)}...</p>
                            <p className="text-muted-foreground text-[10px]">{new Date(job.createdAt).toLocaleString('es-DO')}</p>
                          </td>
                          <td className="py-3">
                            <p className="font-semibold text-foreground truncate max-w-xs">{job.subject}</p>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              (job as any).mode === 'REAL' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                            }`}>
                              {(job as any).mode || 'SIMULATION'}
                            </span>
                          </td>
                          <td className="py-3 text-center font-bold text-foreground">{job.totalCount}</td>
                          <td className="py-3 text-center text-emerald-400 font-bold">{job.sentCount || 0}</td>
                          <td className="py-3 text-center text-sky-400 font-bold">{job.simulatedCount || 0}</td>
                          <td className="py-3 text-center text-rose-400 font-bold">{failed}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                              job.status === 'SIMULATED' ? 'bg-sky-500/20 text-sky-400' :
                              job.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400' :
                              job.status === 'CANCELLED' ? 'bg-zinc-500/20 text-zinc-400' :
                              job.status === 'CANCELLATION_REQUESTED' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-primary/20 text-primary'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="py-3 text-right pr-2 space-x-1">
                            {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                              <button
                                type="button"
                                disabled={cancellingBatchId === job.id}
                                onClick={() => handleCancelBatch(job.id)}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-bold cursor-pointer"
                              >
                                {cancellingBatchId === job.id ? 'Cancelando...' : 'Cancelar'}
                              </button>
                            )}
                            {failed > 0 && (
                              <button
                                type="button"
                                disabled={retryingBatchId === job.id}
                                onClick={() => handleRetryFailedBatch(job.id)}
                                className="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-[11px] font-bold cursor-pointer"
                                title="Reintentar exclusivamente envíos fallidos confirmados"
                              >
                                {retryingBatchId === job.id ? 'Reintentando...' : 'Reintentar fallidos'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenRetryUncertainModal(job)}
                              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                              title="Atención: Reintentar envíos inciertos requiere confirmación explícita"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>Reintentar inciertos</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">
                        {loadingBatchJobs ? 'Cargando lotes...' : 'No hay lotes de envío registrados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PESTAÑA 4: HISTORIAL Y SEGUIMIENTO (QA-10)
      ======================================================== */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="p-4 rounded-2xl bg-card border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por destinatario, correo o asunto..."
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLogs(1)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <select
                value={logsStatusFilter}
                onChange={(e) => {
                  setLogsStatusFilter(e.target.value);
                  setTimeout(() => loadLogs(1), 0);
                }}
                className="px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">Todos los estados</option>
                <option value="SENT">Enviados (SENT)</option>
                <option value="SIMULATED">Simulados (SIMULATED)</option>
                <option value="FAILED">Fallidos (FAILED)</option>
                <option value="PENDING">Pendientes (PENDING)</option>
              </select>

              {logsBatchFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono">
                  <span>Lote: {logsBatchFilter.slice(0, 16)}...</span>
                  <button onClick={() => { setLogsBatchFilter(''); loadLogs(1); }} className="hover:opacity-80">✕</button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => loadLogs(logsPage)}
              disabled={loadingLogs}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 border border-primary/20 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {/* Tabla de Logs */}
          <div className="p-4 rounded-2xl bg-card border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                    <th className="pb-3 pl-2">Destinatario</th>
                    <th className="pb-3">Plantilla / Asunto</th>
                    <th className="pb-3">Fecha y Hora</th>
                    <th className="pb-3">Operador</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3">Lote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 pl-2">
                          <p className="font-bold text-foreground">{log.recipientName || 'Sin nombre'}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{log.recipientEmail}</p>
                        </td>
                        <td className="py-3">
                          <p className="font-semibold text-foreground truncate max-w-xs">{log.subject}</p>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                            {log.templateCode || 'PERSONALIZADO'}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground font-mono text-[11px]">
                          {new Date(log.sentAt).toLocaleString('es-DO', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {log.sentByUser?.fullName || 'Sistema'}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                              log.status === 'SENT'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : log.status === 'SIMULATED'
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                : log.status === 'FAILED'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            <span>{log.status}</span>
                          </span>
                          {log.errorMessage && (
                            <p className="text-[10px] text-rose-400 truncate max-w-xs mt-0.5" title={log.errorMessage}>
                              {log.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="py-3 font-mono text-[10px] text-muted-foreground">
                          {log.batchId ? (
                            <button
                              onClick={() => {
                                setLogsBatchFilter(log.batchId!);
                                loadLogs(1);
                              }}
                              className="text-primary hover:underline cursor-pointer"
                              title="Filtrar por este lote"
                            >
                              {log.batchId.slice(0, 10)}...
                            </button>
                          ) : (
                            'Individual'
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        {loadingLogs ? 'Cargando registros...' : 'No se encontraron registros de comunicaciones.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {logsTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border mt-3 text-xs">
                <span className="text-muted-foreground">
                  Página {logsPage} de {logsTotalPages} ({logsTotal} registros en total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={logsPage <= 1}
                    onClick={() => {
                      const p = logsPage - 1;
                      setLogsPage(p);
                      loadLogs(p);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={logsPage >= logsTotalPages}
                    onClick={() => {
                      const p = logsPage + 1;
                      setLogsPage(p);
                      loadLogs(p);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      
      {/* Modal: Lista de Destinatarios Excluidos */}
      {showExcludedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Destinatarios Excluidos ({excludedList.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowExcludedModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2 rounded-l-lg">Participante</th>
                    <th className="p-2">Correo</th>
                    <th className="p-2 rounded-r-lg">Motivo de Exclusión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {excludedList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2 font-bold text-foreground">{item.fullName}</td>
                      <td className="p-2 font-mono text-muted-foreground">{item.email}</td>
                      <td className="p-2 text-amber-600 dark:text-amber-400 font-medium">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border flex justify-end bg-muted/20">
              <button
                type="button"
                onClick={() => setShowExcludedModal(false)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: VISTA PREVIA REAL SEGURA EN IFRAME (QA-11)
      ======================================================== */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabecera de la Vista Previa */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Vista Previa Real del Correo</h3>
              </div>

              {/* Selector Escritorio / Móvil */}
              <div className="flex items-center gap-1 p-1 bg-background rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    previewMode === 'desktop' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Escritorio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    previewMode === 'mobile' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Móvil</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadatos del correo */}
            {previewData && (
              <div className="p-3.5 bg-background border-b border-border text-xs space-y-1 font-mono shrink-0">
                <p>
                  <span className="text-muted-foreground">De:</span>{' '}
                  <strong className="text-foreground">{previewData.fromName}</strong> &lt;{previewData.fromEmail}&gt;
                </p>
                <p>
                  <span className="text-muted-foreground">Para:</span>{' '}
                  <strong className="text-foreground">{previewData.recipientName}</strong> &lt;{previewData.recipientEmail}&gt;
                </p>
                <p>
                  <span className="text-muted-foreground">Asunto:</span>{' '}
                  <strong className="text-foreground font-sans font-bold">{previewData.subject}</strong>
                </p>
              </div>
            )}

            {/* Contenedor del Iframe Aislado (QA-11) */}
            <div className="flex-1 p-4 overflow-y-auto bg-zinc-950/60 flex items-center justify-center">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs">Generando representación exacta...</p>
                </div>
              ) : previewData ? (
                <div
                  className={`transition-all duration-300 rounded-xl overflow-hidden shadow-2xl bg-white ${
                    previewMode === 'mobile' ? 'w-[375px] h-[550px]' : 'w-full h-[500px]'
                  }`}
                >
                  <iframe
                    title="Vista previa del correo"
                    sandbox="allow-same-origin"
                    srcDoc={previewData.html}
                    className="w-full h-full border-0"
                  />
                </div>
              ) : null}
            </div>

            {/* Pie del modal */}
            <div className="p-3 border-t border-border bg-card flex justify-between items-center text-[11px] text-muted-foreground shrink-0">
              <span>Aislamiento seguro activo (Iframe Sandbox). La vista previa no envía correos.</span>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ENVÍO DE PRUEBA RÁPIDO */}
      {showTestSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <span>Enviar Correo de Diagnóstico / Prueba</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Se enviará una prueba de conectividad SMTP al correo especificado para verificar la recepción sin alterar participantes.
            </p>
            <input
              type="email"
              placeholder="su-correo@ejemplo.com"
              value={testSendRecipient}
              onChange={(e) => setTestSendRecipient(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTestSendModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendTestMail}
                disabled={sendingTestMail || !testSendRecipient}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {sendingTestMail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sendingTestMail ? 'Enviando...' : 'Enviar Prueba'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: REINTENTO DE ENVÍOS INCIERTOS (QA-31) */}
      {uncertainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-rose-500/30 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-foreground">Autorización de Reenvío Incierto</h3>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 space-y-2">
              <p className="font-semibold">⚠️ Advertencia Crítica de Duplicación:</p>
              <p>
                Hay destinatarios con resultado incierto. Es muy probable que el servidor SMTP ya haya recibido y entregado estos correos. Reintentarlos puede provocar que los participantes reciban información duplicada.
              </p>
            </div>
            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-foreground">
                Motivo justificado de la autorización (obligatorio para auditoría):
              </label>
              <textarea
                rows={3}
                value={uncertainReason}
                onChange={(e) => setUncertainReason(e.target.value)}
                placeholder="Explique por qué es necesario reintentar estos envíos inciertos..."
                className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:ring-1 focus:ring-primary"
              />
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={confirmedDuplicateRisk}
                  onChange={(e) => setConfirmedDuplicateRisk(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-muted-foreground text-xs font-medium">
                  Comprendo el riesgo de correos duplicados y autorizo expresamente el reenvío bajo mi responsabilidad.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUncertainModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmedDuplicateRisk || uncertainReason.trim().length < 5 || retryingUncertain}
                onClick={handleConfirmRetryUncertain}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {retryingUncertain ? 'Autorizando...' : 'Autorizar Reintento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
