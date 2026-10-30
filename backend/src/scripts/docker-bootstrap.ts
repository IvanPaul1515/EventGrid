import {ensureOpinionSurvey} from '../modules/opinions/opinions.setup.js';
import {PublicOriginService} from '../modules/public-origin/public-origin.service.js';
import { PrismaClient } from '@prisma/client';
import {initializePrivateAdmin} from '../modules/users/initial-admin.js';
import {initializePrivateSmtp} from '../modules/communications/private-smtp.js';
import {encryptSecret} from '../utils/crypto.js';
import {initializationDiagnostic} from '../utils/initializationError.js';
const prisma=new PrismaClient();
try {
 const admin=await initializePrivateAdmin(prisma,process.env);
 const smtp=await initializePrivateSmtp(prisma,process.env,encryptSecret);
 console.log('Private administrative bootstrap:',admin.status);
 console.log('Private SMTP bootstrap:',smtp.status,smtp.missing.length?'Missing variable names: '+smtp.missing.join(', '):'');
 await PublicOriginService.settings(prisma);
 for(const event of await prisma.event.findMany({select:{id:true}}))await ensureOpinionSurvey(event.id,prisma);
 const editions=await prisma.event.count();
 console.log(editions?'Edition data preserved.':'Configuration incomplete: no editions exist. Recover a verified edition backup using the documented offline procedure; no fictitious event or inventory was created.');
 console.log('Existing credentials were not reset. No demo accounts or mail jobs were started.');
} catch(error){console.error(initializationDiagnostic(error));process.exitCode=1;}
finally {await prisma.$disconnect();}
