import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
const prisma=new PrismaClient();
try {
 if(await prisma.user.count()===0) {
  const email=z.string().email().parse(process.env.INITIAL_ADMIN_EMAIL);
  const password=z.string().min(16).parse(process.env.INITIAL_ADMIN_PASSWORD);
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw Error('Initial administrator password requires upper/lowercase letters and numbers.');
  await prisma.user.create({data:{email:email.toLowerCase(),passwordHash:await bcrypt.hash(password,12),fullName:process.env.INITIAL_ADMIN_NAME||'Administrador',role:'ADMIN',isActive:true,accountStatus:'ACTIVE'}});
  console.log('Initial administrator created. No demo accounts or mail jobs were started.');
 }
} finally {await prisma.$disconnect();}
