import crypto from 'node:crypto';
import {NotificationsService} from '../notifications/notifications.service.js';
import {scheduleNotifications,flushNotificationDeliveries} from '../notifications/notifications.schedule.js';
import { Request, Response, NextFunction } from 'express';
import { RealtimeService } from './realtime.service.js';
// Observe successful persisted API actions once. Preview/read-only POSTs never invalidate.
// No response data is broadcast; subscribers re-read their authorized endpoints.
const domains: Record<string, string[]> = {
  scanner: ['incidents'],
  finance: ['participants', 'attendance', 'sales', 'dashboard', 'communications', 'courtesies'],
  participants: ['participants', 'attendance', 'sales', 'inventory', 'dashboard', 'courtesies', 'operations'],
  attendance: ['participants', 'attendance', 'inventory', 'dashboard', 'courtesies', 'operations'],
  inventory: ['inventory', 'participants', 'attendance', 'dashboard'],
  communications: ['communications'], sponsors: ['sponsors', 'dashboard', 'sales'], staff: ['staff'], users: ['users'],
  schedule: ['schedule'], events: ['settings', 'schedule', 'dashboard', 'sales'],
  import: ['participants', 'attendance', 'sales', 'inventory', 'dashboard', 'courtesies', 'operations'], demo: ['participants', 'attendance', 'inventory', 'dashboard', 'courtesies', 'operations'],
};
export function realtimeMutations(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || /\/scanner(?:\/|$)/.test(req.path)&&!req.path.endsWith('/incident')) return next();
  const incidentMutation = req.path.includes('/incidents');
  const parts = req.path.split('/').filter(Boolean);
  const module = parts.find(part => part !== 'events' && domains[part]) || (parts.includes('events') ? 'events' : '');
  if (!module || /\/(preview|selection|scan|analyze|validate|export|test|test-connection)(?:\/|$)/.test(req.path)) return next();
  let eventId: string | undefined; let assignedId: string | undefined; let targetUser: string | undefined; let confirmed = false;
  let importOutcome:{key:string;referenceId:string}|undefined;
  const json = res.json;
  res.json = function(body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false && body?.data?.success !== false && body?.status !== 'error') {
      eventId = (module === 'events' ? req.params.id || body?.data?.id : undefined) || req.eventId || req.params.eventId || (req.headers['x-event-id'] as string);
      if (module === 'users') { assignedId = body?.data?.assignedEventId; targetUser = body?.data?.id || req.params.id; }
      confirmed = Boolean(req.user);
      if(module==='import'&&req.path.endsWith('/execute')&&(body?.data?.errorCount>0||body?.data?.reviewCount>0||body?.data?.merchReconciliation?.issues?.length)){const parent=typeof req.body?.batchId==='string'?req.body.batchId:undefined;const referenceId=body.data.batchId||body.data.results?.find((r:any)=>r.batchId)?.batchId||parent||crypto.createHash('sha256').update(JSON.stringify({rows:req.body?.rows,mapping:req.body?.columnMapping})).digest('hex');importOutcome={referenceId,key:parent?`import:manuscript:${parent}:${req.user!.id}`:`import:${referenceId}`};}

    }
    return json.call(this, body);
  };
  res.once('finish', () => {
    if (!confirmed) return;
    for (const id of new Set([eventId, assignedId].filter(Boolean))) {RealtimeService.changed(id!, module === 'attendance' && incidentMutation ? ['incidents','operations'] : domains[module]);if(['participants','attendance','scanner','finance','import','inventory','events'].includes(module))scheduleNotifications(id!);}
    if(importOutcome&&eventId&&req.user)void NotificationsService.importOutcome(eventId,req.user.id,importOutcome.key,importOutcome.referenceId).then(()=>{flushNotificationDeliveries(eventId!);RealtimeService.changed(eventId!,['notifications']);}).catch(()=>console.warn('EventGrid: aviso de importación pendiente de sincronizar.'));
    if (targetUser && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) RealtimeService.notifyAccess(targetUser);
  });
  next();
}
