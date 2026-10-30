import {prisma} from '../../config/db.js';
import {defaultQuestions} from './opinions.rules.js';
export function ensureOpinionSurvey(eventId:string,client:any=prisma){return client.opinionSurvey.upsert({where:{eventId},create:{eventId,enabled:false,buzonEnabled:true,questions:JSON.stringify(defaultQuestions)},update:{}});}
