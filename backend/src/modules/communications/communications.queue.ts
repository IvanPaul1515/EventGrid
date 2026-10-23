import { usesBrevoHttps } from './brevo.transport.js';
import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '../../config/db.js';
import { decryptSecret } from '../../utils/crypto.js';
import { BadRequestError } from '../../utils/errors.js';
import QRCode from 'qrcode';
import { QrService } from '../qr/qr.service.js';

export interface EnqueueCustomParams {
  customSubject?: string;
  customBodyHtml?: string;
  customMessage?: string;
}

export type TransporterFactory = (config: any) => Transporter | any;

export class EmailQueueWorker {
  private static isRunning = false;
  private static authorizedJobs = new Set<string>();
  private static pollTimer: NodeJS.Timeout | null = null;
  private static activeJobs: Map<string, Promise<void>> = new Map();
  private static customTransporterFactory: TransporterFactory | null = null;

  /**
   * Permite inyectar una fábrica de transporte SMTP para pruebas unitarias/integración
   * controladas (QA-27) sin realizar envíos a servidores externos reales.
   */
  static setTransporterFactory(factory: TransporterFactory | null) {
    this.customTransporterFactory = factory;
  }

  /**
   * Inicializa el worker en segundo plano
   */
  static start() {
    // No startup recovery or polling: persisted jobs require a new user action.
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
    // A generic queue wakeup must never authorize historical mail.
  }

  /**
   * QA-22 / QA-28: Recupera ítems con lease expirado tras caída o reinicio del servidor.
   * Evita reenvíos duplicados: si ya hubo al menos un intento SMTP (attempts >= 1),
   * marca como UNKNOWN_DELIVERY_STATUS en lugar de volver ciegamente a PENDING.
   */
  static async recoverStaleJobs() {
    // Preserve persisted jobs and delivery history unchanged.
    return 0;
  }

  /**
   * Escanea y procesa lotes que tengan estado PENDING o PROCESSING
   */
  static async processPendingBatches() {
    // Only explicitly authorized individual batches may execute.
  }

  /**
   * Procesa un lote individual en fragmentos atómicos (QA-27, QA-28, QA-29, QA-30)
   */
  // Called only by explicit send/retry operations after their existing role checks.
  // Authorization is process-local, so a restart cannot resurrect pending mail.
  static async authorizeAndProcessBatch(jobId: string, customParams?: EnqueueCustomParams): Promise<void> {
    if (this.activeJobs.has(jobId)) return this.activeJobs.get(jobId);
    this.authorizedJobs.add(jobId);
    try { await this.processBatch(jobId, customParams); }
    finally { this.authorizedJobs.delete(jobId); }
  }

