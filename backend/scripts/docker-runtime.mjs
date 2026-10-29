import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function validateContainerEnvironment(env) {
 if(!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL||''))throw Error('Docker requires a PostgreSQL DATABASE_URL.');
 for(const key of ['JWT_SECRET','APP_SECRET','COOKIE_SECRET']) {
  if(!env[key]||env[key].length<32||/your_|change|example|placeholder/i.test(env[key]))throw Error(`${key} requires a private random value of at least 32 characters.`);
 }
 if(env.DEMO_SEED==='true'&&(env.DEMO_QUICK_ACCESS!=='true'||env.BLOCK_REAL_EMAIL!=='true'))throw Error('Demo seed requires an isolated demo with quick access and real mail blocked.');
}
async function run(command,args) {
 await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Startup command failed (${code}).`)));});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  validateContainerEnvironment(process.env);
  if(process.argv[2]==='migrate') {
   await run('node',['../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma']);
   if(process.env.DEMO_SEED==='true')await run('node',['../node_modules/tsx/dist/cli.mjs','prisma/seed.ts']);
   else await run('node',['dist/scripts/docker-bootstrap.js']);
  } else if(process.argv[2]==='serve')await import('../dist/server.js');
  else throw Error('Choose migrate or serve.');
 } catch(error) {console.error(error instanceof Error?error.message:'Container startup failed.');process.exitCode=1;}
}
