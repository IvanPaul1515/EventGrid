import React from 'react';
export type PaymentView={isCourtesy?:boolean;paymentStatus?:string|null;balanceDue?:number|string;amountPaid?:number|string};
export function PaymentStatusBadge({registration:reg,verbose=false}:{registration:PaymentView;verbose?:boolean}){
 const state=reg.isCourtesy?'COURTESY':reg.paymentStatus||(Number(reg.balanceDue||0)<=0?'PAID':Number(reg.amountPaid||0)>0?'PARTIAL':'PENDING');
 const styles=state==='COURTESY'?'bg-purple-500/15 text-purple-300 border-purple-500/30':state==='PAID'?'bg-emerald-500/15 text-emerald-400 border-emerald-500/30':state==='PARTIAL'?'bg-amber-500/15 text-amber-400 border-amber-500/30':'bg-rose-500/15 text-rose-400 border-rose-500/30';
 const label=state==='COURTESY'?'Cortesía':state==='PAID'?'Pagado':state==='PARTIAL'?'Parcial':verbose?'Pago pendiente':'Pendiente';
 return <span className={'px-2 py-0.5 text-[10px] font-bold rounded-full border '+styles}>{label}</span>;
}
