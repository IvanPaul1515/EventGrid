import { runReceiptOcr } from './ocrRunner';

// Tesseract recognizes the whole page, so words stay attached to their text line.
// Preserve tabs / wide spaces as candidate columns; uncertain wrapping is kept for review.
export function ocrRows(text:string):string {
 return text.split(/\r?\n/).map(line=>line.trim().replace(/ {2,}/g,'\t')).filter(Boolean).join('\n');
}
export async function recognizeTable(file:Blob,signal:AbortSignal,onStatus:(status:string)=>void) {
 onStatus('Detectando filas');
 const text=await runReceiptOcr(file,async()=>{
  const {createWorker,PSM}=await import('tesseract.js');
  const worker=await createWorker('spa+eng',1,{logger:message=>{if(message.status==='recognizing text')onStatus(`Detectando filas · ${Math.round(message.progress*100)} %`);}});
  try {await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:PSM.AUTO});}
  catch(error){await worker.terminate();throw error;}
  return worker;
 },signal,120000);
 if(signal.aborted)throw Error('Lectura cancelada.');onStatus('Organizando participantes');return ocrRows(text);
}
