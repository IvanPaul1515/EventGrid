type Row={name:string;value:number};
export function statisticsInsights(data:{participants:{registered:number;attended:number;absent:number;cancelled:number};attendanceHours:Row[];unknownAttendanceTime:number;shirts:{sizeComparison:{name:string;requested:number}[];unknownRequested:number}}):string[] {
 const result:string[]=[],{attended,absent,cancelled,registered}=data.participants,eligible=attended+absent;
 if(eligible>0)result.push(`El ${(absent/eligible*100).toFixed(1)} % de ${eligible} registros no cancelados de la cohorte no tiene asistencia (${absent} ausentes).`);
 else result.push('No hay registros no cancelados suficientes para calcular ausentismo.');
 if(cancelled>0)result.push(`${cancelled} registros cancelados se excluyen del porcentaje; la cohorte contiene ${registered} registros.`);
 const hours=data.attendanceHours.filter(r=>Number.isFinite(r.value)&&r.value>0),peak=Math.max(0,...hours.map(r=>r.value));
 if(peak>0){const names=hours.filter(r=>r.value===peak).map(r=>r.name);result.push(`${names.length>1?'Franjas con más llegadas (empate)':'Franja con más llegadas'}: ${names.join(', ')}; ${peak} check-ins por franja, sobre ${hours.reduce((n,r)=>n+r.value,0)} con hora conocida.`);}
 if(data.unknownAttendanceTime>0)result.push(`${data.unknownAttendanceTime} asistentes sin hora persistida se excluyen del análisis horario.`);
 const sizes=data.shirts.sizeComparison.filter(r=>r.requested>0),most=Math.max(0,...sizes.map(r=>r.requested));
 if(most>0)result.push(`Talla originalmente más solicitada entre asistentes filtrados con dato recuperable: ${sizes.filter(r=>r.requested===most).map(r=>r.name).join(', ')} (${most} solicitudes por talla; muestra ${sizes.reduce((n,r)=>n+r.requested,0)}).`);
 if(data.shirts.unknownRequested>0)result.push(`${data.shirts.unknownRequested} tallas originales no recuperables no se incluyen en ese ranking.`);
 result.push('Los registros de asistencia no explican por qué una persona faltó. Consulta únicamente motivos declarados voluntariamente en Opiniones, sin extrapolarlos a otros ausentes.');
 return result;
}
