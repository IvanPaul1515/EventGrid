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
 console.log('Existing credentials were not reset. No demo accounts or mail jobs were started.');
} catch(error){console.error(initializationDiagnostic(error));process.exitCode=1;}
finally {await prisma.$disconnect();}
