import { Request, Response, NextFunction } from 'express';
import { ImportService } from './import.service.js';
import { AnalyzeFileSchema, ValidateImportSchema, ExecuteImportSchema } from './import.dto.js';
import { recordAuditLog } from '../../middleware/audit.js';

export class ImportController {
  static async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = AnalyzeFileSchema.parse(req.body);
      const result = ImportService.analyzeFile(
        validated.fileBase64,
        validated.fileName,
        validated.sheetName,
        validated.headerRowIndex
      );

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const validated = ValidateImportSchema.parse(req.body);

      const result = await ImportService.validateRows(
        eventId,
        validated.rows,
        validated.columnMapping
      );

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async execute(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const userId = req.user!.id;
      const validated = ExecuteImportSchema.parse(req.body);

      const result = await ImportService.executeImport(
        eventId,
        userId,
        validated.fileName,
        validated.fileSize,
        validated.rows,
        validated.columnMapping,
        validated.conflictStrategy
      );

      await recordAuditLog({
        req,
        action: 'IMPORT',
        entity: 'IMPORT_BATCH',
        entityId: result.batchId,
        changes: {
          fileName: validated.fileName,
          importedCount: result.importedCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
        },
      });

      return res.status(201).json({
        status: 'success',
        message: `Importación finalizada: ${result.importedCount} creados, ${result.updatedCount} actualizados, ${result.skippedCount} omitidos`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = req.params.eventId || req.eventId!;
      const batches = await ImportService.getBatches(eventId);

      return res.status(200).json({
        status: 'success',
        data: batches,
      });
    } catch (error) {
      next(error);
    }
  }

  static async downloadErrorReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const file = await ImportService.getBatchErrorReport(batchId);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      return res.send(file.buffer);
    } catch (error) {
      next(error);
    }
  }
}
