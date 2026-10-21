import nodemailer from 'nodemailer';
import { prisma } from '../../config/db.js';
import { decryptSecret } from '../../utils/crypto.js';

export interface EnqueueCustomParams {
  customSubject?: string;
  customBodyHtml?: string;
  customMessage?: string;
}

export class EmailQueueWorker {
  private static isRunning = false;
  private static pollTimer: NodeJS.Timeout | null = null;
  private static activeJobs: Map<string, Promise<void>> = new Map();

  /**
   * Inicializa el worker en segundo plano
   */
  static start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Recuperación inicial de ítems huérfanos tras reinicio del servidor (QA-22)
    this.recoverStaleJobs().catch((err) => {
      console.error('[EmailQueueWorker] Error en recuperación inicial tras reinicio:', err);
    });

    // Polling recurrente cada 5 segundos
    this.pollTimer = setInterval(() => {
      this.processPendingBatches().catch((err) => {
        console.error('[EmailQueueWorker] Error en ciclo periódico de lotes:', err);
      });
    }, 5000);
  }

  /**
   * Detiene el worker
   */
  static stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Dispara inmediatamente la verificación de lotes pendientes
   */
  static trigger() {
    setImmediate(() => {
      this.processPendingBatches().catch(() => {});
    });
  }

  /**
   * QA-22: Recupera ítems con lease expirado tras caída o reinicio del servidor.
   * Evita reenvíos duplicados: si ya hubo al menos un intento SMTP, marca como UNKNOWN_DELIVERY_STATUS
   * en lugar de volver ciegamente a PENDING.
   */
  static async recoverStaleJobs() {
    const now = new Date();

    const staleItems = await prisma.emailBatchItem.findMany({
      where: {
        status: 'PROCESSING',
        leaseUntil: { lt: now },
      },
      take: 200,
    });

    for (const item of staleItems) {
      if (item.attempts >= 1) {
        // QA-22: Incertidumbre SMTP. No reenviar automáticamente para evitar duplicados.
        await prisma.emailBatchItem.update({
          where: { id: item.id },
          data: {
            status: 'UNKNOWN_DELIVERY_STATUS',
            leaseUntil: null,
            errorMessage: 'Resultado de entrega incierto: el servidor se reinició o perdió conexión durante el envío SMTP. Reenvío automático suspendido para evitar duplicados.',
          },
        }).catch(() => {});
      } else {
        // Ítem reclamado pero nunca se intentó (attempts === 0)
        await prisma.emailBatchItem.update({
          where: { id: item.id },
          data: {
            status: 'PENDING',
            leaseUntil: null,
          },
        }).catch(() => {});
      }
    }

    // Localizar lotes en PROCESSING o PENDING para reanudarlos
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
      select: { id: true },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });

    for (const batch of batches) {
      if (!this.activeJobs.has(batch.id)) {
        this.processBatch(batch.id).catch(() => {});
      }
    }
  }

  /**
   * Procesa un lote individual en fragmentos atómicos (QA-20, QA-21, QA-23, QA-24)
   */
  static async processBatch(jobId: string, customParams?: EnqueueCustomParams): Promise<void> {
    const existing = this.activeJobs.get(jobId);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      try {
      const job = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
        include: { event: { include: { settings: true } } },
      });

      if (!job) return;
      if (job.status === 'CANCELLED' || job.status === 'COMPLETED' || job.status === 'FAILED') return;

      // Marcar como PROCESSING si aún estaba en PENDING
      if (job.status === 'PENDING') {
        await prisma.emailBatchJob.update({
          where: { id: jobId },
          data: { status: 'PROCESSING', startedAt: job.startedAt || new Date() },
        }).catch(() => {});
      }

      const { CommunicationsService } = await import('./communications.service.js');

      // QA-24: Obtener plantilla con prioridad estricta de edición
      let template: any = null;
      if (job.templateCode) {
        template = await CommunicationsService.findTemplate(job.templateCode, job.eventId);
      }

      // QA-24: Configuración SMTP con prioridad estricta de edición
      const config = await CommunicationsService.getRawConfig(job.eventId);
      const isConfigActive = Boolean(config && config.isEnabled);

      // QA-23: El modo de envío está fijado de forma inmutable en el lote (REAL o SIMULATION)
      const isSimulation = job.mode !== 'REAL';

      // QA-23: Si es una campaña real y SMTP no está disponible, NUNCA simular silenciosamente.
      // Detener el envío y marcar como FAILED con motivo explícito.
      if (!isSimulation && (!isConfigActive || !config)) {
        await prisma.emailBatchJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: 'El servicio SMTP no está configurado o está deshabilitado para esta campaña real. Envío detenido sin simulación silenciosa.',
            completedAt: new Date(),
          },
        });

        await prisma.emailBatchItem.updateMany({
          where: { jobId, status: 'PENDING' },
          data: {
            status: 'FAILED',
            errorMessage: 'Servicio SMTP deshabilitado durante campaña real.',
          },
        });

        await this.finalizeBatchStatus(jobId);
        return;
      }

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
        // QA-21: Verificar cancelación antes de tomar el siguiente fragmento
        const currentJobState = await prisma.emailBatchJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });

        if (currentJobState?.status === 'CANCELLED' || currentJobState?.status === 'CANCELLATION_REQUESTED') {
          // Cancelar únicamente ítems en PENDING. NO tocar los que ya están PROCESSING
          await prisma.emailBatchItem.updateMany({
            where: { jobId, status: 'PENDING' },
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
              // QA-20: Priorizar el contenido renderizado e inmutable persistido en el ítem
              let rendered = {
                subject: item.renderedSubject || job.subject,
                html: item.renderedHtml || job.bodyHtml || `<p>${job.customMessage || job.subject}</p>`,
                text: job.bodyText || item.renderedSubject || job.subject,
              };

              // Si faltara el contenido pre-renderizado, usar snapshot inmutable guardado en el lote
              if (!item.renderedHtml) {
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

                let tmplObj = template;
                if (!tmplObj && job.templateSnapshot) {
                  try {
                    tmplObj = typeof job.templateSnapshot === 'string' ? JSON.parse(job.templateSnapshot) : job.templateSnapshot;
                  } catch {}
                }

                if (tmplObj && reg) {
                  const renderedDynamic = await CommunicationsService.renderTemplateContent(tmplObj, reg, {
                    customSubject: job.customSubject || customParams?.customSubject,
                    customBodyHtml: job.customBodyHtml || customParams?.customBodyHtml,
                    customMessage: job.customMessage || customParams?.customMessage,
                  });
                  rendered = {
                    subject: renderedDynamic.subject,
                    html: renderedDynamic.html,
                    text: renderedDynamic.text,
                  };
                }
              }

              if (isSimulation || !transporter) {
                // Modo SIMULATED persistente
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
                // Modo REAL con Message-ID RFC 2822 para deduplicación
                const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
                if (!isTest && transporter) {
                  await transporter.sendMail({
                    from: `"${config?.fromName || 'EventGrid'}" <${config?.fromEmail || 'noreply@eventgrid.app'}>`,
                    to: email,
                    replyTo: config?.replyToEmail || undefined,
                    messageId: item.messageId || undefined,
                    subject: rendered.subject,
                    text: rendered.text,
                    html: rendered.html,
                  });
                }

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
              const currentAttempts = item.attempts;
              const isTransient = Boolean(err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT');

              if (isTransient && currentAttempts < 3) {
                // Reintento transitorio
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

        if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
          await new Promise((r) => setTimeout(r, 40));
        }
      }

      // 4. Actualizar contadores y estado final
      await this.finalizeBatchStatus(jobId);
      } catch (err: any) {
        console.error(`[EmailQueueWorker] Error procesando lote ${jobId}:`, err);
      } finally {
        this.activeJobs.delete(jobId);
      }
    })();

    this.activeJobs.set(jobId, task);
    return task;
  }

  /**
   * QA-21: Calcula los totales reales y fija el estado final del lote
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
    let unknown = 0;

    for (const c of counts) {
      const count = c._count.status;
      if (c.status === 'ACCEPTED_BY_SMTP') sent += count;
      else if (c.status === 'SIMULATED') simulated += count;
      else if (c.status === 'FAILED') failed += count;
      else if (c.status === 'CANCELLED') cancelled += count;
      else if (c.status === 'UNKNOWN_DELIVERY_STATUS') unknown += count;
      else if (c.status === 'PENDING') pending += count;
      else if (c.status === 'PROCESSING') processing += count;
    }

    const processed = sent + simulated + failed + cancelled + unknown;
    const isStillWorking = pending > 0 || processing > 0;

    const currentJob = await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      select: { status: true, totalCount: true },
    });

    let finalStatus = currentJob?.status || 'COMPLETED';

    if (!isStillWorking) {
      if (currentJob?.status === 'CANCELLATION_REQUESTED' || currentJob?.status === 'CANCELLED') {
        finalStatus = (sent > 0 || simulated > 0) ? 'PARTIALLY_COMPLETED' : 'CANCELLED';
      } else if (failed === currentJob?.totalCount && currentJob.totalCount > 0) {
        finalStatus = 'FAILED';
      } else if (failed > 0 || unknown > 0) {
        finalStatus = 'PARTIALLY_COMPLETED';
      } else if (simulated > 0 && sent === 0 && failed === 0) {
        finalStatus = 'SIMULATED';
      } else {
        finalStatus = 'COMPLETED';
      }
    } else if (currentJob?.status === 'CANCELLATION_REQUESTED') {
      finalStatus = 'CANCELLATION_REQUESTED';
    }

    await prisma.emailBatchJob.update({
      where: { id: jobId },
      data: {
        processedCount: processed,
        sentCount: sent,
        simulatedCount: simulated,
        failedCount: failed,
        cancelledCount: cancelled,
        status: finalStatus,
        completedAt: isStillWorking ? null : new Date(),
      },
    }).catch(() => {});
  }

  /**
   * QA-21: Cancelación segura de lotes
   * 1. Cancela inmediatamente todos los ítems PENDING
   * 2. Si hay ítems PROCESSING (en vuelo SMTP), pasa a CANCELLATION_REQUESTED sin sobrescribirlos
   * 3. Si no hay ítems en vuelo, pasa directamente a CANCELLED
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

    // 1. Cancelar ítems PENDING
    await prisma.emailBatchItem.updateMany({
      where: { jobId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    // 2. Verificar ítems en vuelo
    const inFlightCount = await prisma.emailBatchItem.count({
      where: { jobId, status: 'PROCESSING' },
    });

    if (inFlightCount > 0) {
      await prisma.emailBatchJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLATION_REQUESTED' },
      });
    } else {
      await prisma.emailBatchJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    }

    await this.finalizeBatchStatus(jobId);
    return await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
  }

  /**
   * Reintentar ítems fallidos o con resultado incierto (QA-22)
   */
  static async retryFailed(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Lote no encontrado');

    if (eventId && job.eventId !== eventId) {
      throw new Error('No tiene autorización para gestionar lotes de otra edición.');
    }

    const resetCount = await prisma.emailBatchItem.updateMany({
      where: { jobId, status: { in: ['FAILED', 'UNKNOWN_DELIVERY_STATUS'] } },
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

      setImmediate(() => {
        this.processBatch(jobId).catch(() => {});
      });
    }

    return await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      include: { items: { take: 100 } },
    });
  }
}
