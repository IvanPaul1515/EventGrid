import {NotificationsService} from './notifications.service.js';
import {RealtimeService} from '../realtime/realtime.service.js';
export function flushNotificationDeliveries(eventId:string){for(const row of NotificationsService.takeDeliveries(eventId))RealtimeService.notificationsChanged(eventId,row.recipientId,'NEW',row.ids);}
const pending=new Map<string,{again:boolean}>();
// Only explicit, persisted business mutations schedule work; no startup or polling job.
export function scheduleNotifications(eventId:string){const current=pending.get(eventId);if(current){current.again=true;return;}const state={again:false};pending.set(eventId,state);
 const run=async()=>{state.again=false;try{const changed=await NotificationsService.sync(eventId);flushNotificationDeliveries(eventId);if(changed){RealtimeService.changed(eventId,['notifications']);RealtimeService.notificationsChanged(eventId,undefined,'REFRESH');}}catch{console.warn('EventGrid: notificaciones pendientes de sincronizar; se recuperarán al consultar.');}finally{if(state.again){const timer=setTimeout(run,150);timer.unref?.();}else pending.delete(eventId);}};
 const timer=setTimeout(run,150);timer.unref?.();}