  static async processBatch(jobId: string, customParams?: EnqueueCustomParams): Promise<void> {
    if (!this.authorizedJobs.has(jobId)) return;
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

        // QA-24: Configuración SMTP con prioridad estricta de edición
        const config = await CommunicationsService.getRawConfig(job.eventId);
        const isConfigActive = Boolean(config && config.isEnabled);

        // QA-27: Separación estricta de modos REAL y SIMULATION
        const isSimulation = job.mode === 'SIMULATION';

        let transporter: any = null;

        if (!isSimulation) {
          // Campaña REAL: Validación estricta de configuración y credenciales
          if (!config || !config.isEnabled) {
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

          const rawPassword = config.password ? decryptSecret(config.password) : '';
          if (!usesBrevoHttps() && config.user && (!rawPassword || rawPassword.trim() === '')) {
            await prisma.emailBatchJob.update({
              where: { id: jobId },
              data: {
                status: 'FAILED',
                errorMessage: 'Configuración SMTP incompleta: se especificó usuario pero la contraseña está ausente para esta campaña real.',
                completedAt: new Date(),
              },
            });

            await prisma.emailBatchItem.updateMany({
              where: { jobId, status: 'PENDING' },
              data: {
                status: 'FAILED',
                errorMessage: 'Contraseña SMTP ausente durante campaña real.',
              },
            });

            await this.finalizeBatchStatus(jobId);
            return;
          }

          // Crear transporte SMTP unificado y robusto con pooling y timeouts
          if (this.customTransporterFactory) {
            transporter = this.customTransporterFactory(config);
          } else if (config.host) {
            transporter = CommunicationsService.createTransporter(config);
          }

          if (!transporter) {
            await prisma.emailBatchJob.update({
              where: { id: jobId },
              data: {
                status: 'FAILED',
                errorMessage: 'No fue posible inicializar el transporte SMTP para esta campaña real.',
                completedAt: new Date(),
              },
            });

            await prisma.emailBatchItem.updateMany({
              where: { jobId, status: 'PENDING' },
              data: {
                status: 'FAILED',
                errorMessage: 'Transporte SMTP no disponible durante campaña real.',
              },
            });

            await this.finalizeBatchStatus(jobId);
            return;
          }
        }

        const CHUNK_SIZE = 25;
        const LEASE_DURATION_MS = 120000; // 2 minutos de lease

        let hasMore = true;
        while (hasMore) {
          // QA-29: Reclamación atómica de destinatarios verificando de forma consistente el estado del lote
          const claimedItems = await prisma.$transaction(async (tx) => {
            // QA-35: Coordinación consistente y atómica entre trabajadores y cancelaciones
            const parentJob = await tx.emailBatchJob.findUnique({
              where: { id: jobId },
              select: { status: true },
            });

            if (!parentJob || parentJob.status === 'CANCELLED' || parentJob.status === 'CANCELLATION_REQUESTED') {
              // Cancelar de inmediato cualquier ítem remanente y abortar reclamo
              await tx.emailBatchItem.updateMany({
                where: { jobId, status: 'PENDING' },
                data: { status: 'CANCELLED' },
              });
              return [];
            }

            const now = new Date();
            const candidates = await tx.emailBatchItem.findMany({
              where: {
                jobId,
                status: 'PENDING',
                OR: [
                  { leaseUntil: null },
                  { leaseUntil: { lte: now } },
                ],
              },
              take: CHUNK_SIZE,
              orderBy: { createdAt: 'asc' },
            });

            if (candidates.length === 0) {
              return [];
            }

            const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);
            const candidateIds = candidates.map((c) => c.id);

            // Reclamación atómica condicionada sobre el estado PENDING
            await tx.emailBatchItem.updateMany({
              where: {
                id: { in: candidateIds },
                status: 'PENDING',
              },
              data: {
                status: 'PROCESSING',
                leaseUntil,
                lastAttemptAt: now,
                attempts: { increment: 1 },
              },
            });

            // Seleccionar exclusivamente las filas actualizadas bajo este lease activo
            const actuallyClaimed = await tx.emailBatchItem.findMany({
              where: {
                id: { in: candidateIds },
                status: 'PROCESSING',
              },
            });

            return actuallyClaimed;
          });

          if (claimedItems.length === 0) {
            hasMore = false;
            break;
          }

          // Procesar los ítems reclamados
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

              if (!isSimulation) {
                // Verificar en tiempo real el estado persistido antes de CADA intento real
                const freshConfig = await CommunicationsService.getRawConfig(job.eventId);
                if (!freshConfig || !freshConfig.isEnabled) {
                  await prisma.emailBatchItem.update({
                    where: { id: item.id },
                    data: {
                      status: 'FAILED',
                      errorMessage: 'Envío bloqueado: El servicio SMTP fue deshabilitado por el administrador.',
                    },
                  }).catch(() => {});
                  return;
                }
              }

              // QA-30: Prioridad estricta de contenido inmutable
              // 1. Contenido final renderizado y persistido del destinatario
              // 2. Instantánea inmutable de la campaña
              // 3. NUNCA consultar ni sustituir por plantilla actual de la base de datos
              let rendered: { subject: string; html: string; text: string };

              if (item.renderedSubject && item.renderedHtml) {
                rendered = {
                  subject: item.renderedSubject,
                  html: item.renderedHtml,
                  text: job.bodyText || item.renderedSubject,
                };
              } else if (job.templateSnapshot || job.bodyHtml || job.customBodyHtml || job.subject) {
                let tmplObj: any = null;
                if (job.templateSnapshot) {
                  try {
                    tmplObj = typeof job.templateSnapshot === 'string'
                      ? JSON.parse(job.templateSnapshot)
                      : job.templateSnapshot;
                  } catch {}
                }

                if (!tmplObj) {
                  tmplObj = {
                    subject: job.subject,
                    bodyHtml: job.bodyHtml || job.customBodyHtml || `<p>${job.customMessage || job.subject}</p>`,
                    bodyText: job.bodyText,
                  };
                }

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

                if (reg) {
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
                } else {
                  rendered = {
                    subject: job.subject,
                    html: tmplObj.bodyHtml || job.bodyHtml || `<p>${job.subject}</p>`,
                    text: tmplObj.bodyText || job.bodyText || job.subject,
                  };
                }
              } else {
                // Si falta contenido inmutable, no sustituir silenciosamente; marcar para revisión
                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'FAILED',
                    errorMessage: 'Lote sin instantánea de contenido inmutable para reconstrucción segura.',
                  },
                }).catch(() => {});
                return;
              }

              try {
                if (isSimulation) {
                  // Modo SIMULATED: No establece conexión SMTP ni ejecuta envíos reales
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
                  // Modo REAL: Ejecuta el envío real a través del transporte SMTP con attachments inline para Gmail
                  let preparedHtml = rendered.html;
                  let attachments: any[] = [];

                  if (item.registrationId) {
                    try {
                      const ticketInfo = await QrService.getTicketQr(item.registrationId);
                      if (ticketInfo?.qrToken) {
                        const publicUrlBase = process.env.PUBLIC_APP_URL || 'https://eventgrid.app';
                        const qrUrl = `${publicUrlBase}/t/${ticketInfo.qrToken}`;
                        const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 280, margin: 2, errorCorrectionLevel: 'H' });
                        const payload = CommunicationsService.prepareEmailPayload(preparedHtml, {
                          qrBuffer,
                          qrDataUrl: ticketInfo.qrDataUrl,
                          logoUrl: job.event?.settings?.logoUrl || (job.event as any)?.logoUrl,
                        });
                        preparedHtml = payload.html;
                        attachments = payload.attachments;
                      }
                    } catch {}
                  }

                  const sendResult = await transporter.sendMail({
                    from: `"${config?.fromName || 'EventGrid'}" <${config?.fromEmail || 'noreply@eventgrid.app'}>`,
                    to: email,
                    replyTo: config?.replyToEmail || undefined,
                    messageId: item.messageId || undefined,
                    subject: rendered.subject,
                    text: rendered.text,
                    html: preparedHtml,
                    attachments: attachments.length > 0 ? attachments : undefined,
                  });

                  // QA-34: Validación verificable de aceptación SMTP (excluye messageId como prueba suficiente)
                  const cleanRecipient = email.toLowerCase().trim();
                  const acceptedList = Array.isArray(sendResult?.accepted)
                    ? sendResult.accepted.map((e: any) => String(e).toLowerCase().trim())
                    : [];
                  const rejectedList = Array.isArray(sendResult?.rejected)
                    ? sendResult.rejected.map((e: any) => String(e).toLowerCase().trim())
                    : [];

                  const hasExplicitAccepted = acceptedList.includes(cleanRecipient);
                  const has250Response = typeof sendResult?.response === 'string' && sendResult.response.trim().startsWith('250');
                  const isExplicitRejected = rejectedList.includes(cleanRecipient);

                  if (!isExplicitRejected && (hasExplicitAccepted || has250Response)) {
                    // Aceptado efectivamente por SMTP
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'ACCEPTED_BY_SMTP',
                        messageId: sendResult.messageId || item.messageId,
                        sentAt: new Date(),
                        errorMessage: null,
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
                        status: 'ACCEPTED_BY_SMTP',
                        messageId: sendResult.messageId || item.messageId,
                        batchId: job.id,
                        sentByUserId: job.createdById || null,
                      },
                    }).catch(() => {});
                  } else if (isExplicitRejected) {
                    // Rechazado explícitamente por el servidor SMTP
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'FAILED',
                        leaseUntil: null,
                        errorMessage: `Destinatario rechazado por SMTP: ${JSON.stringify(sendResult?.rejected)}`,
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
                        status: 'FAILED',
                        errorMessage: `Rechazo SMTP confirmado: ${JSON.stringify(sendResult?.rejected)}`,
                        batchId: job.id,
                        sentByUserId: job.createdById || null,
                      },
                    }).catch(() => {});
                  } else {
                    // Resultado INCIERTO: No hay aceptación 250 ni confirmación en accepted
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'UNKNOWN_DELIVERY_STATUS',
                        leaseUntil: null,
                        errorMessage: `Resultado incierto: Sin confirmación 250 ni aceptación en transporte (Respuesta: ${JSON.stringify(sendResult?.response || sendResult)})`,
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
                        status: 'FAILED',
                        errorMessage: 'Resultado incierto: Ausencia de confirmación SMTP verificable',
                        batchId: job.id,
                        sentByUserId: job.createdById || null,
                      },
                    }).catch(() => {});
                  }
                }
              } catch (err: any) {
                // QA-28: Distinguir errores con resultado confirmado de errores con resultado incierto
                const currentAttempts = item.attempts;
                const errMsg = err?.message || String(err);
                const errCode = err?.code || '';
                const responseCode = err?.responseCode || (err?.response ? parseInt(String(err.response).slice(0, 3), 10) : null);

                // 1. Desconexión tras aceptación SMTP (si el mensaje fue aceptado pero el comando QUIT falló)
                if (err?.accepted && Array.isArray(err.accepted) && err.accepted.includes(email)) {
                  await prisma.emailBatchItem.update({
                    where: { id: item.id },
                    data: {
                      status: 'ACCEPTED_BY_SMTP',
                      sentAt: new Date(),
                      errorMessage: `Aceptado por SMTP antes de desconexión: ${errMsg}`,
                    },
                  }).catch(() => {});
                  return;
                }

                // 2. Rechazo permanente confirmado (5xx: buzón inexistente, rechazado por directiva, etc.)
                if (responseCode && responseCode >= 500 && responseCode < 600) {
                  await prisma.emailBatchItem.update({
                    where: { id: item.id },
                    data: {
                      status: 'FAILED',
                      leaseUntil: null,
                      errorMessage: `Rechazo permanente SMTP (${responseCode}): ${errMsg}`,
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
                      errorMessage: `Rechazo permanente SMTP (${responseCode}): ${errMsg}`,
                      batchId: job.id,
                      sentByUserId: job.createdById || null,
                    },
                  }).catch(() => {});
                  return;
                }

                // 3. Rechazo temporal confirmado (4xx: buzón ocupado, límite de velocidad, greylisting)
                if (responseCode && responseCode >= 400 && responseCode < 500) {
                  if (currentAttempts < 3) {
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'PENDING',
                        errorMessage: `Reintento programado por rechazo temporal SMTP (${responseCode}): ${errMsg}`,
                        leaseUntil: new Date(Date.now() + 10000),
                      },
                    }).catch(() => {});
                  } else {
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'FAILED',
                        leaseUntil: null,
                        errorMessage: `Excedido límite de reintentos por rechazo temporal SMTP (${responseCode}): ${errMsg}`,
                      },
                    }).catch(() => {});
                  }
                  return;
                }

                // 4. Fallo confirmado ANTES de la transmisión (DNS, conexión rechazada, auth)
                const isPreTransmission =
                  errCode === 'ENOTFOUND' ||
                  errCode === 'ECONNREFUSED' ||
                  errCode === 'EAUTH' ||
                  errCode === 'EPROTO' ||
                  (errCode === 'ETIMEDOUT' && err?.command === 'CONN') ||
                  err?.stage === 'CONNECT';

                if (isPreTransmission) {
                  if (currentAttempts < 3) {
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'PENDING',
                        errorMessage: `Reintento programado por fallo de conexión previo a transmisión (${errCode || errMsg})`,
                        leaseUntil: new Date(Date.now() + 10000),
                      },
                    }).catch(() => {});
                  } else {
                    await prisma.emailBatchItem.update({
                      where: { id: item.id },
                      data: {
                        status: 'FAILED',
                        leaseUntil: null,
                        errorMessage: `Fallo de conexión previo a transmisión: ${errMsg}`,
                      },
                    }).catch(() => {});
                  }
                  return;
                }

                // 5. Resultado INCIERTO (Incertidumbre SMTP: desconexión o timeout DURANTE o TRAS comando DATA)
                const isUncertain =
                  errCode === 'ECONNRESET' ||
                  errCode === 'ETIMEDOUT' ||
                  errCode === 'EPIPE' ||
                  err?.command === 'DATA' ||
                  err?.stage === 'DATA' ||
                  errMsg.toLowerCase().includes('timeout') ||
                  errMsg.toLowerCase().includes('reset');

                if (isUncertain) {
                  await prisma.emailBatchItem.update({
                    where: { id: item.id },
                    data: {
                      status: 'UNKNOWN_DELIVERY_STATUS',
                      errorMessage: `Resultado de entrega incierto: la conexión falló durante o tras la transmisión de datos (${errMsg}). Reenvío automático suspendido para evitar duplicados.`,
                      leaseUntil: null,
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
                      errorMessage: `Resultado incierto: ${errMsg}`,
                      batchId: job.id,
                      sentByUserId: job.createdById || null,
                    },
                  }).catch(() => {});
                  return;
                }

                // 6. Cualquier otro error no categorizado: FAILED
                await prisma.emailBatchItem.update({
                  where: { id: item.id },
                  data: {
                    status: 'FAILED',
                    leaseUntil: null,
                    errorMessage: errMsg || 'Error al enviar por SMTP',
                  },
                }).catch(() => {});
              }
            })
          );
        }

        // Actualizar contadores y estado final
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
   * QA-21 / QA-29: Calcula los totales reales y fija el estado final del lote
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
   * QA-29: Cancelación atómica y segura de lotes
   * 1. Cancela inmediatamente todos los ítems PENDING dentro de una transacción
   * 2. Si hay ítems PROCESSING (en vuelo SMTP), pasa a CANCELLATION_REQUESTED sin sobrescribirlos
   * 3. Si no hay ítems en vuelo, pasa a CANCELLED (o PARTIALLY_COMPLETED si hubo envíos)
   */
  static async cancelBatch(jobId: string, eventId?: string) {
    const updatedJob = await prisma.$transaction(async (tx) => {
      const job = await tx.emailBatchJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Lote no encontrado');

      if (eventId && job.eventId !== eventId) {
        throw new Error('No tiene autorización para cancelar un lote perteneciente a otra edición.');
      }

      if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
        return job;
      }

      // 1. Cancelar ítems PENDING inmediatamente
      await tx.emailBatchItem.updateMany({
        where: { jobId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      // 2. Verificar ítems en vuelo (PROCESSING)
      const inFlightCount = await tx.emailBatchItem.count({
        where: { jobId, status: 'PROCESSING' },
      });

      const nextStatus = inFlightCount > 0 ? 'CANCELLATION_REQUESTED' : 'CANCELLED';

      return await tx.emailBatchJob.update({
        where: { id: jobId },
        data: {
          status: nextStatus,
          completedAt: inFlightCount > 0 ? null : new Date(),
        },
      });
    });

    await this.finalizeBatchStatus(jobId);
    return await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
  }

  /**
   * QA-31: Reintentar ÚNICAMENTE ítems con fallo confirmado (status: 'FAILED')
   * No incluye bajo ninguna circunstancia destinatarios con resultado incierto.
   */
  static async retryFailed(jobId: string, eventId?: string) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Lote no encontrado');

    if (eventId && job.eventId !== eventId) {
      throw new Error('No tiene autorización para gestionar lotes de otra edición.');
    }

    if (job.mode === 'REAL') {
      const { CommunicationsService } = await import('./communications.service.js');
      const config = await CommunicationsService.getRawConfig(job.eventId);
      if (!config || !config.isEnabled) {
        throw new BadRequestError(
          'El servidor SMTP no está configurado o está deshabilitado. No se pueden reintentar envíos reales mientras SMTP permanezca apagado.'
        );
      }
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

      setImmediate(() => {
        this.authorizeAndProcessBatch(jobId).catch(() => {});
      });
    }

    return await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      include: { items: { take: 100 } },
    });
  }

  /**
   * QA-31: Reintentar destinatarios con resultado INCIERTO (UNKNOWN_DELIVERY_STATUS).
   * Requiere autorización explícita del administrador aceptando el riesgo de duplicación.
   */
  static async retryUncertain(
    jobId: string,
    eventId?: string,
    confirmation?: { confirmedDuplicateRisk?: boolean; reason?: string; userId?: string }
  ) {
    const job = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Lote no encontrado');

    if (eventId && job.eventId !== eventId) {
      throw new Error('No tiene autorización para gestionar lotes de otra edición.');
    }

    if (job.mode === 'REAL') {
      const { CommunicationsService } = await import('./communications.service.js');
      const config = await CommunicationsService.getRawConfig(job.eventId);
      if (!config || !config.isEnabled) {
        throw new BadRequestError(
          'El servidor SMTP no está configurado o está deshabilitado. No se pueden reintentar envíos reales mientras SMTP permanezca apagado.'
        );
      }
    }

    if (!confirmation?.confirmedDuplicateRisk) {
      throw new BadRequestError(
        'Reintento de envíos inciertos rechazado: debe confirmar explícitamente que acepta el riesgo de enviar correos duplicados.'
      );
    }

    if (!confirmation.reason || confirmation.reason.trim().length < 5) {
      throw new BadRequestError(
        'Debe especificar un motivo justificado para autorizar el reintento de envíos inciertos (mínimo 5 caracteres).'
      );
    }

    // QA-37: Reintento transaccional obligatorio con registro estricto en auditoría
    const result = await prisma.$transaction(async (tx) => {
      const resetCount = await tx.emailBatchItem.updateMany({
        where: { jobId, status: 'UNKNOWN_DELIVERY_STATUS' },
        data: {
          status: 'PENDING',
          attempts: 0,
          errorMessage: null,
          leaseUntil: null,
        },
      });

      if (resetCount.count === 0) {
        return { count: 0 };
      }

      await tx.emailBatchJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          completedAt: null,
        },
      });

      // Auditoría sin .catch: si la auditoría falla, se anula el reenvío completo
      await tx.auditLog.create({
        data: {
          userId: confirmation.userId || null,
          action: 'RETRY_UNCERTAIN_BATCH',
          entity: 'EMAIL_BATCH_JOB',
          entityId: jobId,
          changes: JSON.stringify({
            adminUserId: confirmation.userId || null,
            eventId: job.eventId,
            batchId: jobId,
            recipientCount: resetCount.count,
            reason: (confirmation.reason || '').trim(),
            confirmedRisk: true,
            authorizedAt: new Date().toISOString(),
          }),
        },
      });

      return { count: resetCount.count };
    });

    if (result.count > 0) {
      setImmediate(() => {
        this.authorizeAndProcessBatch(jobId).catch(() => {});
      });
    }

    return await prisma.emailBatchJob.findUnique({
      where: { id: jobId },
      include: { items: { take: 100 } },
    });
  }
}
