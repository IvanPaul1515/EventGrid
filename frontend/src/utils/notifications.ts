export type NotificationItem={id:string;eventId:string;kind:string;title:string;description:string;createdAt:string;readAt:string|null;priority:string;relatedStatus:string;referenceId:string};
export const notificationBadge=(count:number)=>count>99?'99+':count>0?String(count):'';
export function newLiveNotifications(items:NotificationItem[],known:Set<string>,since:string,live:boolean){return live?items.filter(n=>!n.readAt&&!known.has(n.id)&&Date.parse(n.createdAt)>Date.parse(since)):[];}
export function notificationRoute(item:{id:string}){return '/notifications/'+encodeURIComponent(item.id);}
export function soundAllowed(enabled:boolean,unlocked:boolean,state:string,last:number,now:number){return enabled&&unlocked&&state==='running'&&now-last>=2000;}
