import type {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
export async function initializePrivateAdmin(client:Pick<PrismaClient,'$transaction'>,env:Record<string,string|undefined>){
 return client.$transaction(async tx=>{
  const existing=await tx.user.findMany({where:{role:'ADMIN',scannerOnly:false,isActive:true,accountStatus:{not:'PENDING'},assignedEventId:null},select:{id:true,email:true}});
  const email=env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if(existing.length)return {status:existing.some(u=>u.email===email)?'PRESENT':'EXISTING_ADMIN'};
  if(!email||!z.string().email().safeParse(email).success)throw Error('INITIAL_ADMIN_EMAIL is required to initialize an empty private installation.');
  const identities=await tx.user.findMany({select:{id:true,email:true}});
  if(identities.some(user=>user.email.trim().toLowerCase()===email))throw Error('The configured administrative identity already exists and requires manual review; no account was modified.');
  const password=env.INITIAL_ADMIN_PASSWORD;
  if(!password||password.length<16||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw Error('INITIAL_ADMIN_PASSWORD requires a private value of at least 16 characters with upper/lowercase letters and numbers.');
  const user=await tx.user.create({data:{email,passwordHash:await bcrypt.hash(password,12),fullName:env.INITIAL_ADMIN_NAME?.trim()||'Administrador inicial de plataforma',role:'ADMIN',scannerOnly:false,isActive:true,accountStatus:'ACTIVE',assignedEventId:null},select:{id:true}});
  await tx.auditLog.create({data:{userId:user.id,entity:'USER',entityId:user.id,action:'USER_CREATE',changes:JSON.stringify({operation:'PRIVATE_INITIAL_ADMIN_BOOTSTRAP'})}});
  return {status:'CREATED'};
 },{isolationLevel:'Serializable'});
}
