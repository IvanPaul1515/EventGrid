import {z} from 'zod';
const quantity=z.number().int().min(0).max(100000);
export const ItemSchema=z.object({isActive:z.boolean().default(true),name:z.string().trim().min(2).max(100),variant:z.string().trim().max(60).default(''),initialQuantity:quantity,participantQuota:quantity,staffQuota:quantity,criterion:z.enum(['REGISTRATION','OFFICIAL_REGISTRATION','OFFICIAL_PURCHASE','PURCHASE','ADMIN']),criterionNotes:z.string().trim().max(500).default('')}).superRefine((v,c)=>{if(v.criterion==='ADMIN'&&v.criterionNotes.length<5)c.addIssue({code:'custom',path:['criterionNotes'],message:'Explica el criterio administrativo.'});});
export const AssignSchema=z.object({kind:z.enum(['PARTICIPANT','STAFF']),recipientId:z.string().uuid(),reason:z.string().trim().min(5).max(500)});
export const MovementSchema=z.object({quantity:z.number().int().min(1).max(100000),reason:z.string().trim().min(5).max(500),requestKey:z.string().uuid()});
