// Optional offline QA, never connects to an application database.
const { PGlite } = await import(process.env.EVENTGRID_PGLITE_MODULE || '@electric-sql/pglite');
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.join(repo, 'backend/prisma/migrations');
const db=new PGlite();
for(const name of fs.readdirSync(root).sort()) {const path=root+'/'+name+'/migration.sql';if(!fs.existsSync(path))continue;const bytes=fs.readFileSync(path);const sql=bytes[0]===255&&bytes[1]===254?bytes.toString('utf16le').replace(/^\uFEFF/,''):bytes.toString('utf8');try{await db.exec(sql);console.log('PASS '+name);}catch(e){console.log('FAIL '+name+' '+e.message);process.exitCode=1;await db.close();process.exit();}}
const expected=new PGlite();await expected.exec(execFileSync(process.execPath, [path.join(repo,'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(repo,'backend/prisma/schema.prisma'), '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://synthetic:unused@127.0.0.1:1/unreachable' } }));
const inventory=async d=>{
 const result={};for(const [key,sql] of Object.entries({columns:`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`, foreignKeys:`select conrelid::regclass::text as tablename,conname,pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and connamespace='public'::regnamespace order by conname`, constraints:`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`,enums:`select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid order by t.typname,e.enumsortorder`}))result[key]=(await d.query(sql)).rows;return result;
};
const actual=await inventory(db),want=await inventory(expected);
// Column order can differ after ALTER; compare by stable table/column name.
const canonical=x=>JSON.stringify(x.map(r=>JSON.stringify(r)).sort());
for(const key of Object.keys(want)){const ok=canonical(actual[key])===canonical(want[key]);console.log(key+': '+ok);if(!ok){const a=new Set(actual[key].map(r=>JSON.stringify(r)));const b=new Set(want[key].map(r=>JSON.stringify(r)));console.log('missing',want[key].filter(r=>!a.has(JSON.stringify(r))));console.log('extra',actual[key].filter(r=>!b.has(JSON.stringify(r))));process.exitCode=1;}}
await db.close();await expected.close();
