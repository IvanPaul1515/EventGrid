export type ReceiptDraft={date:string;time:string;amount:string;receipt:string;method:string;reference:string;participant:string};
export function receiptProposals(text:string):ReceiptDraft{
 const pick=(pattern:RegExp)=>text.match(pattern)?.[1]?.trim()||'';
 return {date:pick(/(?:fecha|date)\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i),time:pick(/(?:hora|time)\s*[:#]?\s*([0-2]\d:[0-5]\d(?::[0-5]\d)?)/i),amount:pick(/(?:total|importe|monto)\s*[:$]?\s*(?:RD\$|DOP|USD|\$)?\s*([0-9][0-9.,]*)/i),receipt:pick(/(?:comprobante|recibo)\s*(?:n[oº.]*)?\s*[:#]?\s*([A-Z0-9-]{3,})/i),reference:pick(/(?:referencia|transacci[oó]n)\s*[:#]?\s*([A-Z0-9-]{3,})/i),method:pick(/(transferencia|efectivo|tarjeta|cheque)/i),participant:pick(/(?:participante|cliente)\s*:\s*([^\r\n]+)/i)};
}
