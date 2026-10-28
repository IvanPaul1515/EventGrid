export type ReceiptDraft={date:string;time:string;amount:string;receipt:string;method:string;reference:string;participant:string};
export function receiptProposals(text:string):ReceiptDraft{return receiptAnalysis(text).draft;}
function originalProposals(text:string):ReceiptDraft{
 const pick=(pattern:RegExp)=>text.match(pattern)?.[1]?.trim()||'';
 return {date:pick(/(?:fecha|date)\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i),time:pick(/(?:hora|time)\s*[:#]?\s*([0-2]\d:[0-5]\d(?::[0-5]\d)?)/i),amount:pick(/(?:total|importe|monto)\s*[:$]?\s*(?:RD\$|DOP|USD|\$)?\s*([0-9][0-9.,]*)/i),receipt:pick(/(?:comprobante|recibo)\s*(?:n[oº.]*)?\s*[:#]?\s*([A-Z0-9-]{3,})/i),reference:pick(/(?:referencia|transacci[oó]n)\s*[:#]?\s*([A-Z0-9-]{3,})/i),method:pick(/(transferencia|efectivo|tarjeta|cheque)/i),participant:pick(/(?:participante|cliente)\s*:\s*([^\r\n]+)/i)};
}

export function receiptAnalysis(text:string){
 const patterns:Record<keyof ReceiptDraft,RegExp>={date:/(?:fecha|date)\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/gi,time:/(?:hora|time)\s*[:#]?\s*([0-2]\d:[0-5]\d(?::[0-5]\d)?)/gi,amount:/\b(?:total|importe|monto)\s*[:$]?\s*(?:RD\$|DOP|USD|\$)?\s*([0-9][0-9.,]*)/gi,receipt:/(?:comprobante|recibo)\s*(?:n[oº.]*)?\s*[:#]?\s*([A-Z0-9-]{3,})/gi,reference:/(?:referencia|transacci[oó]n)\s*[:#]?\s*([A-Z0-9-]{3,})/gi,method:/(transferencia|efectivo|tarjeta|cheque)/gi,participant:/(?:participante|cliente)\s*:\s*([^\r\n]+)/gi};
 const candidates={} as Record<keyof ReceiptDraft,string[]>;const draft=originalProposals('');
 for(const key of Object.keys(patterns) as (keyof ReceiptDraft)[]){candidates[key]=[...new Set([...text.matchAll(patterns[key])].map(m=>m[1].trim()))];draft[key]=candidates[key].length===1?candidates[key][0]:'';}
 const foreignCurrency=/\b(?:USD|EUR)\b|US\$/i.test(text);if(foreignCurrency)draft.amount='';
 return {draft,candidates,foreignCurrency};
}
export function reviewedReceiptAmount(value:string):number|null{
 const s=value.trim();if(!s)return null;let normalized=s;
 if(/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s))normalized=s.replace(/,/g,'');
 else if(/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s))normalized=s.replace(/\./g,'').replace(',','.');
 else if(/^\d+(?:[.,]\d{1,2})?$/.test(s))normalized=s.replace(',','.');else return null;
 const n=Number(normalized);return Number.isFinite(n)&&n>0&&n<=1e12?n:null;
}
