// This allows only the recipient-scoped notification API through the scanner gate.
// Administration and business-source permissions remain enforced by their routes.
export function scannerNotificationRoute(method:string,path:string){
 const id='[a-fA-F0-9-]{36}';
 return method==='GET'&&new RegExp('^/notifications(?:/'+id+')?$').test(path)||method==='PUT'&&path==='/notifications/preferences'||method==='POST'&&(path==='/notifications/read-all'||new RegExp('^/notifications/'+id+'/read$').test(path));
}
