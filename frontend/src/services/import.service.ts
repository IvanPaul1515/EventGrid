import { api } from './api';

export interface AnalyzeResult {
  fileName: string;
  sheets: string[];
  selectedSheet: string;
  headerRowIndex: number;
  columns: string[];
  autoMapping: Record<string, string>;
  totalRows: number;
  previewRows: any[];
  rows: any[];
}

export interface ValidationSummaryItem {
  rowNumber: number;
  raw: Record<string, any>;
  normalized: Record<string, any>;
  status: 'VALID' | 'DUPLICATE' | 'ERROR';
  errors: string[];
  isDuplicateInDb: boolean;
  existingTicket?: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  rowsSummary: ValidationSummaryItem[];
}

export interface ExecutionResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: any[];
}

export interface ImportBatchItem {
  id: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  validRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  createdAt: string;
  importedByUser: {
    id: string;
    fullName: string;
    email: string;
  };
  _count: {
    errors: number;
    registrations?: number;
  };
}

export const importService = {
  async analyze(fileBase64: string, fileName: string, sheetName?: string, headerRowIndex?: number): Promise<AnalyzeResult> {
    const res = await api.post('/import/analyze', {
      fileBase64,
      fileName,
      sheetName,
      headerRowIndex,
    });
    return res.data.data;
  },

  async validate(fileName: string, sheetName: string, rows: any[], columnMapping: Record<string, string>): Promise<ValidationResult> {
    const res = await api.post('/import/validate', {
      fileName,
      sheetName,
      rows,
      columnMapping,
    });
    return res.data.data;
  },

  async execute(
    fileName: string,
    fileSize: number,
    sheetName: string,
    rows: any[],
    columnMapping: Record<string, string>,
    conflictStrategy: 'SKIP' | 'UPDATE' | 'ONLY_NEW' = 'SKIP'
  ): Promise<ExecutionResult> {
    const res = await api.post('/import/execute', {
      fileName,
      fileSize,
      sheetName,
      rows,
      columnMapping,
      conflictStrategy,
    });
    return res.data.data;
  },

  async getBatches(): Promise<ImportBatchItem[]> {
    const res = await api.get('/import/batches');
    return res.data.data;
  },

  async deleteBatch(batchId: string): Promise<{
    batchId: string;
    fileName: string;
    deletedRegistrationsCount: number;
    deletedParticipantsCount: number;
  }> {
    const res = await api.delete(`/import/batches/${batchId}`);
    return res.data.data;
  },

  async deleteAllImported(): Promise<{
    deletedBatchesCount: number;
    deletedRegistrationsCount: number;
    deletedParticipantsCount: number;
  }> {
    const res = await api.delete('/import/all');
    return res.data.data;
  },

  async downloadErrorReport(batchId: string, fileName: string): Promise<void> {
    const response = await api.get(`/import/batches/${batchId}/errors`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Errores_${fileName.replace(/\.[^/.]+$/, '')}_${batchId.slice(0, 8)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
