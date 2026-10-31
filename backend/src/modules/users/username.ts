import {z} from 'zod';
export const usernameSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/,'Usa de 3 a 32 letras, números, puntos, guiones o guiones bajos.');

export const chosenUsernameSchema=usernameSchema.refine(value=>! /^(admin(?:istrador|istrator|istracion)?|root|system|sistema|superadmin|eventgrid|support|soporte)(?:$|[._-]|[0-9])/.test(value),'Ese nombre está reservado. Elige un nombre de usuario personal.');
