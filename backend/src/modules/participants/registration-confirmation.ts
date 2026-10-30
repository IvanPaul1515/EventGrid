import {BadRequestError} from '../../utils/errors.js';
export function registrationConfirmation(input:{balanceDue:number;isCourtesy:boolean;historical?:boolean;overrideStatus?:string;overrideReason?:string;actorRole?:string}) {
 if(input.overrideReason){if(input.actorRole!=='ADMIN'||input.overrideReason.trim().length<10||!['PENDING','CONFIRMED'].includes(input.overrideStatus||''))throw new BadRequestError('El ajuste de inscripción requiere administrador y un motivo de al menos 10 caracteres.');return input.overrideStatus as 'PENDING'|'CONFIRMED';}
 return input.historical?'PENDING':input.isCourtesy||input.balanceDue===0?'CONFIRMED':'PENDING';
}
