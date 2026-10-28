import { BadRequestError } from '../../utils/errors.js';

export function stockSummary(initial: number, movements: {kind:string;quantity:number}[]) {
  const sum=(kind:string)=>movements.filter(m=>m.kind===kind).reduce((n,m)=>n+m.quantity,0);
  const received=sum('RECEIVE'),delivered=sum('DELIVER'),reserved=sum('RESERVE')-sum('RELEASE')-delivered;
  return {initial,received,delivered,reserved,available:initial+received-delivered-reserved-sum('WITHDRAW'),physical:initial+received-delivered-sum('WITHDRAW')};
}
export function assertCapacity(summary:ReturnType<typeof stockSummary>,quantity=1){
  if(summary.available<quantity)throw new BadRequestError('No hay existencias disponibles para reservar.');
}
export function assertQuota(participant:number,staff:number,total:number){
  if(participant+staff>total)throw new BadRequestError('Los cupos superan las existencias iniciales.');
}
