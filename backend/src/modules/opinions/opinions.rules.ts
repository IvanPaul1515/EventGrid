import {z} from 'zod';
export const categories=['Organización','Registro','Recepción','Charlas','Instalaciones','Alimentación','Accesibilidad','Comunicación','Otro'] as const;
export const questionSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),label:z.string().trim().min(2).max(200),type:z.enum(['RATING','TEXT','YES_NO']),enabled:z.boolean(),kind:z.enum(['EVENT','ABSENCE'])}).strict();
export const configSchema=z.object({enabled:z.boolean(),buzonEnabled:z.boolean().optional(),questions:z.array(questionSchema).min(1).max(30)}).strict().refine(value=>new Set(value.questions.map(q=>q.id)).size===value.questions.length,'Identificadores de pregunta repetidos');
export const defaultQuestions:OpinionQuestion[]=[
 ['general','Experiencia general','RATING'],['organization','Organización','RATING'],['registration','¿Cómo fue el proceso de registro?','RATING'],['reception','¿Cómo fue la recepción?','RATING'],
 ['liked','¿Qué te gustó más?','TEXT'],['improvements','¿Qué mejorarías?','TEXT'],['recommend','¿Recomendarías el evento?','YES_NO'],['return','¿Asistirías nuevamente?','YES_NO'],['suggestions','Sugerencias adicionales','TEXT'],
].map(([id,label,type])=>({id,label,type:type as 'RATING'|'TEXT'|'YES_NO',enabled:true,kind:'EVENT' as 'EVENT'|'ABSENCE'})).concat([{id:'absence_reason',label:'Si no asististe, ¿qué motivo deseas compartir voluntariamente?',type:'TEXT',enabled:true,kind:'ABSENCE'}]);
export const responseSchema=z.object({id:z.string().uuid(),kind:z.enum(['EVENT','ABSENCE']),answers:z.record(z.union([z.number().int().min(1).max(5),z.string().trim().max(2000),z.boolean()])).refine(value=>Object.keys(value).length<=30,'Demasiadas respuestas'),website:z.string().max(0).default('')}).strict();
export const suggestionSchema=z.object({id:z.string().uuid(),category:z.enum(categories),text:z.string().trim().min(5).max(3000),website:z.string().max(0).default('')}).strict();
export type OpinionQuestion=z.infer<typeof questionSchema>;
export function snapshotAnswers(questions:OpinionQuestion[],kind:string,answers:Record<string,unknown>) {
 const selected=questions.filter(q=>q.enabled&&q.kind===kind),byId=new Map(selected.map(q=>[q.id,q]));
 const result=Object.entries(answers).filter(([,value])=>value!=='').map(([id,value])=>{
  const question=byId.get(id);
  if(!question||question.type==='RATING'&&(!Number.isInteger(value)||Number(value)<1||Number(value)>5)||question.type==='TEXT'&&typeof value!=='string'||question.type==='YES_NO'&&typeof value!=='boolean')throw new Error('Revisa las respuestas y las preguntas disponibles.');
  return {id,label:question.label,type:question.type,value};
 });
 if(!result.length)throw new Error('Comparte al menos una respuesta.');
 return result;
}
export function summarizeOpinions(responses:{kind:string;answers:string;createdAt?:Date|string}[],suggestions:{category:string}[]) {
 const questions=new Map<string,{id:string;label:string;count:number;total:number;distribution:number[]}>();
 for(const response of responses.filter(r=>r.kind==='EVENT'))for(const answer of JSON.parse(response.answers))if(answer.type==='RATING'&&Number.isInteger(answer.value)&&answer.value>=1&&answer.value<=5){
  // Label is part of the grouping: edited questions must not silently combine different wording.
  const key=answer.id+'\n'+answer.label,row=questions.get(key)||{id:answer.id,label:answer.label,count:0,total:0,distribution:[0,0,0,0,0]};
  row.count++;row.total+=answer.value;row.distribution[answer.value-1]++;questions.set(key,row);
 }
 const ratings=[...questions.values()].map(q=>({...q,mean:q.total/q.count})).sort((a,b)=>b.mean-a.mean);
 const days=new Map<string,number>();
 for(const response of responses){if(response.kind!=='EVENT'||!response.createdAt)continue;const date=new Date(response.createdAt);if(!Number.isFinite(date.getTime()))continue;const day=date.toISOString().slice(0,10);days.set(day,(days.get(day)||0)+1);}
 const trends=[...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,count])=>({day,count}));
 return {responses:responses.filter(r=>r.kind==='EVENT').length,absenceResponses:responses.filter(r=>r.kind==='ABSENCE').length,ratings,trends,
  suggestions:suggestions.length,categories:categories.map(category=>({category,count:suggestions.filter(s=>s.category===category).length})),
  warning:'Muestra voluntaria de respuestas, no de personas únicas. Los motivos de ausencia son declaraciones anónimas; no se extrapolan al total de ausentes.'};
}
