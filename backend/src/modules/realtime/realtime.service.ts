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

  static addClient(eventId: string, res: Response) {
    this.init();
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
  }

  static removeClient(eventId: string, res: Response) {
    const eventClients = this.clients.get(eventId);
    if (eventClients) {
      eventClients.delete(res);
      if (eventClients.size === 0) {
        this.clients.delete(eventId);
      }
    }
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
      data: event.data || {},
    };

    const message = `id: ${++this.sequenceId}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of Array.from(eventClients)) {
      try {
        client.write(message);
      } catch {
        this.removeClient(eventId, client);
      }
    }
  }

  static sendHeartbeat() {
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
