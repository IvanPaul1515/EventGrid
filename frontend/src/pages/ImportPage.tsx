import React, { useState, useEffect, useRef } from 'react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  importService,
  AnalyzeResult,
  ValidationResult,
  ExecutionResult,
  ImportBatchItem,
} from '../services/import.service';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Download,
  Check,
  ChevronRight,
  FileCheck,
  History,
  Tag,
  ShieldCheck,
  Info,
  Clock,
  User,
  Trash2,
} from 'lucide-react';

type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

interface SystemFieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

const SYSTEM_FIELDS: SystemFieldDef[] = [
  { key: 'fullName', label: 'Nombre Completo', required: false, description: 'Nombres y apellidos juntos en una sola columna' },
  { key: 'firstName', label: 'Nombres', required: false, description: 'Primer y segundo nombre del asistente' },
  { key: 'lastName', label: 'Apellidos', required: false, description: 'Apellidos completos del participante' },
  { key: 'email', label: 'Correo Electrónico', required: true, description: 'Correo institucional o personal único' },
  { key: 'documentId', label: 'Cédula / Documento', required: false, description: 'Cédula dominicana (11 dígitos) o pasaporte' },
  { key: 'phone', label: 'Teléfono Principal', required: false, description: 'Celular o teléfono de contacto' },
  { key: 'alternatePhone', label: 'Teléfono Alterno', required: false, description: 'Contacto secundario' },
  { key: 'institution', label: 'Institución / Empresa', required: false, description: 'Universidad, empresa o centro educativo' },
  { key: 'ticketType', label: 'Tipo de Entrada', required: false, description: 'General, VIP, Estudiante, etc.' },
  { key: 'registrationNumber', label: 'No. Registro / Ticket', required: false, description: 'Código o número de ticket (autogenerado si se omite)' },
  { key: 'paymentMethod', label: 'Forma de Pago', required: false, description: 'Efectivo, Tarjeta, Transferencia, Cortesía, etc.' },
  { key: 'totalAmount', label: 'Pago Total (RD$)', required: false, description: 'Monto pagado en pesos dominicanos' },
  { key: 'salesResponsible', label: 'Responsable de Venta', required: false, description: 'Persona o comité receptor del pago' },
  { key: 'status', label: 'Estado Confirmación', required: false, description: 'CONFIRMED, PENDING, ATTENDED o CANCELLED' },
  { key: 'attended', label: 'Asistencia / Check-in', required: false, description: 'Indica si el participante ya asistió físicamente' },
  { key: 'isCourtesy', label: 'Es Cortesía', required: false, description: 'Indica si la entrada es de cortesía (RD$ 0.00)' },
  { key: 'courtesyAuthorizedBy', label: 'Autorizado Por', required: false, description: 'Quién autoriza la cortesía' },
  { key: 'notes', label: 'Observaciones / Notas', required: false, description: 'Notas o comentarios sobre el participante' },
];

