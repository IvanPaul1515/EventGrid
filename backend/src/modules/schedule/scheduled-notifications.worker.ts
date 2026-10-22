import { prisma } from '../../config/db.js';
import { CommunicationsService } from '../communications/communications.service.js';

export class ScheduledNotificationsWorker {
  private static timer: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  static start() {
    console.log('[ScheduledNotificationsWorker] Iniciando worker de notificaciones programadas...');
    this.processMaturedNotifications().catch((err) => {
      console.error('[ScheduledNotificationsWorker] Error en ejecución inicial:', err);
    });

    if (!this.timer) {
      this.timer = setInterval(() => {
        this.processMaturedNotifications().catch((err) => {
          console.error('[ScheduledNotificationsWorker] Error procesando notificaciones:', err);
        });
      }, 20000);
    }
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async processPending() {
    return this.processMaturedNotifications();
  }

  static async processMaturedNotifications() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const matured = await prisma.scheduledNotification.findMany({
        where: {
          status: { in: ['SCHEDULED', 'PENDING'] },
          scheduledFor: { lte: now },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 10,
      });

      for (const notif of matured) {
        try {
          await prisma.scheduledNotification.update({
            where: { id: notif.id },
            data: { status: 'PROCESSING' },
          });

          // Si está vinculado a un ítem de cronograma y este ítem estaba programado para publicarse
          if (notif.scheduleItemId) {
            const item = await prisma.scheduleItem.findUnique({
              where: { id: notif.scheduleItemId },
            });
            if (item && item.visibility === 'SCHEDULED') {
              await prisma.scheduleItem.update({
                where: { id: notif.scheduleItemId },
                data: { visibility: 'PUBLISHED' },
              });
            }
          }

          // Ejecutar envío masivo mediante CommunicationsService
          const batchResult = await CommunicationsService.sendBulkEmail(
            {
              eventId: notif.eventId,
              targetGroup: notif.targetGroup as any,
              templateCode: notif.templateCode,
              customSubject: notif.title,
              customMessage: notif.message,
              mode: notif.mode as any,
              simulateOnly: notif.mode === 'SIMULATION',
            },
            notif.createdByUserId || undefined
          );

          await prisma.scheduledNotification.update({
            where: { id: notif.id },
            data: {
              status: 'COMPLETED',
              batchJobId: batchResult.batchId,
              executedAt: new Date(),
            },
          });
        } catch (err: any) {
          console.error(`[ScheduledNotificationsWorker] Error ejecutando notificación ${notif.id}:`, err);
          await prisma.scheduledNotification.update({
            where: { id: notif.id },
            data: {
              status: 'FAILED',
              error: err.message || 'Error desconocido al ejecutar notificación programada',
            },
          }).catch(() => {});
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
