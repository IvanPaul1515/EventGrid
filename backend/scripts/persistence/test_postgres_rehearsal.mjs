// Optional local-only test. PGlite is installed outside the application.
const { PGlite } = await import(process.env.EVENTGRID_PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=process.env.EVENTGRID_REHEARSAL_DIR;
if(!root)throw Error('Set EVENTGRID_REHEARSAL_DIR to an isolated QA directory');
const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/,'$1'),'../../..');
const {rehearse}=await import('./postgres_rehearsal.mjs');
const location=JSON.parse(fs.readFileSync(root+'/fixture-location.json','utf8')),file=path.join(location.dir,'snapshot.db'),manifest=file+'.manifest.json',sql=fs.readFileSync(root+'/full-schema.sql','utf8');
const db=await PGlite.create();const chain=await PGlite.create();const checks=[];
try{
await db.exec(sql);
const result=await rehearse(db,manifest,file);const expectedTables=Object.keys(JSON.parse(fs.readFileSync(manifest,'utf8')).tables).length;assert.equal(result.tables,expectedTables);checks.push(`all ${result.tables} SQLite tables copied and every source field compared`);
assert.equal((await db.query('SELECT current FROM registration_sequences')).rows[0].current,120);
assert.equal((await db.query('SELECT "sessionVersion" FROM users')).rows[0].sessionVersion,7);
assert.equal((await db.query('SELECT "isEnabled" FROM email_configs')).rows[0].isEnabled,false);
assert.equal((await db.query('SELECT "defaultTicketTypeId" FROM events')).rows[0].defaultTicketTypeId,(await db.query('SELECT id FROM ticket_types')).rows[0].id);
checks.push('exact session version, credential hash/ciphertext, disabled SMTP, fare, nullable cycle and reserved counter preserved');
const repeated=await rehearse(db,manifest,file);assert.equal(repeated.alreadyApplied,true);checks.push('same snapshot is idempotent without duplicate participants or payments');
const sequence=(await db.query('UPDATE registration_sequences SET current=current+1 RETURNING current')).rows[0].current;assert.equal(sequence,121);checks.push('counter advances to 121, never to max-visible-registration + 1');
await assert.rejects(()=>rehearse(db,manifest,file),/Field mismatch/);checks.push('modified target is detected on repeat, never silently overwritten');
const empty=await PGlite.create();try{await empty.exec(sql);await assert.rejects(()=>rehearse(empty,root+'/partial-api.json',file),/partial API/);assert.equal(Number((await empty.query('SELECT count(*) AS n FROM users')).rows[0].n),0);checks.push('partial API export rejected before any insert');}finally{await empty.close();}
for(const dir of fs.readdirSync(repo+'/backend/prisma/migrations').filter(x=>fs.existsSync(repo+'/backend/prisma/migrations/'+x+'/migration.sql')).sort()){const bytes=fs.readFileSync(repo+'/backend/prisma/migrations/'+dir+'/migration.sql');await chain.exec(bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8'));};
const tables=async pg=>(await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(x=>x.tablename);
const fullTables=await tables(db),chainTables=await tables(chain),missing=fullTables.filter(t=>!chainTables.includes(t)&&t!=='_eventgrid_rehearsal_receipt');
const cols=async pg=>(await pg.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public'")).rows;
const fullCols=await cols(db),oldCols=await cols(chain),missingColumns=fullCols.filter(c=>chainTables.includes(c.table_name)&&!oldCols.some(x=>x.table_name===c.table_name&&x.column_name===c.column_name)).map(c=>c.table_name+'.'+c.column_name);
assert.deepEqual(missing,[]);assert.deepEqual(missingColumns,[]);checks.push('additive migration history has all current tables and columns');
const report={status:'PASS_LOCAL_REHEARSAL',engine:(await db.query('SELECT version() AS v')).rows[0].v,engineKind:'embedded PostgreSQL WASM (PGlite), not Render PostgreSQL 16 or Prisma network runtime',checks,sourceTables:result.tables,sourceRows:result.rows,migrationChainMissingTables:missing,migrationChainMissingColumns:missingColumns,noProductionAccess:true};fs.writeFileSync(root+'/rehearsal-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.close();await chain.close();}

process.on('unhandledRejection',error=>{console.error('Rehearsal failed:',error.message);process.exitCode=1;});