export const ImportPage: React.FC = () => {
  const { currentEvent } = useEdition();
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();

  // Paso actual
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);

  // Archivo y análisis (Pasos 1 y 2)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);

  // Mapeo de columnas (Paso 3)
  // Formato: { "Nombres": "firstName", "Correo": "email", ... }
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Validación de filas (Paso 4)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [validationFilter, setValidationFilter] = useState<'ALL' | 'ERROR' | 'DUPLICATE' | 'VALID'>('ALL');

  // Resolución de conflictos (Paso 5)
  const [conflictStrategy, setConflictStrategy] = useState<'SKIP' | 'UPDATE' | 'ONLY_NEW'>('SKIP');

  // Ejecución transaccional (Paso 6)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [loadingExecute, setLoadingExecute] = useState(false);

  // Historial de lotes
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Alerta de error
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados para borrado de lotes de Excel
  const [batchToDelete, setBatchToDelete] = useState<ImportBatchItem | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar historial de lotes al montar
  useEffect(() => {
    fetchBatches();
  }, [currentEvent?.id]);

  const fetchBatches = async () => {
    if (!currentEvent) return;
    try {
      setLoadingBatches(true);
      const data = await importService.getBatches();
      setBatches(data);
    } catch (err) {
      console.error('Error al cargar historial de lotes:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleDeleteBatch = async (batch: ImportBatchItem) => {
    try {
      setDeletingBatchId(batch.id);
      setErrorMessage(null);
      const res = await importService.deleteBatch(batch.id);
      setSuccessMessage(
        `El archivo '${batch.fileName}' y sus ${res.deletedRegistrationsCount} registros fueron eliminados correctamente.`
      );
      setBatchToDelete(null);
      await fetchBatches();
      if (executionResult?.batchId === batch.id) {
        handleReset();
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Error al eliminar el lote de Excel');
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleDeleteAllBatches = async () => {
    try {
      setDeletingAll(true);
      setErrorMessage(null);
      const res = await importService.deleteAllImported();
      setSuccessMessage(
        `Se eliminaron ${res.deletedBatchesCount} lote(s) de Excel y ${res.deletedRegistrationsCount} registro(s) importados.`
      );
      setIsDeleteAllOpen(false);
      await fetchBatches();
      handleReset();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Error al eliminar todas las importaciones');
    } finally {
      setDeletingAll(false);
    }
  };

  // Convertir archivo a Base64
  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target?.result as string;
      setFileBase64(b64);
      await analyzeWorkbook(b64, file.name);
    };
    reader.onerror = () => {
      setErrorMessage('Error al leer el archivo en el navegador');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Analizar archivo en el backend
  const analyzeWorkbook = async (b64: string, fileName: string, sheet?: string) => {
    setLoadingAnalyze(true);
    setErrorMessage(null);
    try {
      const res = await importService.analyze(b64, fileName, sheet);
      setAnalyzeResult(res);
      setSelectedSheet(res.selectedSheet);

      // Iniciar el mapeo con la autodetección
      const initialMap: Record<string, string> = {};
      res.columns.forEach((col) => {
        if (res.autoMapping[col]) {
          initialMap[col] = res.autoMapping[col];
        } else {
          initialMap[col] = '';
        }
      });
      setColumnMapping(initialMap);
      setCurrentStep(2);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Error al analizar el archivo Excel');
    } finally {
      setLoadingAnalyze(false);
    }
  };

  // Cambiar hoja seleccionada (Paso 2)
  const handleSheetChange = async (sheet: string) => {
    if (!fileBase64 || !selectedFile || sheet === selectedSheet) return;
    await analyzeWorkbook(fileBase64, selectedFile.name, sheet);
  };

  // Validar campos obligatorios en el mapeo (Paso 3)
  const handleProceedToValidate = async () => {
    setErrorMessage(null);

    // Verificar campos requeridos (firstName, lastName, email)
    const mappedTargets = Object.values(columnMapping);
    const missingFields: string[] = [];
    if (!mappedTargets.includes('firstName')) missingFields.push('Nombres (firstName)');
    if (!mappedTargets.includes('lastName')) missingFields.push('Apellidos (lastName)');
    if (!mappedTargets.includes('email')) missingFields.push('Correo Electrónico (email)');

    if (missingFields.length > 0) {
      setErrorMessage(`Faltan campos obligatorios por asociar: ${missingFields.join(', ')}`);
      return;
    }

    if (!analyzeResult || !analyzeResult.rows) {
      setErrorMessage('No hay datos en memoria para validar');
      return;
    }

    setLoadingValidate(true);
    try {
      const valRes = await importService.validate(
        analyzeResult.fileName,
        selectedSheet,
        analyzeResult.rows,
        columnMapping
      );
      setValidationResult(valRes);
      setCurrentStep(4);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Error durante la validación de registros');
    } finally {
      setLoadingValidate(false);
    }
  };

  // Ejecutar importación transaccional (Paso 5 -> 6)
  const handleExecuteImport = async () => {
    if (!analyzeResult || !selectedFile) return;
    setLoadingExecute(true);
    setErrorMessage(null);

    try {
      const execRes = await importService.execute(
        analyzeResult.fileName,
        selectedFile.size,
        selectedSheet,
        analyzeResult.rows,
        columnMapping,
        conflictStrategy
      );
      setExecutionResult(execRes);
      setCurrentStep(6);
      await fetchBatches();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Error crítico durante la importación');
    } finally {
      setLoadingExecute(false);
    }
  };

  // Reiniciar asistente
  const handleReset = () => {
    setSelectedFile(null);
    setFileBase64('');
    setAnalyzeResult(null);
    setColumnMapping({});
    setValidationResult(null);
    setExecutionResult(null);
    setErrorMessage(null);
    setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stepsList = [
    { num: 1, title: 'Cargar Archivo', short: 'Archivo' },
    { num: 2, title: 'Analizar Hoja', short: 'Hojas' },
    { num: 3, title: 'Asociar Columnas', short: 'Mapeo' },
    { num: 4, title: 'Validación', short: 'Validar' },
    { num: 5, title: 'Resolución', short: 'Estrategia' },
    { num: 6, title: 'Resultado', short: 'Completado' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              {currentEvent?.name || 'Edición'}
            </span>
            <span className="text-xs text-muted-foreground">• Motor de Importación Transaccional</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Asistente de Importación Inteligente
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Carga masiva y migración de asistentes para <strong>{currentEvent?.name || 'su evento'}</strong> mediante archivos .xlsx, .xls o .csv.
          </p>
        </div>

        {currentStep > 1 && currentStep < 6 && (
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Cancelar y Volver al Paso 1</span>
          </button>
        )}
      </div>

      {/* Stepper Visual de 6 Pasos */}
      <div className="grid grid-cols-6 gap-2 p-2 rounded-2xl bg-card border border-border shadow-sm">
        {stepsList.map((st) => {
          const isActive = currentStep === st.num;
          const isDone = currentStep > st.num;
          return (
            <div
              key={st.num}
              onClick={() => {
                if (isDone && currentStep !== 6) setCurrentStep(st.num as StepNumber);
              }}
              className={`p-2.5 rounded-xl text-center transition-all ${
                isActive
                  ? 'bg-primary text-white font-bold shadow-md shadow-primary/25'
                  : isDone
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-pointer hover:bg-emerald-500/20'
                  : 'text-muted-foreground bg-background/50 border border-border/50'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-[10px] font-mono mb-0.5">
                {isDone ? <Check className="w-3 h-3" /> : <span>Paso {st.num}</span>}
              </div>
              <span className="text-xs font-semibold block truncate">{st.short}</span>
            </div>
          );
        })}
      </div>

      {/* Alerta de Error Global */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="opacity-70 hover:opacity-100 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 1: CARGA DE ARCHIVO                                 */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border-2 border-dashed border-border bg-card/60 p-12 text-center hover:border-primary/60 hover:bg-card transition-all cursor-pointer group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-primary/10 group-hover:bg-primary/20 text-primary mx-auto flex items-center justify-center mb-4 transition-all">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              Arrastra tu archivo Excel aquí o haz clic para examinar
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Admite formatos <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong> de Google Forms, Eventbrite o listados históricos de BarCamp RD.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Seleccionar Archivo del Computador</span>
            </div>
          </div>

          {/* Tarjetas informativas de formatos y campos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 font-bold text-foreground mb-1.5">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Autodetección por Alias</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                El sistema detecta encabezados variados como <em>"Nombres"</em>, <em>"First Name"</em>, <em>"Cédula"</em>, <em>"Documento"</em>, <em>"Forma de Pago"</em> o <em>"Total"</em> sin requerir renombramientos previos.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 font-bold text-foreground mb-1.5">
                <Tag className="w-4 h-4 text-amber-400" />
                <span>Gestión de Cortesías</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Si el archivo contiene asistentes marcados como <em>Cortesía</em> o monto en 0, se registran como boletos gratuitos autorizados y no sumarán a la recaudación de taquilla.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 font-bold text-foreground mb-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Aislamiento por Edición</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Los participantes se asociarán con aislamiento estricto a <strong>{currentEvent?.name}</strong>, conservando el historial de participaciones si ya existían en años anteriores.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 2: ANALIZAR HOJA Y ENCABEZADOS                      */}
      {/* ======================================================== */}
      {currentStep === 2 && analyzeResult && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                  Archivo cargado
                </span>
                <span className="text-sm font-bold text-foreground font-mono">
                  {analyzeResult.fileName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                  {analyzeResult.totalRows} filas detectadas
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 font-mono">
                  Fila de cabecera: {analyzeResult.headerRowIndex + 1}
                </span>
              </div>
            </div>

            {/* Selector de Pestañas/Hojas si el libro tiene más de una */}
            {analyzeResult.sheets.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Selecciona la hoja a importar:
                </label>
                <div className="flex flex-wrap gap-2">
                  {analyzeResult.sheets.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => handleSheetChange(sheet)}
                      disabled={loadingAnalyze}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        sheet === selectedSheet
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {sheet}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vista Previa de Filas Iniciales */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Vista Previa de Columnas Detectadas ({analyzeResult.columns.length})
                </span>
                <span className="text-[11px] text-muted-foreground">Primeras 5 filas</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-muted-foreground font-mono text-[11px]">
                      <th className="p-2.5 font-bold">#</th>
                      {analyzeResult.columns.map((col, idx) => (
                        <th key={idx} className="p-2.5 font-bold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analyzeResult.previewRows.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-muted/30">
                        <td className="p-2.5 font-mono text-muted-foreground">{rIdx + 1}</td>
                        {analyzeResult.columns.map((col, cIdx) => (
                          <td key={cIdx} className="p-2.5 whitespace-nowrap text-foreground">
                            {row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cambiar Archivo</span>
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <span>Continuar al Mapeo de Columnas</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 3: ASOCIACIÓN DE COLUMNAS (MAPEO INTELIGENTE)       */}
      {/* ======================================================== */}
      {currentStep === 3 && analyzeResult && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Mapeo de Campos del Sistema vs. Columnas de tu Excel
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Los campos marcados con asterisco (*) son obligatorios. Las coincidencias por alias ya han sido preseleccionadas automáticamente.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground font-mono text-[11px]">
                    <th className="p-3 font-bold">Campo de EventGrid</th>
                    <th className="p-3 font-bold">Descripción</th>
                    <th className="p-3 font-bold">Columna en tu Archivo Excel</th>
                    <th className="p-3 font-bold text-center">Estado Mapeo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {SYSTEM_FIELDS.map((sysField) => {
                    // Buscar qué columna de Excel apunta a este sysField.key
                    const mappedColumn = Object.entries(columnMapping).find(
                      ([_, target]) => target === sysField.key
                    )?.[0] || '';

                    return (
                      <tr key={sysField.key} className="hover:bg-muted/20">
                        <td className="p-3 font-bold text-foreground whitespace-nowrap">
                          {sysField.label}
                          {sysField.required && <span className="text-rose-500 ml-1">*</span>}
                        </td>
                        <td className="p-3 text-muted-foreground text-[11px]">
                          {sysField.description}
                        </td>
                        <td className="p-3">
                          <select
                            value={mappedColumn}
                            onChange={(e) => {
                              const newCol = e.target.value;
                              const updated = { ...columnMapping };
                              // Desvincular columna previa de este campo
                              for (const [c, t] of Object.entries(updated)) {
                                if (t === sysField.key) updated[c] = '';
                              }
                              // Vincular la nueva columna a este campo
                              if (newCol) {
                                updated[newCol] = sysField.key;
                              }
                              setColumnMapping(updated);
                            }}
                            className="w-full max-w-xs px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">-- No asociar / Omitir --</option>
                            {analyzeResult.columns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {mappedColumn ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px] inline-flex items-center gap-1">
                              <Check className="w-3 h-3" /> Asociado a "{mappedColumn}"
                            </span>
                          ) : sysField.required ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-bold text-[10px] inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Requerido
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Opcional</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Vista Previa</span>
            </button>
            <button
              onClick={handleProceedToValidate}
              disabled={loadingValidate}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loadingValidate ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Validando filas en servidor...</span>
                </>
              ) : (
                <>
                  <span>Validar Registros (Paso 4)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 4: RESULTADO DE VALIDACIÓN                          */}
      {/* ======================================================== */}
      {currentStep === 4 && validationResult && (
        <div className="space-y-6 animate-in fade-in">
          {/* Tarjetas KPI de Validación */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                Total Filas
              </span>
              <span className="text-2xl font-black text-foreground">
                {validationResult.totalRows}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-card border border-emerald-500/30 shadow-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 block">
                Filas Válidas
              </span>
              <span className="text-2xl font-black text-emerald-400">
                {validationResult.validRows}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-card border border-amber-500/30 shadow-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 block">
                Duplicados en BD
              </span>
              <span className="text-2xl font-black text-amber-400">
                {validationResult.duplicateRows}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-card border border-rose-500/30 shadow-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-rose-400 block">
                Filas con Errores
              </span>
              <span className="text-2xl font-black text-rose-400">
                {validationResult.errorRows}
              </span>
            </div>
          </div>

          {/* Tabla de Resultados Detallados con Filtros */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Detalle Fila por Fila
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revisa los errores de formato o coincidencias con registros existentes antes de importar.
                </p>
              </div>

              {/* Botones de filtro */}
              <div className="flex items-center gap-1.5 text-xs">
                {(['ALL', 'ERROR', 'DUPLICATE', 'VALID'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setValidationFilter(filter)}
                    className={`px-3 py-1 rounded-lg font-semibold border transition-colors cursor-pointer ${
                      validationFilter === filter
                        ? 'bg-primary text-white border-primary'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {filter === 'ALL' && `Todos (${validationResult.totalRows})`}
                    {filter === 'ERROR' && `Errores (${validationResult.errorRows})`}
                    {filter === 'DUPLICATE' && `Duplicados (${validationResult.duplicateRows})`}
                    {filter === 'VALID' && `Válidos (${validationResult.validRows})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-border text-muted-foreground font-mono text-[11px]">
                    <th className="p-2.5 font-bold">Fila #</th>
                    <th className="p-2.5 font-bold">Nombre Completo</th>
                    <th className="p-2.5 font-bold">Correo Electrónico</th>
                    <th className="p-2.5 font-bold">Cédula</th>
                    <th className="p-2.5 font-bold">Estado</th>
                    <th className="p-2.5 font-bold">Detalle / Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validationResult.rowsSummary
                    .filter((r) => {
                      if (validationFilter === 'ERROR') return r.status === 'ERROR';
                      if (validationFilter === 'DUPLICATE') return r.status === 'DUPLICATE';
                      if (validationFilter === 'VALID') return r.status === 'VALID';
                      return true;
                    })
                    .map((item) => (
                      <tr key={item.rowNumber} className="hover:bg-muted/20">
                        <td className="p-2.5 font-mono text-muted-foreground">
                          {item.rowNumber}
                        </td>
                        <td className="p-2.5 font-bold text-foreground">
                          {item.normalized.firstName} {item.normalized.lastName}
                        </td>
                        <td className="p-2.5 text-foreground font-mono text-[11px]">
                          {item.normalized.email || '—'}
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground text-[11px]">
                          {item.normalized.documentId || '—'}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {item.status === 'VALID' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">
                              Válido
                            </span>
                          )}
                          {item.status === 'DUPLICATE' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold text-[10px]">
                              Duplicado
                            </span>
                          )}
                          {item.status === 'ERROR' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-bold text-[10px]">
                              Error
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-[11px]">
                          {item.errors.length > 0 ? (
                            <span className="text-rose-400 font-semibold">{item.errors.join('; ')}</span>
                          ) : item.isDuplicateInDb ? (
                            <span className="text-amber-400">
                              Ya registrado en {currentEvent?.name} {item.existingTicket ? `(Ticket ${item.existingTicket})` : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Listo para insertar</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ajustar Mapeo de Columnas</span>
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <span>Configurar Estrategia de Conflictos (Paso 5)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 5: ESTRATEGIA DE RESOLUCIÓN Y CONFIRMACIÓN           */}
      {/* ======================================================== */}
      {currentStep === 5 && validationResult && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Resolución de Conflictos y Duplicados
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Se detectaron <strong>{validationResult.duplicateRows} registros</strong> que ya existen en <strong>{currentEvent?.name}</strong> (por correo, cédula o ticket). Selecciona cómo debe proceder la importación:
              </p>
            </div>

            <div className="space-y-3">
              {/* Opción 1: SKIP */}
              <label
                className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  conflictStrategy === 'SKIP'
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-background border-border hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="conflictStrategy"
                  value="SKIP"
                  checked={conflictStrategy === 'SKIP'}
                  onChange={() => setConflictStrategy('SKIP')}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground">
                      Omitir Duplicados (Conservar Existentes)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 font-bold">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Solo se importarán los participantes nuevos. Los que ya existan en la base de datos se ignorarán sin modificar sus datos ni sus pagos.
                  </p>
                </div>
              </label>

              {/* Opción 2: UPDATE */}
              <label
                className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  conflictStrategy === 'UPDATE'
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-background border-border hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="conflictStrategy"
                  value="UPDATE"
                  checked={conflictStrategy === 'UPDATE'}
                  onChange={() => setConflictStrategy('UPDATE')}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <span className="font-bold text-xs text-foreground">
                    Actualizar Registros Existentes
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sobrescribir los datos de contacto (teléfono, notas, etc.) de los participantes coincidentes con la información provista en este archivo.
                  </p>
                </div>
              </label>

              {/* Opción 3: ONLY_NEW */}
              <label
                className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  conflictStrategy === 'ONLY_NEW'
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-background border-border hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="conflictStrategy"
                  value="ONLY_NEW"
                  checked={conflictStrategy === 'ONLY_NEW'}
                  onChange={() => setConflictStrategy('ONLY_NEW')}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <span className="font-bold text-xs text-foreground">
                    Modo Estricto (Solo Nuevos)
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    No actualiza ningún registro previo. Descarta silenciosamente cualquier fila duplicada.
                  </p>
                </div>
              </label>
            </div>

            {/* Resumen de Confirmación */}
            <div className="p-4 rounded-xl bg-background border border-border space-y-2 text-xs">
              <span className="font-bold text-foreground block uppercase font-mono text-[11px]">
                Resumen de la Transacción por Lotes:
              </span>
              <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                <li>Edición destino: <strong className="text-foreground">{currentEvent?.name}</strong></li>
                <li>Filas a insertar: <strong className="text-emerald-400">{validationResult.validRows} participantes</strong></li>
                <li>Filas duplicadas a procesar con estrategia <strong className="text-foreground">{conflictStrategy}</strong>: {validationResult.duplicateRows}</li>
                <li>Filas con errores que serán registradas en la bitácora: <strong className="text-rose-400">{validationResult.errorRows}</strong></li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Validación</span>
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={loadingExecute}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {loadingExecute ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Procesando lote transaccional...</span>
                </>
              ) : (
                <>
                  <span>Ejecutar Importación Transaccional</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASO 6: RESULTADO FINAL Y DESCARGA DE REPORTES            */}
      {/* ======================================================== */}
      {currentStep === 6 && executionResult && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-black text-foreground">
              ¡Lote de Importación Procesado Exitosamente!
            </h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Los registros han sido procesados y persistidos en la base de datos para <strong>{currentEvent?.name}</strong>.
            </p>

            {/* Estadísticas de la Ejecución */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto pt-4 text-left">
              <div className="p-3.5 rounded-xl bg-background border border-border">
                <span className="text-[10px] uppercase font-mono text-muted-foreground block">Importados</span>
                <span className="text-2xl font-black text-emerald-400">{executionResult.importedCount}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-background border border-border">
                <span className="text-[10px] uppercase font-mono text-muted-foreground block">Actualizados</span>
                <span className="text-2xl font-black text-indigo-400">{executionResult.updatedCount}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-background border border-border">
                <span className="text-[10px] uppercase font-mono text-muted-foreground block">Omitidos</span>
                <span className="text-2xl font-black text-amber-400">{executionResult.skippedCount}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-background border border-border">
                <span className="text-[10px] uppercase font-mono text-muted-foreground block">Con Errores</span>
                <span className="text-2xl font-black text-rose-400">{executionResult.errorCount}</span>
              </div>
            </div>

            {/* Descarga de reporte de errores si existieron */}
            {executionResult.errorCount > 0 && (
              <div className="pt-4 max-w-md mx-auto">
                <button
                  onClick={() =>
                    importService.downloadErrorReport(executionResult.batchId, executionResult.fileName)
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-rose-400" />
                  <span>Descargar Reporte de Errores ({executionResult.errorCount} filas en .xlsx)</span>
                </button>
              </div>
            )}

            {/* Botones de Navegación Final */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-6 border-t border-border">
              <button
                onClick={() => navigate('/participants')}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <span>Ir al Directorio de Participantes</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-semibold text-foreground transition-colors cursor-pointer"
              >
                Importar Otro Archivo
              </button>
              {hasRole(['ADMIN']) && executionResult?.batchId && (
                <button
                  type="button"
                  onClick={() => {
                    const found = batches.find((b) => b.id === executionResult.batchId) || {
                      id: executionResult.batchId,
                      fileName: executionResult.fileName,
                      importedRows: executionResult.importedCount,
                      totalRows: executionResult.totalRows,
                      fileSize: 0,
                      validRows: executionResult.importedCount,
                      updatedRows: executionResult.updatedCount,
                      skippedRows: executionResult.skippedCount,
                      errorRows: executionResult.errorCount,
                      createdAt: new Date().toISOString(),
                      importedByUser: { id: user?.id || '', fullName: user?.fullName || 'Admin', email: user?.email || '' },
                      _count: { errors: executionResult.errorCount },
                    };
                    setBatchToDelete(found);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Deshacer / Borrar este Excel</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notificación de éxito */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* HISTORIAL DE LOTES DE IMPORTACIÓN                        */}
      {/* ======================================================== */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Historial de Lotes de Importación en {currentEvent?.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {hasRole(['ADMIN']) && batches.length > 0 && (
              <button
                onClick={() => setIsDeleteAllOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Eliminar todas las importaciones de Excel de esta edición"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Borrar todas las importaciones</span>
              </button>
            )}
            <button
              onClick={fetchBatches}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Refrescar historial"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal de confirmación de borrado de lote individual */}
        {batchToDelete && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                  ¿Confirmar eliminación de este archivo Excel?
                </h4>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  Se eliminará permanentemente el lote{' '}
                  <strong className="font-mono text-white">"{batchToDelete.fileName}"</strong> y todas las inscripciones asociadas generadas a partir de él. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBatch(batchToDelete)}
                disabled={Boolean(deletingBatchId)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingBatchId ? 'Borrando...' : 'Sí, borrar Excel y sus registros'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal de confirmación de borrado global */}
        {isDeleteAllOpen && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                  ¿Confirmar eliminación de TODAS las importaciones de Excel?
                </h4>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  Esta acción eliminará todos los lotes de Excel ({batches.length}) y todas las inscripciones importadas para{' '}
                  <strong className="text-white">{currentEvent?.name}</strong>. Las inscripciones registradas manualmente no se verán afectadas.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteAllOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAllBatches}
                disabled={deletingAll}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingAll ? 'Borrando todo...' : 'Sí, eliminar todas las importaciones'}</span>
              </button>
            </div>
          </div>
        )}

        {loadingBatches ? (
          <div className="p-8 text-center text-muted-foreground text-xs">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Cargando bitácora de importaciones...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-background border border-border text-muted-foreground text-xs">
            <p className="font-semibold text-foreground">No hay lotes importados previamente</p>
            <p className="text-[11px] mt-0.5">Los archivos procesados para esta edición aparecerán registrados aquí.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground font-mono text-[11px]">
                  <th className="p-3 font-bold">Archivo</th>
                  <th className="p-3 font-bold">Fecha / Hora</th>
                  <th className="p-3 font-bold">Responsable</th>
                  <th className="p-3 font-bold text-right">Total</th>
                  <th className="p-3 font-bold text-right">Importados</th>
                  <th className="p-3 font-bold text-right">Actualizados</th>
                  <th className="p-3 font-bold text-right">Errores</th>
                  <th className="p-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20">
                    <td className="p-3 font-bold text-foreground font-mono">
                      {b.fileName}
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {new Date(b.createdAt).toLocaleString('es-DO', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-foreground whitespace-nowrap">
                      {b.importedByUser.fullName}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {b.totalRows}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      {b.importedRows}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-400">
                      {b.updatedRows}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-rose-400">
                      {b.errorRows}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {b.errorRows > 0 ? (
                          <button
                            onClick={() => importService.downloadErrorReport(b.id, b.fileName)}
                            className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-[10px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Descargar archivo Excel con las filas erróneas"
                          >
                            <Download className="w-3 h-3 text-rose-400" />
                            <span>Errores ({b.errorRows})</span>
                          </button>
                        ) : null}
                        {hasRole(['ADMIN']) && (
                          <button
                            onClick={() => setBatchToDelete(b)}
                            disabled={deletingBatchId === b.id}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            title="Borrar este archivo Excel y sus inscripciones"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Borrar Excel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
