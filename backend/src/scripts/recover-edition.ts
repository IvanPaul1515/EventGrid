// Explicit offline operation: never invoked by server startup, seeds or HTTP routes.
import {PrismaClient} from '@prisma/client';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {recoverEmptyEdition} from '../modules/events/edition-recovery.js';
import {InitializationError,initializationDiagnostic} from '../utils/initializationError.js';
const p=new PrismaClient();
try {
 const input=readFileSync(0),digest=createHash('sha256').update(input).digest('hex');
 if(process.argv[2]!==digest)throw new InitializationError('Source checksum does not match the verified snapshot.');
 const actor=await p.user.findFirst({where:{role:'ADMIN',isActive:true,scannerOnly:false,assignedEventId:null},select:{id:true}});
 if(!actor)throw new InitializationError('Private administrator is required before recovery.');
 console.log('Edition configuration recovery:',await recoverEmptyEdition(p,JSON.parse(input.toString('utf8')),actor.id,digest));
}catch(error){console.error(initializationDiagnostic(error));process.exitCode=1;}finally{await p.$disconnect();}
