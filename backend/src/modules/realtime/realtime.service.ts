import { prisma } from '../../config/db.js';
import { Response } from 'express';

export interface RealtimeEventPayload {
  type: string;
  eventId: string;
  timestamp: string;
  data: any;
}

export class RealtimeService {
  private static clients: Map<string, Set<Response>> = new Map();
  private static heartbeatInterval: NodeJS.Timeout | null = null;
  private static sequenceId = 0;
  private static identities = new Map<Response, { scannerOnly?: boolean; userId: string; role: string; assignedEventId?: string | null; expiresAt?: number; sessionVersion?: number; sessionId?: string }>();
  static queueChanged(eventId: string) {
    for (const response of this.clients.get(eventId) || []) {
      const identity = this.identities.get(response);
      if (!identity || !['ADMIN','OPERATOR'].includes(identity.role)) continue;
      try { response.write(`event: message\ndata: ${JSON.stringify({type:'RECEPTION_QUEUE_CHANGED',eventId,data:{}})}\n\n`); } catch { this.removeClient(eventId,response); }
    }
  }
  static changed(eventId: string, domains: string[]) { this.emit(eventId, { type: 'DATA_CHANGED', data: { domains } }); }
  static notifyAccess(userId: string) {
    for (const [response, identity] of this.identities) if (identity.userId === userId) {
      try { response.write(`event: message\ndata: ${JSON.stringify({ type: 'ACCESS_CHANGED', timestamp: new Date().toISOString(), data: {} })}\n\n`); response.end(); } catch {}
      for (const [eventId] of this.clients) this.removeClient(eventId, response);
    }
  }

  static targetSessions(eventId: string, sessionIds: string[], event: { type: 'SCANNER_CHANGED'; data: { linkId: string } }) {
    // Never route participant data through an edition-wide event.
    for (const response of this.clients.get(eventId) || []) {
      const identity = this.identities.get(response);
      if (!identity?.sessionId || !sessionIds.includes(identity.sessionId)) continue;
      try { response.write(`id: ${++this.sequenceId}\nevent: message\ndata: ${JSON.stringify({ ...event, eventId })}\n\n`); }
      catch { this.removeClient(eventId, response); }
    }
  }

  static scannerStationsChanged(eventId: string, userId: string) {
    // Discovery contains no station identifiers, codes or participant details.
    for (const response of this.clients.get(eventId) || []) {
      const identity = this.identities.get(response);
      if (identity?.userId !== userId || !['ADMIN', 'OPERATOR'].includes(identity.role)) continue;
      try { response.write(`event: message\ndata: ${JSON.stringify({ type: 'SCANNER_STATIONS_CHANGED', eventId, data: {} })}\n\n`); }
      catch { this.removeClient(eventId, response); }
    }
  }

  static notifySession(sessionId: string) {
    for (const [response, identity] of this.identities) if (identity.sessionId === sessionId) {
      try { response.write(`event: message\ndata: ${JSON.stringify({ type: 'ACCESS_CHANGED', data: {} })}\n\n`); response.end(); } catch {}
      for (const [eventId] of this.clients) this.removeClient(eventId, response);
    }
  }

  static init() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
    // Ensure timer doesn't keep node alive in tests
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  static addClient(eventId: string, res: Response, identity?: { scannerOnly?: boolean; userId: string; role: string; assignedEventId?: string | null; expiresAt?: number; sessionVersion?: number; sessionId?: string }) {
    this.init();
    if (identity) this.identities.set(res, identity);
    if (!this.clients.has(eventId)) {
      this.clients.set(eventId, new Set());
    }
    this.clients.get(eventId)!.add(res);

    const initialPayload: RealtimeEventPayload = {
      type: 'CONNECTED',
      eventId,
      timestamp: new Date().toISOString(),
      data: {
        message: 'Conexión en tiempo real activa (SSE)',
        connectedClients: this.clients.get(eventId)!.size,
      },
    };

    res.write(`id: ${++this.sequenceId}\nevent: message\ndata: ${JSON.stringify(initialPayload)}\n\n`);
    this.changed(eventId, ['operations']);
  }

