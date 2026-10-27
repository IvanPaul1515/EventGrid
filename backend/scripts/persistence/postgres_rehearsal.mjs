// Offline rehearsal core; no HTTP endpoint, startup hook, URL or Render access.
// The caller supplies an isolated PostgreSQL-compatible query client.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const q = name => '"' + name.replaceAll('"','""') + '"';
const receipt = '_eventgrid_rehearsal_receipt';
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
function utcDate(value) {
 if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) value=value.replace(' ','T')+'Z';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid timestamp');return date;
}
function valueFor(value,column) {
  if(value===null)return null;
  if(column.data_type==='boolean') { if(![0,1,true,false].includes(value))throw Error('Invalid boolean'); return Boolean(value); }
  if(column.data_type.startsWith('timestamp')) return utcDate(value).toISOString();
  if(['json','jsonb'].includes(column.data_type))return JSON.stringify(typeof value==='string'?JSON.parse(value):value);
  if(column.data_type==='numeric') {if(!Number.isFinite(Number(value)))throw Error('Invalid numeric');const scale=Number(column.numeric_scale);if(Math.abs(Number(value)*10**scale-Math.round(Number(value)*10**scale))>0.000001)throw Error('Numeric precision would be lost');return String(value);}
  if(value&&typeof value==='object')throw Error('Unsupported binary/object conversion');
  return value;
}
function comparable(value,column) {
 if(value===null)return null;
 if(['json','jsonb'].includes(column.data_type))return canonical(typeof value==='string'?JSON.parse(value):value);
 if(column.data_type==='numeric')return Number(value);
 if(column.data_type.startsWith('timestamp'))return utcDate(value).toISOString();
 return canonical(value);
}
async function performRehearsal(db, manifestPath, sqliteFile) {
 const m=JSON.parse(readFileSync(manifestPath,'utf8'));
 if(m.kind!=='eventgrid-sqlite-online-backup-v1'||m.completeSqliteFile!==true)throw Error('A partial API snapshot is not a full database backup');
 const manifestDigest=createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
 if(readFileSync(manifestPath+'.sha256','utf8').trim()!==manifestDigest)throw Error('Manifest checksum mismatch');
 const hash=createHash('sha256').update(readFileSync(sqliteFile)).digest('hex');
 if(hash!==m.sha256)throw Error('SQLite checksum mismatch');
 if((m.catalog||[]).some(item=>['view','trigger'].includes(item.type)))throw Error('Views or triggers require an explicit PostgreSQL translation');
 const targetIndexes=new Set((await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(i=>i.indexname));
 if((m.catalog||[]).some(item=>item.type==='index'&&item.sql&&!targetIndexes.has(item.name)))throw Error('A source index needs explicit PostgreSQL review');
 const participants=new Map((m.tables.participants?.rows||[]).map(p=>[p.id,p]));
 const duplicateKeys=new Set();
 for(const row of m.tables.registrations?.rows||[]) {
  const p=participants.get(row.participantId);if(!p)throw Error('Missing participant relation');
  for(const key of [p.email?'email:'+p.email.trim().toLowerCase():null,p.documentId?'document:'+p.documentId.trim():null,row.externalReference?'external:'+(row.externalPlatform||'')+':'+row.externalReference:null].filter(Boolean)) {
   const scoped=row.eventId+':'+key;if(duplicateKeys.has(scoped))throw Error('Business duplicate requires explicit review');duplicateKeys.add(scoped);
  }
 }
 const columns=(await db.query("SELECT table_name,column_name,data_type,is_nullable,numeric_scale FROM information_schema.columns WHERE table_schema='public'")).rows;
 const byTable=new Map();for(const c of columns){if(!byTable.has(c.table_name))byTable.set(c.table_name,new Map());byTable.get(c.table_name).set(c.column_name,c);}
 const tables=Object.keys(m.tables).filter(t=>t!=='_prisma_migrations');
 for(const table of tables){if(!byTable.has(table))throw Error('Missing target table: '+table);for(const c of m.tables[table].columns)if(!byTable.get(table).has(c.name))throw Error('Missing target column: '+table+'.'+c.name);}
 const keys=(await db.query("SELECT tc.table_name,k.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k ON tc.constraint_name=k.constraint_name AND tc.table_schema=k.table_schema WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'")).rows;
 const fk=(await db.query("SELECT tc.table_name,k.column_name,c.table_name AS ref_table FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k ON tc.constraint_name=k.constraint_name AND tc.table_schema=k.table_schema JOIN information_schema.constraint_column_usage c ON c.constraint_name=tc.constraint_name AND c.constraint_schema=tc.table_schema WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'")).rows;
 const deps=new Map(tables.map(t=>[t,new Set(fk.filter(f=>f.table_name===t&&byTable.get(t).get(f.column_name).is_nullable==='NO'&&f.ref_table!==t&&tables.includes(f.ref_table)).map(f=>f.ref_table))]));
 const ordered=[];while(ordered.length<tables.length){const next=tables.find(t=>!ordered.includes(t)&&[...deps.get(t)].every(d=>ordered.includes(d)));if(!next)throw Error('Required foreign-key cycle; explicit migration needed');ordered.push(next);}
 async function verify(){
  for(const table of tables){const rows=m.tables[table].rows;const count=Number((await db.query('SELECT count(*) AS n FROM '+q(table))).rows[0].n);if(count!==rows.length)throw Error('Row count mismatch: '+table);
   const pk=keys.filter(k=>k.table_name===table).map(k=>k.column_name);if(rows.length&&!pk.length)throw Error('No primary key for safe comparison');
   for(const row of rows){const projection=[...byTable.get(table).values()].map(c=>c.data_type==='timestamp without time zone' ? `to_char(${q(c.column_name)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z' AS ${q(c.column_name)}` : q(c.column_name)).join(',');const actual=(await db.query('SELECT '+projection+' FROM '+q(table)+' WHERE '+pk.map((k,i)=>q(k)+'=$'+(i+1)).join(' AND '),pk.map(k=>row[k]))).rows[0];if(!actual)throw Error('Missing restored identity');
    for(const[k,v]of Object.entries(row)){const col=byTable.get(table).get(k),expected=valueFor(v,col);if(JSON.stringify(comparable(expected,col))!==JSON.stringify(comparable(actual[k],col)))throw Error('Field mismatch: '+table+'.'+k);}
   }
  }
 }
 if(byTable.has(receipt)) {const previous=(await db.query('SELECT digest FROM '+q(receipt))).rows;if(previous.length===1&&previous[0].digest===hash){await verify();return {alreadyApplied:true,tables:tables.length};}throw Error('Different migration receipt');}
 for(const table of byTable.keys())if(!['_prisma_migrations',receipt].includes(table)&&Number((await db.query('SELECT count(*) AS n FROM '+q(table))).rows[0].n)!==0)throw Error('Target is not empty; refusing overwrite');
 await db.exec('BEGIN');
 try {
  const postponed=[];
  for(const table of ordered)for(const row of m.tables[table].rows){const names=Object.keys(row),pk=keys.filter(k=>k.table_name===table).map(k=>k.column_name);const values=names.map(k=>{
   const col=byTable.get(table).get(k),value=valueFor(row[k],col);
   if(value!==null&&col.is_nullable==='YES'&&fk.some(f=>f.table_name===table&&f.column_name===k)){postponed.push({table,pk,row,column:k,value});return null;}return value;
  });await db.query('INSERT INTO '+q(table)+' ('+names.map(q).join(',')+') VALUES ('+names.map((_,i)=>'$'+(i+1)).join(',')+')',values);}
  for(const p of postponed)await db.query('UPDATE '+q(p.table)+' SET '+q(p.column)+'=$1 WHERE '+p.pk.map((k,i)=>q(k)+'=$'+(i+2)).join(' AND '),[p.value,...p.pk.map(k=>p.row[k])]);
  await verify();
  await db.exec('CREATE TABLE '+q(receipt)+' (digest TEXT PRIMARY KEY)');await db.query('INSERT INTO '+q(receipt)+' VALUES ($1)',[hash]);
  await db.exec('COMMIT');return {alreadyApplied:false,tables:tables.length,rows:tables.reduce((n,t)=>n+m.tables[t].rows.length,0)};
 }catch(error){await db.exec('ROLLBACK');throw error;}
}

export async function rehearse(db, manifestPath, sqliteFile) {
 try { return await performRehearsal(db, manifestPath, sqliteFile); }
 catch (error) {
  // Drivers may attach SQL parameters containing hashes or personal information.
  // Expose only the SQLSTATE, never the driver object or query parameters.
  if (typeof error?.code === 'string') throw new Error('PostgreSQL rejected the rehearsal (SQLSTATE ' + error.code + ')');
  throw error;
 }
}
