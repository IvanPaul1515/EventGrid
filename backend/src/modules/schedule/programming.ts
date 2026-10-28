import {BadRequestError} from '../../utils/errors.js';
export function eventDates(start:Date|string,end:Date|string){
 const first=new Date(start).toISOString().slice(0,10),last=new Date(end).toISOString().slice(0,10),dates:string[]=[];
 for(let day=Date.parse(first);day<=Date.parse(last)&&dates.length<366;day+=86400000)dates.push(new Date(day).toISOString().slice(0,10));
 return dates;
}
export function officialDay(value:string|undefined,dates:string[]){
 if(!value)return dates.length===1?dates[0]:'';
 const legacy=value.match(/^Día (\d+)$/i);const day=legacy?dates[Number(legacy[1])-1]:value;
 if(!day||!dates.includes(day))throw new BadRequestError('Selecciona una fecha oficial de la edición.');return day;
}
export function programmingReady(item:{day?:string;startTime?:string;endTime?:string;room?:string|null}){return Boolean(item.day&&/^\d{4}-\d{2}-\d{2}$/.test(item.day)&&item.startTime&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime)&&item.endTime&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.endTime)&&item.endTime>item.startTime&&item.room?.trim());}
