import {api} from '../services/api';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { formatTimeDraft } from '../utils/timeDraft';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import {
  scheduleService,
  ScheduleItem,
  ScheduleResponse,
  ScheduleChangeLog,
  ScheduledNotification,
} from '../services/schedule.service';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Plus,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Upload,
  X,
  Save,
  Tag,
  Building,
  Smartphone,
  Megaphone,
  History,
  Send,
  Eye,
  EyeOff,
  Bell,
  Star,
  Users,
} from 'lucide-react';

export const SchedulePage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();
  const canEdit = hasRole(['ADMIN', 'OPERATOR']);
  const [speakerOptions,setSpeakerOptions]=useState<any[]>([]),[newSpeaker,setNewSpeaker]=useState(false),[speakerDraft,setSpeakerDraft]=useState({fullName:'',email:'',organization:''});
  const officialDates:string[]=[];if(currentEvent){for(let d=Date.parse(String(currentEvent.startDate).slice(0,10));d<=Date.parse(String(currentEvent.endDate).slice(0,10))&&officialDates.length<366;d+=86400000)officialDates.push(new Date(d).toISOString().slice(0,10));}
  useEffect(()=>{let active=true;setSpeakerOptions([]);setShowItemModal(false);if(currentEvent)api.get(`/events/${currentEvent.id}/speakers`).then(r=>{if(active)setSpeakerOptions(r.data.data.speakers);}).catch(()=>{});return()=>{active=false;};},[currentEvent?.id]);

  const [data, setData] = useState<ScheduleResponse>({
    total: 0,
    days: [],
    rooms: [],
    categories: [],
    pdfUrl: null,
    items: [],
  });

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtros
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [selectedRoom, setSelectedRoom] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  // Modales
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [itemForm, setItemForm] = useState({
    title: '',
    speakerIds: [] as string[],
    speakerName: '',
    speakerBio: '',
    speakerCompany: '',
    room: '',
    day: '',
    startTime: '',
    endTime: '',
    category: '',
    status: 'CONFIRMED' as 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED',
    description: '',
    isKeynote: false,
    visibility: 'PUBLISHED' as 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED',
    publishAt: '',
    announcementText: '',
  });
  const [savingItem, setSavingItem] = useState(false);

  // Modal Confirmar Notificación de Cambio
  const [showChangeNotificationModal, setShowChangeNotificationModal] = useState(false);
  const [changePromptData, setChangePromptData] = useState<{
    scheduleItemId: string;
    changeLogId?: string;
    diffs: any[];
    itemTitle: string;
  } | null>(null);
  const [changeTargetGroup, setChangeTargetGroup] = useState<string>('ALL');
  const [changeActionType, setChangeActionType] = useState<'SEND_NOW' | 'SCHEDULE'>('SEND_NOW');
  const [changeScheduledFor, setChangeScheduledFor] = useState<string>('');
  const [changeCustomNote, setChangeCustomNote] = useState<string>('');
  const [sendingChangeNotification, setSendingChangeNotification] = useState(false);

  // Modal Keynote Announcement
  const [showKeynoteModal, setShowKeynoteModal] = useState(false);
  const [keynoteItem, setKeynoteItem] = useState<ScheduleItem | null>(null);
  const [keynoteTargetGroup, setKeynoteTargetGroup] = useState<string>('ALL');
  const [keynoteAction, setKeynoteAction] = useState<
    'PUBLISH_ONLY' | 'PUBLISH_AND_NOTIFY' | 'SCHEDULE_PUBLISH_AND_NOTIFY'
  >('PUBLISH_AND_NOTIFY');
  const [keynoteScheduledFor, setKeynoteScheduledFor] = useState<string>('');
  const [keynoteCustomMessage, setKeynoteCustomMessage] = useState<string>('');
  const [processingKeynote, setProcessingKeynote] = useState(false);

  // Modal Crear Anuncio En Vivo / Pausa
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementSubject, setAnnouncementSubject] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementTargetGroup, setAnnouncementTargetGroup] = useState<string>('ALL');
  const [announcementPriority, setAnnouncementPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [announcementAction, setAnnouncementAction] = useState<'SEND_NOW' | 'SCHEDULE'>('SEND_NOW');
  const [announcementScheduledFor, setAnnouncementScheduledFor] = useState<string>('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  // Modal Historial de Cambios y Notificaciones Programadas
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTab, setHistoryTab] = useState<'LOGS' | 'SCHEDULED'>('LOGS');
  const [changeLogs, setChangeLogs] = useState<ScheduleChangeLog[]>([]);
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [cancellingNotificationId, setCancellingNotificationId] = useState<string | null>(null);

  // Modal Importar
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Modal PDF
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrlInput, setPdfUrlInput] = useState('');
  const [pdfFileBase64, setPdfFileBase64] = useState<string | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);

  // Modal Vista Pública Móvil
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [publicData, setPublicData] = useState<any | null>(null);
  const [loadingPublic, setLoadingPublic] = useState(false);

  // Estados de Charlas de Demostración

  const readVersion = useRef(0);
  const loadSchedule = useCallback(async (silent = false) => {
    if (!currentEvent?.id) return;
    const version = ++readVersion.current;
    try {
      if (!silent) setLoading(true);
      const res = await scheduleService.getSchedule(currentEvent.id, {
        day: selectedDay !== 'ALL' ? selectedDay : undefined,
        room: selectedRoom !== 'ALL' ? selectedRoom : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: search.trim() || undefined,
      });
      if (version !== readVersion.current) return;
      setData(res);
      if (res.pdfUrl && !showPdfModal) {
        setPdfUrlInput(res.pdfUrl);
      }
    } catch (err: any) {
      console.error('Error al cargar cronograma:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al obtener el cronograma de conferencias',
      });
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, [currentEvent?.id, selectedDay, selectedRoom, selectedCategory, selectedStatus, search]);

  useRealtimeRefresh('schedule', () => (async () => { await loadSchedule(true); if (showMobilePreview && currentEvent) setPublicData(await scheduleService.getPublicSchedule(currentEvent.id)); })());

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setItemForm({
      title: '',
      speakerIds: [],
      speakerName: '',
      speakerBio: '',
      speakerCompany: '',
      room: '',
      day: officialDates.length===1?officialDates[0]:'',
      startTime: '',
      endTime: '',
      category: '',
      status: 'CONFIRMED',
      description: '',
      isKeynote: false,
      visibility: 'PUBLISHED',
      publishAt: '',
      announcementText: '',
    });
    setShowItemModal(true);
  };

  const handleOpenEdit = (item: ScheduleItem) => {
    setEditingItem(item);
    setItemForm({
      title: item.title,
      speakerIds: item.speakerIds || [],
      speakerName: item.speakerName || '',
      speakerBio: item.speakerBio || '',
      speakerCompany: item.speakerCompany || '',
      room: item.room || '',
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      category: item.category || '',
      status: item.status,
      description: item.description || '',
      isKeynote: !!item.isKeynote,
      visibility: item.visibility || 'PUBLISHED',
      publishAt: item.publishAt ? new Date(item.publishAt).toISOString().slice(0, 16) : '',
      announcementText: item.announcementText || '',
    });
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id) return;
    try {
      setSavingItem(true);
      const payload: any = {
        ...itemForm,
        ...(editingItem?.speakerName&&!editingItem.speakerIds?.length&&!itemForm.speakerIds.length?{speakerIds:undefined,speakerName:editingItem.speakerName}:{}),
        publishAt: itemForm.visibility === 'SCHEDULED' && itemForm.publishAt ? new Date(itemForm.publishAt).toISOString() : null,
      };

      if (editingItem) {
        const res = await scheduleService.updateItem(currentEvent.id, editingItem.id, payload);
        setShowItemModal(false);
        loadSchedule();

        if (res.meta?.hasRelevantChanges && res.meta.diffs?.length > 0) {
          setChangePromptData({
            scheduleItemId: editingItem.id,
            changeLogId: res.meta.changeLog?.id,
            diffs: res.meta.diffs,
            itemTitle: itemForm.title,
          });
          setChangeTargetGroup('ALL');
          setChangeActionType('SEND_NOW');
          setChangeCustomNote('');
          setShowChangeNotificationModal(true);
        } else {
          setFeedback({ type: 'success', text: 'Charla actualizada correctamente' });
        }
      } else {
        await scheduleService.createItem(currentEvent.id, payload);
        setShowItemModal(false);
        setFeedback({ type: 'success', text: 'Charla agregada al cronograma' });
        loadSchedule();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al guardar la charla',
      });
    } finally {
      setSavingItem(false);
    }
  };

  const handleConfirmChangeNotification = async () => {
    if (!currentEvent?.id || !changePromptData) return;
    try {
      setSendingChangeNotification(true);
      await scheduleService.notifyScheduleChange(currentEvent.id, {
        scheduleItemId: changePromptData.scheduleItemId,
        changeLogId: changePromptData.changeLogId,
        action: changeActionType,
        targetGroup: changeTargetGroup,
        scheduledFor: changeActionType === 'SCHEDULE' && changeScheduledFor ? new Date(changeScheduledFor).toISOString() : undefined,
        customNote: changeCustomNote.trim() || undefined,
        changesSummary: changePromptData.diffs,
      });

      setFeedback({
        type: 'success',
        text:
          changeActionType === 'SCHEDULE'
            ? 'Notificación de cambio programada exitosamente.'
            : 'Notificación de cambio enviada exitosamente a los asistentes.',
      });
      setShowChangeNotificationModal(false);
      setChangePromptData(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al enviar la notificación de cambio',
      });
    } finally {
      setSendingChangeNotification(false);
    }
  };

  const handleDismissChangeNotification = () => {
    setShowChangeNotificationModal(false);
    setChangePromptData(null);
    setFeedback({
      type: 'success',
      text: 'Charla actualizada sin enviar notificación a los asistentes.',
    });
  };

  const handlePublishKeynoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id || !keynoteItem) return;
    try {
      setProcessingKeynote(true);
      const res = await scheduleService.publishKeynote(currentEvent.id, keynoteItem.id, {
        action: keynoteAction,
        targetGroup: keynoteTargetGroup,
        scheduledFor: keynoteAction === 'SCHEDULE_PUBLISH_AND_NOTIFY' && keynoteScheduledFor ? new Date(keynoteScheduledFor).toISOString() : undefined,
        customMessage: keynoteCustomMessage.trim() || undefined,
      });

      setFeedback({
        type: 'success',
        text: res.message || 'Keynote procesado exitosamente',
      });
      setShowKeynoteModal(false);
      setKeynoteItem(null);
      loadSchedule();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al procesar el Keynote',
      });
    } finally {
      setProcessingKeynote(false);
    }
  };

  const handleSendAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id || !announcementSubject.trim() || !announcementMessage.trim()) return;
    try {
      setSendingAnnouncement(true);
      const res = await scheduleService.createAnnouncement(currentEvent.id, {
        subject: announcementSubject.trim(),
        message: announcementMessage.trim(),
        action: announcementAction,
        targetGroup: announcementTargetGroup,
        scheduledFor: announcementAction === 'SCHEDULE' && announcementScheduledFor ? new Date(announcementScheduledFor).toISOString() : undefined,
        priority: announcementPriority,
      });

      setFeedback({
        type: 'success',
        text: res.message || 'Anuncio procesado exitosamente',
      });
      setShowAnnouncementModal(false);
      setAnnouncementSubject('');
      setAnnouncementMessage('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al enviar el anuncio',
      });
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const loadHistory = async () => {
    if (!currentEvent?.id) return;
    try {
      setLoadingHistory(true);
      const [logs, notifs] = await Promise.all([
        scheduleService.getChangeHistory(currentEvent.id),
        scheduleService.getScheduledNotifications(currentEvent.id),
      ]);
      setChangeLogs(logs);
      setScheduledNotifications(notifs);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistoryModal(true);
    loadHistory();
  };

  const handleCancelNotification = async (id: string) => {
    if (!currentEvent?.id) return;
    try {
      setCancellingNotificationId(id);
      await scheduleService.cancelScheduledNotification(currentEvent.id, id);
      setFeedback({
        type: 'success',
        text: 'Notificación programada cancelada exitosamente.',
      });
      loadHistory();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al cancelar la notificación',
      });
    } finally {
      setCancellingNotificationId(null);
    }
  };

  const handleDeleteItem = async (item: ScheduleItem) => {
    if (!currentEvent?.id) return;
    if (!window.confirm(`¿Seguro que deseas eliminar "${item.title}{item.programmingStatus==='PENDING'&&<span className="block text-xs text-amber-500">Pendiente de programación</span>}" del cronograma?`)) {
      return;
    }
    try {
      await scheduleService.deleteItem(currentEvent.id, item.id);
      setFeedback({ type: 'success', text: 'Charla eliminada exitosamente' });
      loadSchedule();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al eliminar la charla',
      });
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentEvent?.id) return;

    try {
      setImporting(true);
      setImportResult(null);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = (evt.target?.result as string).split(',')[1];
        try {
          const res = await scheduleService.importSchedule(currentEvent.id, base64);
          setImportResult(res.data);
          setFeedback({
            type: 'success',
            text: `Importación exitosa: ${res.data.importedCount} charlas registradas.`,
          });
          loadSchedule();
        } catch (err: any) {
          setFeedback({
            type: 'error',
            text: err.response?.data?.message || 'Error al procesar el archivo Excel',
          });
        } finally {
          setImporting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setImporting(false);
    }
  };

  const handleSavePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id) return;
    try {
      setSavingPdf(true);
      await scheduleService.updatePdfUrl(currentEvent.id, pdfUrlInput, pdfFileBase64 || undefined);
      setFeedback({ type: 'success', text: 'Enlace / archivo PDF del cronograma guardado' });
      setShowPdfModal(false);
      setPdfFileBase64(null);
      loadSchedule();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al guardar el PDF',
      });
    } finally {
      setSavingPdf(false);
    }
  };

  const handleOpenMobilePreview = async () => {
    if (!currentEvent?.id) return;
    try {
      setLoadingPublic(true);
      setShowMobilePreview(true);
      const pub = await scheduleService.getPublicSchedule(currentEvent.id);
      setPublicData(pub);
    } catch (err: any) {
      console.error('Error al cargar vista pública:', err);
    } finally {
      setLoadingPublic(false);
    }
  };

  // Agrupamiento por días para la visualización
  const daysList = data.days.length > 0 ? data.days : ['Día 1'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-7 h-7 text-rose-500" />
            Cronograma de Conferencias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de ponencias, anuncios en vivo, avisos de cambios y keynotes para {currentEvent?.name || 'la edición actual'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.pdfUrl && (
            <a
              href={data.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <FileText className="w-4 h-4 text-rose-500" />
              Descargar PDF
            </a>
          )}

          <button
            onClick={handleOpenMobilePreview}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Smartphone className="w-4 h-4 text-emerald-500" />
            Vista Móvil / NOW
          </button>

          {canEdit && (
            <>
              {/* Botón Historial y Alertas */}
              <button
                onClick={handleOpenHistory}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                title="Ver historial de cambios y notificaciones programadas"
              >
                <History className="w-4 h-4 text-indigo-500" />
                Historial y Alertas
              </button>

              {/* Botón Crear Anuncio En Vivo */}
              <button
                onClick={() => {
                  setAnnouncementSubject('');
                  setAnnouncementMessage('');
                  setShowAnnouncementModal(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                title="Enviar un anuncio en vivo o aviso de pausa a los asistentes"
              >
                <Megaphone className="w-4 h-4 text-amber-500" />
                Crear Anuncio
              </button>

              <button
                onClick={() => setShowPdfModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Upload className="w-4 h-4 text-primary" />
                Configurar PDF
              </button>

              <button
                onClick={() => {
                  setImportResult(null);
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-500" />
                Importar Excel
              </button>

              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nueva Charla
              </button>
            </>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Charlas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.total}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Días del Evento</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.days.length || 1}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Salones / Aulas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.rooms.length}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Categorías</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.categories.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card p-4 rounded-xl border border-border space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título, expositor, tema o salón..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-card text-foreground focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Salón */}
          {data.rooms.length > 0 && (
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="min-w-0 max-sm:w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-card text-foreground"
            >
              <option value="ALL">Todos los salones</option>
              {data.rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}

          {/* Categoría */}
          {data.categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-w-0 max-sm:w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-card text-foreground"
            >
              <option value="ALL">Todas las categorías</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Estado */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="min-w-0 max-sm:w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-card text-foreground"
          >
            <option value="ALL">Todos los estados</option>
            <option value="CONFIRMED">Activa (no implica asistencia)</option>
            <option value="RESCHEDULED">Reagendada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>

        {/* Tabs de Días */}
        {daysList.length > 1 && (
          <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-700/60 pt-3 overflow-x-auto">
            <button
              onClick={() => setSelectedDay('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedDay === 'ALL'
                  ? 'bg-rose-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Todos los días ({data.total})
            </button>
            {daysList.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedDay === d
                    ? 'bg-rose-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista de Charlas */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400">
          <Clock className="w-6 h-6 animate-spin mr-2" />
          Cargando agenda del evento...
        </div>
      ) : data.items.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">No hay charlas registradas</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
            Puedes agregar charlas manualmente o importar la agenda del evento desde un archivo Excel.
          </p>
          {canEdit && (
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground"
              >
                <Plus className="w-4 h-4" />
                Agregar Primera Charla
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => {
            const isConfirmed = item.status === 'CONFIRMED';
            const isRescheduled = item.status === 'RESCHEDULED';
            const isCancelled = item.status === 'CANCELLED';
            const isRegistration =
              item.category?.toLowerCase() === 'registro' ||
              item.title.toLowerCase().includes('registro') ||
              item.title.toLowerCase().includes('acreditaci');
            const isDemo =
              item.category?.toLowerCase().includes('demo') ||
              item.title.toLowerCase().includes('[demo]') ||
              (item.speakerName?.toLowerCase().includes('demo') ?? false);
            const isKeynote = !!item.isKeynote;
            const visibility = item.visibility || 'PUBLISHED';

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-5 transition-all hover:shadow-md ${
                  isKeynote
                    ? 'bg-gradient-to-r from-amber-50/90 via-white to-amber-50/50 dark:from-amber-950/30 dark:via-gray-800 dark:to-amber-950/10 border-amber-300 dark:border-amber-800/80 shadow-sm ring-1 ring-amber-400/30'
                    : isRegistration
                    ? 'bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/40 dark:from-indigo-950/30 dark:via-gray-800 dark:to-indigo-950/10 border-indigo-200 dark:border-indigo-800/80 shadow-sm'
                    : isCancelled
                    ? 'bg-card border-border opacity-60'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* Horario */}
                    <div
                      className={`text-center border rounded-xl p-3 min-w-[90px] ${
                        isKeynote
                          ? 'bg-amber-100/70 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800'
                          : isRegistration
                          ? 'bg-indigo-100/70 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-800'
                          : 'bg-background border-border'
                      }`}
                    >
                      <p
                        className={`text-sm font-extrabold font-mono ${
                          isKeynote
                            ? 'text-amber-900 dark:text-amber-200'
                            : isRegistration
                            ? 'text-indigo-900 dark:text-indigo-200'
                            : 'text-foreground'
                        }`}
                      >
                        {item.startTime}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">a {item.endTime}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 text-[10px] font-semibold text-muted-foreground rounded">
                        {item.day}
                      </span>
                    </div>

                    {/* Contenido principal */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Keynote Badge */}
                        {isKeynote && (
                          <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-md bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Keynote Magistral
                          </span>
                        )}

                        <h3
                          className={`text-base font-bold text-foreground ${
                            isCancelled ? 'line-through text-gray-400' : ''
                          }`}
                        >
                          {item.title}{item.programmingStatus==='PENDING'&&<span className="block text-xs text-amber-500">Pendiente de programación</span>}
                        </h3>

                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                            isConfirmed
                              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : isRescheduled
                              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {item.programmingStatus==='PENDING'?'Pendiente de programación':isConfirmed ? 'Programada' : isRescheduled ? 'Reagendada' : 'Cancelada'}
                        </span>

                        {/* Visibility Pill */}
                        {visibility === 'DRAFT' && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-muted-foreground border border-gray-300 dark:border-gray-600 flex items-center gap-1">
                            <EyeOff className="w-3 h-3" /> Borrador (Oculto)
                          </span>
                        )}
                        {visibility === 'SCHEDULED' && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Programada
                            {item.publishAt ? ` (${new Date(item.publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                          </span>
                        )}

                        {isRegistration ? (
                          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Registro / Acreditación
                          </span>
                        ) : (
                          item.category && (
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                isDemo
                                  ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1'
                                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                              }`}
                            >
                              {isDemo && <Sparkles className="w-3 h-3 text-purple-500" />}
                              {item.category}
                            </span>
                          )
                        )}
                      </div>

                      {/* Expositor y empresa */}
                      {(item.speakerName || item.room) && (
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          {item.speakerName && (
                            <span className="inline-flex items-center gap-1 font-medium">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              {item.speakerName}
                              {item.speakerCompany && <span className="text-gray-400">({item.speakerCompany})</span>}
                            </span>
                          )}

                          {item.room && (
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              <MapPin className="w-3.5 h-3.5" />
                              {item.room}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Descripción */}
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 max-w-2xl mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-start">
                      {/* Botón de Publicar / Anunciar Keynote */}
                      {isKeynote && (
                        <button
                          onClick={() => {
                            setKeynoteItem(item);
                            setKeynoteTargetGroup('ALL');
                            setKeynoteAction(visibility === 'DRAFT' ? 'PUBLISH_AND_NOTIFY' : 'PUBLISH_AND_NOTIFY');
                            setKeynoteScheduledFor('');
                            setKeynoteCustomMessage('');
                            setShowKeynoteModal(true);
                          }}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                          title="Publicar o anunciar este Keynote"
                        >
                          <Megaphone className="w-3.5 h-3.5" />
                          Anunciar Keynote
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Editar charla"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        title="Eliminar charla"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR CHARLA */}
      {showItemModal && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-lg w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-500" />
                {editingItem ? 'Editar Charla' : 'Nueva Charla'}
              </h3>
              <button
                onClick={() => setShowItemModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="mt-4 space-y-4">
              {/* Keynote Checkbox */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    ¿Es una conferencia magistral (Keynote)?
                  </span>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Permite visibilidad especial, campaña de anuncio dedicada y aviso destacado.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={itemForm.isKeynote}
                  onChange={(e) => setItemForm({ ...itemForm, isKeynote: e.target.checked })}
                  className="w-5 h-5 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                />
              </div>

              {/* Visibilidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Visibilidad Pública
                  </label>
                  <select
                    value={itemForm.visibility}
                    onChange={(e) => setItemForm({ ...itemForm, visibility: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  >
                    <option value="PUBLISHED">Publicada (Visible)</option>
                    <option value="DRAFT">Borrador (Oculta al público)</option>
                    <option value="SCHEDULED">Programada (Auto-publicar)</option>
                    <option value="CANCELLED">Cancelada</option>
                  </select>
                </div>

                {itemForm.visibility === 'SCHEDULED' && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Fecha y Hora de Publicación
                    </label>
                    <input
                      type="datetime-local"
                      value={itemForm.publishAt}
                      onChange={(e) => setItemForm({ ...itemForm, publishAt: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Título de la Conferencia / Actividad *
                </label>
                <input
                  type="text"
                  required
                  value={itemForm.title}
                  onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                  placeholder="Ej. Introducción a Microservicios con Go"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Expositor / Facilitador
                  </label>
                  <select multiple aria-label="Charlistas asociados" className="input-field min-h-24" value={itemForm.speakerIds} onChange={e=>setItemForm({...itemForm,speakerIds:Array.from(e.target.selectedOptions,o=>o.value)})}>{speakerOptions.filter(s=>s.status!=='CANCELLED').map(s=><option key={s.id} value={s.id}>{s.fullName} {s.organization?'· '+s.organization:''}</option>)}</select>
                  <p className="text-xs text-muted-foreground">Opcional. Puedes asociar varios charlistas o guardar sin expositor.</p>
                  {editingItem?.speakerName&&!editingItem.speakerIds?.length&&<p className="text-xs">Expositor histórico conservado hasta asociar un perfil: {editingItem.speakerName}</p>}
                  {canEdit&&<button type="button" className="btn-secondary mt-2" onClick={()=>setNewSpeaker(v=>!v)}>Agregar nuevo charlista</button>}
                  {newSpeaker&&canEdit&&<div className="space-y-2 mt-2"><input aria-label="Nombre del nuevo charlista" className="input-field" placeholder="Nombre completo" value={speakerDraft.fullName} onChange={e=>setSpeakerDraft({...speakerDraft,fullName:e.target.value})}/><input aria-label="Correo del nuevo charlista" className="input-field" type="email" placeholder="Correo (opcional)" value={speakerDraft.email} onChange={e=>setSpeakerDraft({...speakerDraft,email:e.target.value})}/><input aria-label="Institución del nuevo charlista" className="input-field" placeholder="Institución (opcional)" value={speakerDraft.organization} onChange={e=>setSpeakerDraft({...speakerDraft,organization:e.target.value})}/><button type="button" className="btn-primary" disabled={savingItem||speakerDraft.fullName.trim().length<3} onClick={async()=>{setSavingItem(true);try{const existing=speakerOptions.find(s=>s.fullName.trim().toLowerCase()===speakerDraft.fullName.trim().toLowerCase());const profile=existing||(await api.post(`/events/${currentEvent!.id}/speakers`,{...speakerDraft,email:speakerDraft.email||null})).data.data;if(!existing)setSpeakerOptions(v=>[...v,profile]);setItemForm(v=>({...v,speakerIds:[...new Set([...v.speakerIds,profile.id])]}));setNewSpeaker(false);setSpeakerDraft({fullName:'',email:'',organization:''});}catch(e:any){setFeedback({type:'error',text:e.response?.data?.message||'No se pudo crear el charlista.'});}finally{setSavingItem(false);}}}>Crear y asociar</button></div>}

                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Empresa / Institución
                  </label>
                  <input
                    type="text"
                    value={itemForm.speakerCompany}
                    onChange={(e) => setItemForm({ ...itemForm, speakerCompany: e.target.value })}
                    placeholder="Ej. PUCMM, Google"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Fecha oficial de la edición</label>
                  {officialDates.length===1?<p>{officialDates[0]}</p>:<select aria-label="Fecha de la charla" className="input-field" value={itemForm.day} onChange={e=>setItemForm({...itemForm,day:e.target.value})}><option value="">Pendiente de asignar</option>{officialDates.map(day=><option key={day} value={day}>{day}</option>)}</select>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Hora Inicio (HH:MM)
                  </label>
                  <input
                    type="text"
                    pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                    value={itemForm.startTime}
                    onChange={(e) => setItemForm({ ...itemForm, startTime: formatTimeDraft(e.target.value, itemForm.startTime) })}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="HH:MM"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Hora Fin (HH:MM)
                  </label>
                  <input
                    type="text"
                    pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                    value={itemForm.endTime}
                    onChange={(e) => setItemForm({ ...itemForm, endTime: formatTimeDraft(e.target.value, itemForm.endTime) })}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="HH:MM"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Salón / Aula
                  </label>
                  <input
                    type="text"
                    value={itemForm.room}
                    onChange={(e) => setItemForm({ ...itemForm, room: e.target.value })}
                    placeholder="Ej. Auditorio I"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Categoría / Track
                  </label>
                  <input
                    type="text"
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    placeholder="Ej. Ciberseguridad"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">Sin fecha, horario completo o salón, se guardará como Pendiente de programación. La confirmación del charlista y su llegada se gestionan por separado.</p>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Descripción o Resumen
                </label>
                <textarea
                  rows={3}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Detalles sobre el contenido de la charla..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground disabled:opacity-50"
                >
                  {savingItem ? 'Guardando...' : editingItem ? 'Actualizar Charla' : 'Crear Charla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NOTIFICAR CAMBIOS DETECTADOS */}
      {showChangeNotificationModal && changePromptData && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-lg w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <Bell className="w-6 h-6 flex-shrink-0 animate-bounce" />
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Se ha actualizado esta actividad
                </h3>
                <p className="text-xs text-gray-500">¿Deseas notificar los cambios a los asistentes?</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <p className="font-bold">Actividad: {changePromptData.itemTitle}</p>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Modificaciones detectadas:</p>
                <div className="space-y-1 pl-2">
                  {changePromptData.diffs.map((d: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="font-bold text-muted-foreground">{d.field}:</span>
                      <span className="line-through text-rose-500">{String(d.oldValue || '—')}</span>
                      <span>→</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{String(d.newValue || '—')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Configuración de Destinatarios */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Audiencia / Destinatarios
                </label>
                <select
                  value={changeTargetGroup}
                  onChange={(e) => setChangeTargetGroup(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                >
                  <option value="ALL">Todos los inscritos</option>
                  <option value="CONFIRMED">Inscripciones confirmadas</option>
                  <option value="PAID">Participantes pagados</option>
                  <option value="COURTESY">Cortesías / Invitados especiales</option>
                  <option value="ATTENDED">Asistentes presentes (Check-in realizado)</option>
                  <option value="NOT_ATTENDED">Pendientes de check-in</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Tipo de Notificación
                </label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="radio"
                      name="changeActionType"
                      checked={changeActionType === 'SEND_NOW'}
                      onChange={() => setChangeActionType('SEND_NOW')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    Notificar ahora
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="radio"
                      name="changeActionType"
                      checked={changeActionType === 'SCHEDULE'}
                      onChange={() => setChangeActionType('SCHEDULE')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    Programar notificación
                  </label>
                </div>
              </div>

              {changeActionType === 'SCHEDULE' && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Fecha y Hora programada para el envío
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={changeScheduledFor}
                    onChange={(e) => setChangeScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Nota adicional para el correo (Opcional)
                </label>
                <input
                  type="text"
                  value={changeCustomNote}
                  onChange={(e) => setChangeCustomNote(e.target.value)}
                  placeholder="Ej. Disculpen los inconvenientes, se amplió el salón para mayor comodidad."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={handleDismissChangeNotification}
                className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                No notificar
              </button>

              <button
                type="button"
                onClick={handleConfirmChangeNotification}
                disabled={sendingChangeNotification || (changeActionType === 'SCHEDULE' && !changeScheduledFor)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingChangeNotification ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" /> Procesando...
                  </>
                ) : changeActionType === 'SCHEDULE' ? (
                  <>
                    <Clock className="w-4 h-4" /> Programar Notificación
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Notificar Ahora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PUBLICAR Y ANUNCIAR KEYNOTE */}
      {showKeynoteModal && keynoteItem && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-lg w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-500" />
                <h3 className="text-lg font-bold text-foreground">
                  Publicar y Anunciar Keynote
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowKeynoteModal(false);
                  setKeynoteItem(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumen del Keynote */}
            <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1.5 text-xs text-amber-950 dark:text-amber-200">
              <p className="font-extrabold text-sm text-foreground">{keynoteItem.title}</p>
              {keynoteItem.speakerName && (
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Orador: {keynoteItem.speakerName} {keynoteItem.speakerCompany ? `(${keynoteItem.speakerCompany})` : ''}
                </p>
              )}
              <p className="text-muted-foreground">
                Horario: {keynoteItem.day} • {keynoteItem.startTime} - {keynoteItem.endTime} {keynoteItem.room ? `• ${keynoteItem.room}` : ''}
              </p>
              {keynoteItem.description && (
                <p className="text-muted-foreground italic line-clamp-2 mt-1">
                  "{keynoteItem.description}"
                </p>
              )}
            </div>

            <form onSubmit={handlePublishKeynoteSubmit} className="space-y-4">
              {/* Opciones de Acción */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Acción a realizar *
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <input
                      type="radio"
                      name="keynoteAction"
                      value="PUBLISH_AND_NOTIFY"
                      checked={keynoteAction === 'PUBLISH_AND_NOTIFY'}
                      onChange={() => setKeynoteAction('PUBLISH_AND_NOTIFY')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs">
                      <p className="font-bold text-foreground">Publicar y enviar anuncio ahora</p>
                      <p className="text-gray-500">Hace pública la charla y despacha un correo de anuncio inmediato a la audiencia.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <input
                      type="radio"
                      name="keynoteAction"
                      value="SCHEDULE_PUBLISH_AND_NOTIFY"
                      checked={keynoteAction === 'SCHEDULE_PUBLISH_AND_NOTIFY'}
                      onChange={() => setKeynoteAction('SCHEDULE_PUBLISH_AND_NOTIFY')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs">
                      <p className="font-bold text-foreground">Programar publicación y envío</p>
                      <p className="text-gray-500">Se revelará y notificará automáticamente en la fecha y hora configurada.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <input
                      type="radio"
                      name="keynoteAction"
                      value="PUBLISH_ONLY"
                      checked={keynoteAction === 'PUBLISH_ONLY'}
                      onChange={() => setKeynoteAction('PUBLISH_ONLY')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs">
                      <p className="font-bold text-foreground">Solo publicar en el cronograma</p>
                      <p className="text-gray-500">Muestra la charla al público sin enviar correos a los asistentes.</p>
                    </div>
                  </label>
                </div>
              </div>

              {keynoteAction === 'SCHEDULE_PUBLISH_AND_NOTIFY' && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Fecha y Hora de Publicación y Envío *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={keynoteScheduledFor}
                    onChange={(e) => setKeynoteScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              )}

              {keynoteAction !== 'PUBLISH_ONLY' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Destinatarios del Anuncio
                    </label>
                    <select
                      value={keynoteTargetGroup}
                      onChange={(e) => setKeynoteTargetGroup(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                    >
                      <option value="ALL">Todos los inscritos</option>
                      <option value="CONFIRMED">Inscripciones confirmadas</option>
                      <option value="PAID">Participantes pagados</option>
                      <option value="COURTESY">Cortesías / Invitados especiales</option>
                      <option value="ATTENDED">Asistentes presentes (Check-in realizado)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Mensaje de Introducción Personalizado (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={keynoteCustomMessage}
                      onChange={(e) => setKeynoteCustomMessage(e.target.value)}
                      placeholder="Ej. Nos complace anunciar a nuestro expositor principal de este año..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowKeynoteModal(false);
                    setKeynoteItem(null);
                  }}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processingKeynote || (keynoteAction === 'SCHEDULE_PUBLISH_AND_NOTIFY' && !keynoteScheduledFor)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 flex items-center gap-2"
                >
                  {processingKeynote ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" /> Procesando...
                    </>
                  ) : (
                    <>
                      <Megaphone className="w-4 h-4" /> Confirmar Keynote
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR ANUNCIO EN VIVO / PAUSA */}
      {showAnnouncementModal && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-lg w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Megaphone className="w-6 h-6 text-amber-500" />
                <h3 className="text-lg font-bold text-foreground">
                  Crear Anuncio en Vivo
                </h3>
              </div>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendAnnouncementSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Asunto del Anuncio *
                </label>
                <input
                  type="text"
                  required
                  value={announcementSubject}
                  onChange={(e) => setAnnouncementSubject(e.target.value)}
                  placeholder="Ej. ¡Pausa de Café y Sesión de Networking!"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Mensaje del Anuncio *
                </label>
                <textarea
                  required
                  rows={4}
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="Escribe el mensaje que recibirán los asistentes por correo..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Destinatarios
                  </label>
                  <select
                    value={announcementTargetGroup}
                    onChange={(e) => setAnnouncementTargetGroup(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  >
                    <option value="ALL">Todos los inscritos</option>
                    <option value="ATTENDED">Asistentes presentes (Check-in)</option>
                    <option value="CONFIRMED">Inscripciones confirmadas</option>
                    <option value="PAID">Participantes pagados</option>
                    <option value="COURTESY">Cortesías</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Prioridad
                  </label>
                  <select
                    value={announcementPriority}
                    onChange={(e) => setAnnouncementPriority(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="URGENT">Urgente / Inmediata</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Acción de Envío
                </label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="radio"
                      name="announcementAction"
                      checked={announcementAction === 'SEND_NOW'}
                      onChange={() => setAnnouncementAction('SEND_NOW')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    Enviar ahora
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="radio"
                      name="announcementAction"
                      checked={announcementAction === 'SCHEDULE'}
                      onChange={() => setAnnouncementAction('SCHEDULE')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    Programar
                  </label>
                </div>
              </div>

              {announcementAction === 'SCHEDULE' && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Fecha y Hora programada para el envío
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={announcementScheduledFor}
                    onChange={(e) => setAnnouncementScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingAnnouncement || (announcementAction === 'SCHEDULE' && !announcementScheduledFor)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 flex items-center gap-2"
                >
                  {sendingAnnouncement ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" /> Enviando...
                    </>
                  ) : announcementAction === 'SCHEDULE' ? (
                    <>
                      <Clock className="w-4 h-4" /> Programar Anuncio
                    </>
                  ) : (
                    <>
                      <Megaphone className="w-4 h-4" /> Enviar Anuncio Ahora
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL Y ALERTAS */}
      {showHistoryModal && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-2xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <History className="w-6 h-6 text-indigo-500" />
                <h3 className="text-lg font-bold text-foreground">
                  Historial de Cambios y Notificaciones
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border gap-4">
              <button
                onClick={() => setHistoryTab('LOGS')}
                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
                  historyTab === 'LOGS'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Registro de Cambios ({changeLogs.length})
              </button>
              <button
                onClick={() => setHistoryTab('SCHEDULED')}
                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
                  historyTab === 'SCHEDULED'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Notificaciones Programadas ({scheduledNotifications.length})
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Clock className="w-5 h-5 animate-spin mx-auto mb-2" />
                Cargando historial...
              </div>
            ) : historyTab === 'LOGS' ? (
              <div className="space-y-3">
                {changeLogs.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">
                    No se han registrado modificaciones de cronograma aún.
                  </p>
                ) : (
                  changeLogs.map((log) => {
                    const diffs = Array.isArray(log.diffPayload)
                      ? log.diffPayload
                      : typeof log.diffPayload === 'string'
                      ? JSON.parse(log.diffPayload || '[]')
                      : [];

                    return (
                      <div
                        key={log.id}
                        className="p-3 bg-muted/50 rounded-xl border border-border/60 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground">
                            {log.scheduleItem?.title || log.changeType}
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {diffs.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-700/40">
                            {diffs.map((d: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 font-mono text-[11px]">
                                <span className="font-semibold text-muted-foreground">{d.field}:</span>
                                <span className="line-through text-rose-500">{String(d.oldValue || '—')}</span>
                                <span>→</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {String(d.newValue || '—')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              log.notified
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                : 'bg-gray-200 dark:bg-gray-700 text-muted-foreground'
                            }`}
                          >
                            {log.notified ? '✓ Notificado a asistentes' : 'Sin notificación'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledNotifications.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">
                    No hay notificaciones programadas pendientes o registradas.
                  </p>
                ) : (
                  scheduledNotifications.map((notif) => {
                    const isPending = notif.status === 'PENDING';
                    return (
                      <div
                        key={notif.id}
                        className="p-3 bg-muted/50 rounded-xl border border-border/60 text-xs flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground uppercase">
                              {notif.type}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isPending
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                                  : notif.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : notif.status === 'CANCELLED'
                                  ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                              }`}
                            >
                              {notif.status}
                            </span>
                          </div>
                          <p className="text-gray-500">
                            Audiencia: <span className="font-semibold">{notif.targetGroup}</span> • Programado para:{' '}
                            <span className="font-mono font-semibold text-foreground">
                              {new Date(notif.scheduledFor).toLocaleString()}
                            </span>
                          </p>
                        </div>

                        {isPending && (
                          <button
                            onClick={() => handleCancelNotification(notif.id)}
                            disabled={cancellingNotificationId === notif.id}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold disabled:opacity-50"
                          >
                            {cancellingNotificationId === notif.id ? 'Cancelando...' : 'Cancelar Envío'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR EXCEL */}
      {showImportModal && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                Importar Agenda de Conferencias
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Sube un archivo Excel (.xlsx, .xls) o CSV con las columnas:{' '}
                <strong>Título, Expositor, Aula, Inicio, Fin, Categoría, Día</strong>.
              </p>

              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-rose-500 transition-colors">
                <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <label className="cursor-pointer">
                  <span className="text-sm font-semibold text-rose-500 hover:text-rose-600">
                    Selecciona un archivo
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileImport}
                    disabled={importing}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Formatos compatibles: XLSX, XLS, CSV</p>
              </div>

              {importing && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
                  <Clock className="w-4 h-4 animate-spin text-rose-500" />
                  Procesando e importando conferencias...
                </div>
              )}

              {importResult && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
                  <p className="font-semibold">Resultado de la importación:</p>
                  <p>Total filas leídas: {importResult.totalRows}</p>
                  <p>Charlas importadas: {importResult.importedCount}</p>
                  {importResult.errorCount > 0 && (
                    <p className="text-rose-500">Filas omitidas o con error: {importResult.errorCount}</p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR PDF */}
      {showPdfModal && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 max-sm:max-h-full max-sm:overflow-y-auto border border-border shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                PDF del Cronograma
              </h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePdf} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Enlace público del PDF
                </label>
                <input
                  type="text"
                  value={pdfUrlInput}
                  onChange={(e) => setPdfUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/cronograma.pdf o /uploads/..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="text-center text-xs text-gray-400">— o subir archivo PDF local —</div>

              <div>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const base64 = (evt.target?.result as string).split(',')[1];
                        setPdfFileBase64(base64);
                        setPdfUrlInput(`[Archivo local listo: ${file.name}]`);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 dark:file:bg-rose-950/40 dark:file:text-rose-300"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPdf || (!pdfUrlInput && !pdfFileBase64)}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {savingPdf ? 'Guardando...' : 'Guardar PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VISTA PÚBLICA MÓVIL (NOW / NEXT) */}
      {showMobilePreview && (
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-950 rounded-3xl max-w-sm w-full p-5 border border-gray-800 shadow-2xl max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">En Vivo / Agenda Móvil</h3>
              </div>
              <button onClick={() => setShowMobilePreview(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingPublic ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Clock className="w-5 h-5 animate-spin mx-auto mb-2" />
                Sincronizando charlas en curso...
              </div>
            ) : publicData ? (
              <div className="mt-4 space-y-5">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">Hora del sistema</p>
                  <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{publicData.currentTime}</p>
                </div>

                {publicData.groupedByDay.map((group: any) => (
                  <div key={group.day} className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group.day}</h4>

                    {/* NOW */}
                    {group.nowItems.length > 0 && (
                      <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3">
                        <span className="px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-extrabold rounded-md uppercase">
                          AHORA MISMO
                        </span>
                        {group.nowItems.map((nItem: any) => (
                          <div key={nItem.id} className="mt-2">
                            <p className="text-sm font-bold text-white">{nItem.title}</p>
                            <p className="text-xs text-emerald-400 mt-0.5">
                              {nItem.speakerName} • {nItem.room}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* NEXT */}
                    {group.nextItems.length > 0 && (
                      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-3">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-md uppercase">
                          A CONTINUACIÓN
                        </span>
                        {group.nextItems.map((nextItem: any) => (
                          <div key={nextItem.id} className="mt-2 pt-2 border-t border-gray-800/60 first:border-0 first:pt-0">
                            <div className="flex justify-between items-start">
                              <p className="text-xs font-bold text-white">{nextItem.title}</p>
                              <span className="text-[10px] font-mono text-gray-400">{nextItem.startTime}</span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {nextItem.speakerName} • {nextItem.room}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}


    </div>
  );
};
