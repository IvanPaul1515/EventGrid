import { PrismaClient } from '@prisma/client';
import { ENV } from './env.js';
import {personPresentation,personWrite} from '../utils/personName.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const base =
  global.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

export const prisma=base.$extends({query:{$allModels:{$allOperations:async({args,query})=>{
 const input=args as any;
 // Include nested creates/connectOrCreate and upserts used by imports and public forms.
 for(const key of ['data','create','update'])if(input[key])input[key]=personWrite(input[key]);
 return personPresentation(await query(args));
}}}}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = base;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Error de conexión con la base de datos:', error);
    return false;
  }
}