  static removeClient(eventId: string, res: Response) {
    this.identities.delete(res);
    const eventClients = this.clients.get(eventId);
    if (eventClients) {
      eventClients.delete(res);
      if (eventClients.size === 0) {
        this.clients.delete(eventId);
      }
    }
    this.changed(eventId, ['operations']);
    if (!this.clients.size && this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
  }

  static emit(eventId: string, event: { type: string; data?: any }) {
    const eventClients = this.clients.get(eventId);
    if (!eventClients || eventClients.size === 0) {
      return;
    }

    const payload: RealtimeEventPayload = {
      type: event.type,
      eventId,
      timestamp: new Date().toISOString(),
      data: event.type === 'DATA_CHANGED' ? { domains: event.data?.domains || [] } : { registrationId: event.data?.registrationId },
    };

    const message = `id: ${++this.sequenceId}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of Array.from(eventClients)) {
      try {
        const identity = this.identities.get(client);
        if (identity?.scannerOnly) continue;
        const visibleDomains = payload.data?.domains?.filter((domain: string) => (!['users', 'operations'].includes(domain) || identity?.role === 'ADMIN') && (domain !== 'courtesies' || identity?.role === 'ADMIN' || identity?.role === 'OPERATOR'));
        if (payload.type === 'DATA_CHANGED' && visibleDomains && !visibleDomains.length) continue;
        const safeMessage = payload.type === 'DATA_CHANGED' ? `id: ${this.sequenceId}\nevent: message\ndata: ${JSON.stringify({ ...payload, data: { domains: visibleDomains || [] } })}\n\n` : message;
        client.write(safeMessage);
      } catch {
        this.removeClient(eventId, client);
      }
    }
  }

  static async sendHeartbeat() {
    if (!this.clients.size) return;
    try {
      const identities = [...this.identities.values()];
      const users = await prisma.user.findMany({ where: { id: { in: [...new Set(identities.map(identity => identity.userId))] } }, select: { scannerOnly: true, id: true, role: true, assignedEventId: true, isActive: true, accountStatus: true, sessionVersion: true } });
      const sessions = await prisma.authSession.findMany({ where: { id: { in: identities.flatMap(i => i.sessionId ? [i.sessionId] : []) } } });
      for (const identity of identities) {
        if (identity.sessionId) { const session = sessions.find(s => s.id === identity.sessionId); if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) { this.notifySession(identity.sessionId); continue; } }
        const user = users.find(item => item.id === identity.userId);
        if (!user || !user.isActive || user.accountStatus === 'PENDING' || (identity.sessionVersion || 0) !== user.sessionVersion || user.role !== identity.role || Boolean(user.scannerOnly) !== Boolean(identity.scannerOnly) || user.assignedEventId !== identity.assignedEventId || (identity.expiresAt && Date.now() >= identity.expiresAt)) this.notifyAccess(identity.userId);
      }
    } catch {
      for (const [eventId, clients] of this.clients) for (const client of [...clients]) { client.end(); this.removeClient(eventId, client); }
      return; // Fail closed if current authorization cannot be checked.
    }

    for (const [eventId, eventClients] of this.clients.entries()) {
      for (const client of Array.from(eventClients)) {
        try {
          client.write(`: ping ${new Date().toISOString()}\n\n`);
        } catch {
          this.removeClient(eventId, client);
        }
      }
    }
  }

  static connectedOperatorIds(eventId: string) {
    return [...new Set([...(this.clients.get(eventId) || [])].map(response => this.identities.get(response)).filter(identity => identity?.role === 'OPERATOR' && (!identity.expiresAt || identity.expiresAt > Date.now())).map(identity => identity!.userId))];
  }

  static getConnectedCount(eventId?: string): number {
    if (eventId) {
      return this.clients.get(eventId)?.size || 0;
    }
    let total = 0;
    for (const set of this.clients.values()) {
      total += set.size;
    }
    return total;
  }
}
