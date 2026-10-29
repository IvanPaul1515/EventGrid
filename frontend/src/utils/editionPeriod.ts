export function editionPeriod(start?:string,end?:string,timeZone='America/Santo_Domingo') {
 try {
  if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))return null;
  const format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const from=format.format(new Date(start)),to=format.format(new Date(end));
  return from<=to?{from,to,singleDay:from===to}:null;
 }catch{return null;}
}
export function supervisionQuery(open:boolean,from:string,to:string,shirt:string,period:ReturnType<typeof editionPeriod>,allDates=false):{dateFrom?:string;dateTo?:string;tshirtDelivery?:'PENDING'|'DELIVERED'|'NOT_DELIVERED'} {
 const delivery=shirt==='PENDING'||shirt==='DELIVERED'||shirt==='NOT_DELIVERED'?shirt:undefined;
 return {dateFrom:open&&!allDates?(from||period?.from):undefined,dateTo:open&&!allDates?(to||period?.to):undefined,tshirtDelivery:open?delivery:undefined};
}
