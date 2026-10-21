import { prisma } from '../../config/db.js';
import { decryptSecret } from '../../utils/crypto.js';
import nodemailer from 'nodemailer';

export interface EnqueueCustomParams {
  customSubject?: string;
  customBodyHtml?: string;
  customMessage?: string;
}

export class EmailQueueWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static activeJobs = new Set<string>();

  /**
   * Inicia el trabajador en segundo plano e intenta recuperar trabajos abandonados
   */
  static start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Recuperar trabajos huérfanos al arrancar el servidor
    this.recoverStaleJobs().catch((err) => {
      console.error('[EmailQueueWorker] Error al recuperar trabajos pendientes al iniciar:', err);
    });

    // Bucle periódico cada 4 segundos
    this.timer = setInterval(() => {
      this.processPendingBatches().catch((err) => {
        console.error('[EmailQueueWorker] Error en ciclo periódico de la cola:', err);
      });
    }, 4000);

    console.log('📬 [EmailQueueWorker] Trabajador de cola de correos masivos iniciado.');
  }

  /**
   * Detiene el trabajador de manera limpia
   */
  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('🛑 [EmailQueueWorker] Trabajador de cola de correos detenido.');
  }

  /**
   * Dispara el procesamiento inmediato de lotes pendientes sin esperar al siguiente tick
   */
  static trigger() {
    setTimeout(() => {
      this.processPendingBatches().catch(() => {});
    }, 10);
  }

  /**
   * Recupera trabajos abandonados o interrumpidos por reinicio del servidor (Lease Expirado)
   */
  static async recoverStaleJobs() {
    const now = new Date();

    // 1. Revertir ítems que quedaron en 'PROCESSING' con lease expirado a 'PENDING'
    const staleItems = await prisma.emailBatchItem.findMany({
      where: {
        status: 'PROCESSING',
        leaseUntil: { lt: now },
      },
      take: 200,
    });

    for (const item of staleItems) {
      if (item.attempts >= 3) {
        await prisma.emailBatchItem.update({
          where: { id: item.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Procesamiento abandonado: superó límite de reintentos tras interrupción',
          },
        }).catch(() => {});
      } else {
        await prisma.emailBatchItem.update({
          where: { id: item.id },
          data: {
            status: 'PENDING',
            leaseUntil: null,
          },
        }).catch(() => {});
      }
    }

    // 2. Localizar lotes en 'PROCESSING' o 'PENDING' para reanudarlos
    const pendingBatches = await prisma.emailBatchJob.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      select: { id: true },
      take: 10,
    });

    for (const batch of pendingBatches) {
      this.processBatch(batch.id).catch(() => {});
    }

    return staleItems.length;
  }

  /**
   * Escanea y procesa lotes que tengan estado PENDING o PROCESSING
   */
  static async processPendingBatches() {
    const batches = await prisma.emailBatchJob.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const batch of batches) {
      if (!this.activeJobs.has(batch.id)) {
        this.processBatch(batch.id).catch(() => {});
      }
    }
  }

  /**
   * Procesa un lote individual en fragmentos atómicos
   */
  static async processBatch(jobId: string, customParams?: EnqueueCustomParams) {
    if (this.activeJobs.has(jobId)) return;
    this.activeJobs.add(jobId);

    try {
      const job = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
        include: { event: { include: { settings: true } } },
      });

      if (!job) return;
      if (job.status === 'CANCELLED' || job.status === 'COMPLETED') return;

      // Marcar como PROCESSING si aún estaba en PENDING
      if (job.status === 'PENDING') {
        await prisma.emailBatchJob.update({
          where: { id: jobId },
          data: { status: 'PROCESSING', startedAt: job.startedAt || new Date() },
        }).catch(() => {});
      }

      // Obtener plantilla
      const { CommunicationsService } = await import('./communications.service.js');
      let template: any = null;
      if (job.templateCode) {
        template = await prisma.emailTemplate.findFirst({
          where: {
            code: job.templateCode,
            OR: [{ eventId: job.eventId }, { eventId: null }],
          },
        });
        if (!template) {
          template = CommunicationsService.DEFAULT_TEMPLATES.find((t) => t.code === job.templateCode);
        }
      }

      // Configuración SMTP
      const config = await prisma.emailConfig.findFirst({
        where: { OR: [{ eventId: job.eventId }, { eventId: null }] },
      });

      let parsedFilter: any = {};
      try {
        if (job.filterCriteria) {
          parsedFilter = typeof job.filterCriteria === 'string' ? JSON.parse(job.filterCriteria) : job.filterCriteria;
        }
      } catch {}

      const isConfigActive = Boolean(config && config.isEnabled);
      const isSimulation =
        Boolean(parsedFilter.simulateOnly) ||
        !isConfigActive ||
        Boolean(job.event?.settings?.demoModeEnabled) ||
        process.env.NODE_ENV === 'test' ||
        process.env.VITEST === 'true' ||
        Boolean(config?.host?.includes('mailtrap')) ||
        Boolean(config?.host?.includes('example'));

      const rawPassword = config ? decryptSecret(config.password) : '';
      let transporter: any = null;

      if (!isSimulation && config && rawPassword) {
        transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.user || '', pass: rawPassword },
        });
      }

      const CHUNK_SIZE = 25;
      const LEASE_DURATION_MS = 120000; // 2 minutos de lease

      let hasMore = true;
      while (hasMore) {
        // Verificar cancelación del lote antes de procesar el siguiente fragmento
        const currentJobState = await prisma.emailBatchJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });

        if (currentJobState?.status === 'CANCELLED') {
          // Cancelar todos los ítems aún pendientes
          await prisma.emailBatchItem.updateMany({
            where: { jobId, status: { in: ['PENDING', 'PROCESSING'] } },
            data: { status: 'CANCELLED' },
          });
          break;
        }

        // 1. Obtener candidatos en PENDING
        const pendingItems = await prisma.emailBatchItem.findMany({
          where: { jobId, status: 'PENDING' },
          take: CHUNK_SIZE,
          orderBy: { createdAt: 'asc' },
        });

        if (pendingItems.length === 0) {
          hasMore = false;
          break;
        }

        // 2. Reclamar atómicamente cada ítem (OCC Lease claim)
        const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS);
        const claimedItems: typeof pendingItems = [];

        for (const item of pendingItems) {
          const claim = await prisma.emailBatchItem.updateMany({
            where: { id: item.id, status: 'PENDING' },
            data: {
              status: 'PROCESSING',
              leaseUntil,
              lastAttemptAt: new Date(),
              attempts: { increment: 1 },
            },
          });
          if (claim.count === 1) {
            claimedItems.push(item);
          }
        }

        // 3. Procesar los ítems reclamados
        await Promise.all(
          claimedItems.map(async (item) => {
            const email = item.recipientEmail.trim();

            if (!email || !email.includes('@')) {
              await prisma.emailBatchItem.update({
                where: { id: item.id },
                data: { status: 'FAILED', errorMessage: 'Dirección de correo inválida' },
              }).catch(() => {});
              return;
            }

            try {
              // Buscar registro e información del participante
              let reg: any = null;
              if (item.registrationId) {
                reg = await prisma.registration.findUnique({
                  where: { id: item.registrationId },
                  include: {
                    participant: true,
                    ticketType: true,
                    event: { include: { settings: true } },
                  },
                });
              }

              const rendered = template && reg
                ? await CommunicationsService.renderTemplateContent(template, reg, {
                    customSubject: customParams?.customSubject,
                    customBodyHtml: customParams?.customBodyHtml,
                    customMessage: customParams?.customMessage,
                  })
                : {
                    subject: job.subject,
                    html: `<p>Hola ${item.recipientName || ''},</p><p>${customParams?.customMessage || 'Notificación de evento.'}</p>`,
                    text: `Hola ${item.recipientName || ''}, ${customParams?.customMessage || 'Notificación de evento.'}`,
                  };

              if (isSimulation || !transporter) {
                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'SIMULATED',
                    sentAt: new Date(),
                  },
                });

                await prisma.emailLog.create({
                  data: {
                    eventId: job.eventId,
                    registrationId: item.registrationId || null,
                    recipientEmail: email,
                    recipientName: item.recipientName || email,
                    templateCode: job.templateCode || 'CUSTOM',
                    subject: rendered.subject,
                    status: 'SIMULATED',
                    batchId: job.id,
                    sentByUserId: job.createdById || null,
                  },
                }).catch(() => {});
              } else {
                await transporter.sendMail({
                  from: `"${config?.fromName || 'EventGrid'}" <${config?.fromEmail || 'noreply@eventgrid.app'}>`,
                  to: email,
                  replyTo: config?.replyToEmail || undefined,
                  subject: rendered.subject,
                  text: rendered.text,
                  html: rendered.html,
                });

                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'ACCEPTED_BY_SMTP',
                    sentAt: new Date(),
                  },
                });

                await prisma.emailLog.create({
                  data: {
                    eventId: job.eventId,
                    registrationId: item.registrationId || null,
                    recipientEmail: email,
                    recipientName: item.recipientName || email,
                    templateCode: job.templateCode || 'CUSTOM',
                    subject: rendered.subject,
                    status: 'SENT',
                    batchId: job.id,
                    sentByUserId: job.createdById || null,
                  },
                }).catch(() => {});
              }
            } catch (err: any) {
              const currentAttempts = item.attempts + 1;
              const isTransient = Boolean(err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT');

              if (isTransient && currentAttempts < 3) {
                // Reintento de error transitorio: volver a PENDING
                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'PENDING',
                    errorMessage: `Reintento programado: ${err.message || 'Fallo transitorio'}`,
                    leaseUntil: null,
                  },
                }).catch(() => {});
              } else {
                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'FAILED',
                    errorMessage: err.message || 'Error al enviar por SMTP',
                  },
                }).catch(() => {});

                await prisma.emailLog.create({
                  data: {
                    eventId: job.eventId,
                    registrationId: item.registrationId || null,
                    recipientEmail: email,
                    recipientName: item.recipientName || email,
                    templateCode: job.templateCode || 'CUSTOM',
                    subject: job.subject,
                    status: 'FAILED',
                    errorMessage: err.message || 'Fallo de entrega',
                    batchId: job.id,
                    sentByUserId: job.createdById || null,
                  },
                }).catch(() => {});
              }
            }
          })
        );

        // Control de velocidad / throttling entre fragmentos
        if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
          await new Promise((r) => setTimeout(r, 40));
        }
      }

      // 4. Actualizar contadores y estado final del lote
      await this.finalizeBatchStatus(jobId);
    } catch (err: any) {
      console.error(`[EmailQueueWorker] Error procesando lote ${jobId}:`, err);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Calcula los totales reales y fija el estado final del lote
   */
  static async finalizeBatchStatus(jobId: string) {
    const counts = await prisma.emailBatchItem.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { status: true },
    });

    let sent = 0;
    let simulated = 0;
    let failed = 0;
    let cancelled = 0;
    let pending = 0;
    let processing = 0;

    for (const c of counts) {
      const count = c._count.status;
      if (c.status === 'ACCEPTED_BY_SMTP') sent += count;
      else if (c.status === 'SIMULATED') simulated += count;
      else if (c.status === 'FAILED') failed += count;
      else if (c.status === 'CANCELLED') cancelled += count;
      else if (c.status === 'PENDING') pending += count;
      else if (c.status === 'PROCESSING') processing += count;
    }

    const processed = sent + simulated + failed + cancelled;
    const isStillWorking = pending > 0 || processing > 0;

    const currentJob = await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      select: { status: true, totalCount: true },
    });

    let finalStatus = currentJob?.status || 'COMPLETED';

    if (!isStillWorking) {
      if (currentJob?.status === 'CANCELLED') {
        finalStatus = 'CANCELLED';
      } else if (failed === currentJob?.totalCount && currentJob.totalCount > 0) {
        finalStatus = 'FAILED';
      } else if (failed > 0 && (sent > 0 || simulated > 0)) {
        finalStatus = 'PARTIALLY_COMPLETED';
      } else if (simulated > 0 && sent === 0 && failed === 0) {
        finalStatus = 'SIMULATED';
      } else {
        finalStatus = 'COMPLETED';
      }
    }

    await prisma.emailBatchJob.update({
      where: { id: jobId },
      data: {
        processedCount: processed,
        sentCount: sent,
        simulatedCount: simulated,
        failedCount: failed,
        cancelledCount: cancelled,
        status: isStillWorking ? 'PROCESSING' : finalStatus,
        completedAt: isStillWorking ? null : new Date(),
      },
    }).catch(() => {});
  }

  /**
   * Cancelar un lote en ejecución o pendiente
   */
  static async cancelBatch(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Lote no encontrado');

    if (eventId && job.eventId !== eventId) {
      throw new Error('No tiene autorización para cancelar un lote perteneciente a otra edición.');
    }

    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      return job;
    }

    await prisma.emailBatchJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await prisma.emailBatchItem.updateMany({
      where: { jobId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'CANCELLED' },
    });

    await this.finalizeBatchStatus(jobId);
    return await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
  }

  /**
   * Reintentar ítems fallidos de un lote
   */
  static async retryFailed(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Lote no encontrado');

    if (eventId && job.eventId !== eventId) {
      throw new Error('No tiene autorización para gestionar lotes de otra edición.');
    }

    const resetCount = await prisma.emailBatchItem.updateMany({
      where: { jobId, status: 'FAILED' },
      data: {
        status: 'PENDING',
        attempts: 0,
        errorMessage: null,
        leaseUntil: null,
      },
    });

    if (resetCount.count > 0) {
      await prisma.emailBatchJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          completedAt: null,
        },
      });

      this.trigger();
    }

    return await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      include: { items: { take: 100 } },
    });
  }
}
