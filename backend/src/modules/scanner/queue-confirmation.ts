import {createHash} from 'node:crypto';
export type CapDecision='DELIVER'|'NO_DELIVERY';
export type QueueConfirmation={capDecision?:CapDecision;requestKey?:string;requestHash?:string};
export type QueueReceipt={name:string;number:string;officialOrder:number|null;shirt:{status:'DELIVERED'|'NOT_DELIVERED'|'NOT_INCLUDED';size:string|null;reason:string|null};cap:{status:'DELIVERED'|'PENDING'|'NOT_INCLUDED'}};
export function confirmationHash(size:string|undefined,delivered:boolean,decision:unknown,capDecision?:CapDecision){return createHash('sha256').update(JSON.stringify({size:size||null,delivered,decision:decision||null,capDecision:capDecision||null})).digest('hex');}
