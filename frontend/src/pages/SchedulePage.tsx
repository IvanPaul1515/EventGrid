import React, { useState, useEffect, useCallback } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { scheduleService, ScheduleItem, ScheduleResponse } from '../services/schedule.service';
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
} from 'lucide-react';

export const SchedulePage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole } = useAuth();
  const canEdit = hasRole(['ADMIN', 'OPERATOR']);

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
    speakerName: '',
    speakerBio: '',
    speakerCompany: '',
    room: '',
    day: 'Día 1',
    startTime: '09:00',
    endTime: '10:00',
    category: '',
    status: 'CONFIRMED' as 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED',
    description: '',
  });
  const [savingItem, setSavingItem] = useState(false);

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

  const loadSchedule = useCallback(async () => {
    if (!currentEvent?.id) return;
    try {
      setLoading(true);
      const res = await scheduleService.getSchedule(currentEvent.id, {
        day: selectedDay !== 'ALL' ? selectedDay : undefined,
        room: selectedRoom !== 'ALL' ? selectedRoom : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: search.trim() || undefined,
      });
      setData(res);
      if (res.pdfUrl) {
        setPdfUrlInput(res.pdfUrl);
      }
    } catch (err: any) {
      console.error('Error al cargar cronograma:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al obtener el cronograma de conferencias',
      });
    } finally {
      setLoading(false);
    }
  }, [currentEvent?.id, selectedDay, selectedRoom, selectedCategory, selectedStatus, search]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setItemForm({
      title: '',
      speakerName: '',
      speakerBio: '',
      speakerCompany: '',
      room: data.rooms[0] || 'Aula Principal',
      day: data.days[0] || 'Día 1',
      startTime: '09:00',
      endTime: '10:00',
      category: data.categories[0] || 'Tecnología',
      status: 'CONFIRMED',
      description: '',
    });
    setShowItemModal(true);
  };

  const handleOpenEdit = (item: ScheduleItem) => {
    setEditingItem(item);
    setItemForm({
      title: item.title,
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
    });
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent?.id) return;
    try {
      setSavingItem(true);
      if (editingItem) {
        await scheduleService.updateItem(currentEvent.id, editingItem.id, itemForm);
        setFeedback({ type: 'success', text: 'Charla actualizada correctamente' });
      } else {
        await scheduleService.createItem(currentEvent.id, itemForm);
        setFeedback({ type: 'success', text: 'Charla agregada al cronograma' });
      }
      setShowItemModal(false);
      loadSchedule();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Error al guardar la charla',
      });
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (item: ScheduleItem) => {
    if (!currentEvent?.id) return;
    if (!window.confirm(`¿Seguro que deseas eliminar "${item.title}" del cronograma?`)) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-7 h-7 text-rose-500" />
            Cronograma de Conferencias
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestión completa de ponencias, horarios, aulas y agenda para {currentEvent?.name || 'la edición actual'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.pdfUrl && (
            <a
              href={data.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <FileText className="w-4 h-4 text-rose-500" />
              Descargar PDF
            </a>
          )}

          <button
            onClick={handleOpenMobilePreview}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Smartphone className="w-4 h-4 text-emerald-500" />
            Vista Móvil / NOW
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => setShowPdfModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Upload className="w-4 h-4 text-blue-500" />
                Configurar PDF
              </button>

              <button
                onClick={() => {
                  setImportResult(null);
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-500" />
                Importar Excel
              </button>

              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors"
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
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Charlas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{data.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Días del Evento</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{data.days.length || 1}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Salones / Aulas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{data.rooms.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categorías</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{data.categories.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título, expositor, tema o salón..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Salón */}
          {data.rooms.length > 0 && (
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          >
            <option value="ALL">Todos los estados</option>
            <option value="CONFIRMED">Confirmada</option>
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
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">No hay charlas registradas</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
            Puedes agregar charlas manualmente o importar la agenda del evento desde un archivo Excel.
          </p>
          {canEdit && (
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
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

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-5 transition-all hover:shadow-md ${
                  isCancelled
                    ? 'border-gray-200 dark:border-gray-800 opacity-60'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* Horario */}
                    <div className="text-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 min-w-[90px]">
                      <p className="text-sm font-extrabold text-gray-900 dark:text-white font-mono">
                        {item.startTime}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">a {item.endTime}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 text-[10px] font-semibold text-gray-600 dark:text-gray-300 rounded">
                        {item.day}
                      </span>
                    </div>

                    {/* Contenido principal */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-base font-bold text-gray-900 dark:text-white ${
                            isCancelled ? 'line-through text-gray-400' : ''
                          }`}
                        >
                          {item.title}
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
                          {isConfirmed ? 'Confirmada' : isRescheduled ? 'Reagendada' : 'Cancelada'}
                        </span>

                        {item.category && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                            {item.category}
                          </span>
                        )}
                      </div>

                      {/* Expositor y empresa */}
                      {(item.speakerName || item.room) && (
                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
                          {item.speakerName && (
                            <span className="inline-flex items-center gap-1 font-medium">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              {item.speakerName}
                              {item.speakerCompany && (
                                <span className="text-gray-400">({item.speakerCompany})</span>
                              )}
                            </span>
                          )}

                          {item.room && (
                            <span className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                              <MapPin className="w-3.5 h-3.5" />
                              {item.room}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Descripción */}
                      {item.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 max-w-2xl mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  {canEdit && (
                    <div className="flex items-center gap-2 self-end sm:self-start">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
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
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Título de la Conferencia / Actividad *
                </label>
                <input
                  type="text"
                  required
                  value={itemForm.title}
                  onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                  placeholder="Ej. Introducción a Microservicios con Go"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Expositor / Facilitador
                  </label>
                  <input
                    type="text"
                    value={itemForm.speakerName}
                    onChange={(e) => setItemForm({ ...itemForm, speakerName: e.target.value })}
                    placeholder="Nombre completo"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Empresa / Institución
                  </label>
                  <input
                    type="text"
                    value={itemForm.speakerCompany}
                    onChange={(e) => setItemForm({ ...itemForm, speakerCompany: e.target.value })}
                    placeholder="Ej. PUCMM, Google"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Día</label>
                  <input
                    type="text"
                    value={itemForm.day}
                    onChange={(e) => setItemForm({ ...itemForm, day: e.target.value })}
                    placeholder="Día 1"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Hora Inicio (HH:MM)
                  </label>
                  <input
                    type="text"
                    required
                    pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                    value={itemForm.startTime}
                    onChange={(e) => setItemForm({ ...itemForm, startTime: e.target.value })}
                    placeholder="09:00"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Hora Fin (HH:MM)
                  </label>
                  <input
                    type="text"
                    required
                    pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                    value={itemForm.endTime}
                    onChange={(e) => setItemForm({ ...itemForm, endTime: e.target.value })}
                    placeholder="10:00"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Salón / Aula
                  </label>
                  <input
                    type="text"
                    value={itemForm.room}
                    onChange={(e) => setItemForm({ ...itemForm, room: e.target.value })}
                    placeholder="Ej. Auditorio I"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Categoría / Track
                  </label>
                  <input
                    type="text"
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    placeholder="Ej. Ciberseguridad"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select
                  value={itemForm.status}
                  onChange={(e) => setItemForm({ ...itemForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="RESCHEDULED">Reagendada</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Descripción o Resumen
                </label>
                <textarea
                  rows={3}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Detalles sobre el contenido de la charla..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                >
                  {savingItem ? 'Guardando...' : editingItem ? 'Actualizar Charla' : 'Crear Charla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR EXCEL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sube un archivo Excel (.xlsx, .xls) o CSV con las columnas:{' '}
                <strong>Título, Expositor, Aula, Inicio, Fin, Categoría, Día</strong>.
              </p>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:border-rose-500 transition-colors">
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
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-500" />
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
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Enlace público del PDF
                </label>
                <input
                  type="text"
                  value={pdfUrlInput}
                  onChange={(e) => setPdfUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/cronograma.pdf o /uploads/..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-950 rounded-3xl max-w-sm w-full p-5 border border-gray-800 shadow-2xl max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">En Vivo / Agenda Móvil</h3>
              </div>
              <button
                onClick={() => setShowMobilePreview(false)}
                className="text-gray-400 hover:text-white"
              >
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
