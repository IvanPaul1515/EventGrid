const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../../..'),req=require('node:module').createRequire(repo+'/package.json'),{PrismaClient}=req('@prisma/client'),bcrypt=req('bcryptjs');
const output=process.env.EVENTGRID_REHEARSAL_DIR;if(!output)throw Error('Set an isolated output directory');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eventgrid-migration-')),file=path.join(dir,'source.db'),url='file:'+file.replaceAll('\\','/');fs.writeFileSync(file,'');
execFileSync(process.execPath,[repo+'/node_modules/prisma/build/index.js','db','push','--schema',repo+'/backend/prisma/schema.sqlite.prisma','--skip-generate'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
const db=new PrismaClient({datasourceUrl:url});try{
const u=await db.user.create({data:{email:'synthetic@example.invalid',fullName:'Synthetic Fixture',role:'ADMIN',sessionVersion:7,passwordHash:await bcrypt.hash('Synthetic-fixture-secret-only',4)}});
const e=await db.event.create({data:{slug:'migration-fixture',name:'Migration Fixture',year:2026,startDate:new Date(),endDate:new Date()}});
await db.eventSettings.create({data:{eventId:e.id,tshirtSizes:'["M","L"]',customCss:'{"brand":{"primary":"#112233"}}'}});
const t=await db.ticketType.create({data:{eventId:e.id,name:'Official',price:1750}});await db.event.update({where:{id:e.id},data:{defaultTicketTypeId:t.id}});
const pm=await db.paymentMethod.create({data:{eventId:e.id,name:'Efectivo'}});
for(let i=1;i<=2;i++){const p=await db.participant.create({data:{firstName:'Fixture',lastName:'Person '+i,fullName:'Fixture Person '+i,email:'fixture'+i+'@example.invalid'}});
const reg=await db.registration.create({data:{eventId:e.id,participantId:p.id,registrationNumber:'BC26-'+String(i).padStart(4,'0'),ticketTypeId:t.id,ticketPrice:1750,amountPaid:i===1?875:1750,totalAmount:i===1?875:1750,balanceDue:i===1?875:0,paymentMethodId:pm.id,paymentStatus:i===1?'PARTIAL':'PAID',status:'CONFIRMED',attended:i===2,attendedAt:i===2?new Date():null,attendedByUserId:i===2?u.id:null,externalPlatform:'Fixture',externalReference:'EXT-'+i}});
await db.payment.create({data:{registrationId:reg.id,amount:i===1?875:1750,paymentMethodId:pm.id,receivedByUserId:u.id}});
}
await db.registrationSequence.create({data:{eventId:e.id,current:120}});
await db.emailConfig.create({data:{eventId:e.id,host:'smtp.example.invalid',port:587,user:'synthetic-only',password:'opaque-ciphertext-fixture',fromEmail:'noreply@example.invalid',fromName:'Fixture',isEnabled:false}});
await db.auditLog.create({data:{userId:u.id,action:'CREATE',entity:'USER',entityId:u.id,changes:'{"safe":true}'}});
await db.tshirtInventory.create({data:{eventId:e.id,size:'M',initialQuantity:10,deliveredQuantity:1}});
}finally{await db.$disconnect();}
fs.writeFileSync(path.join(output,'fixture-location.json'),JSON.stringify({file,dir}));
execFileSync('python',['-X','utf8',repo+'/backend/scripts/persistence/sqlite_snapshot.py',file,path.join(dir,'snapshot.db')],{stdio:'pipe'});
const sql=execFileSync(process.execPath,[repo+'/node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel',repo+'/backend/prisma/schema.prisma','--script'],{env:{...process.env,DATABASE_URL:'postgresql://synthetic:unused@127.0.0.1:1/unreachable'},stdio:['ignore','pipe','pipe']});fs.writeFileSync(path.join(output,'full-schema.sql'),sql);console.log(JSON.stringify({fixture:true,privateData:false,tables:'all current schema tables'}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
