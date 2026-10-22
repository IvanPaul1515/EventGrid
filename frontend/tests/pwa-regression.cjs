// Run after a frontend build, against Vite preview. Temporarily versions dist/sw.js and restores it.
const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
const dist=require('node:path').resolve(__dirname,'../dist');
const workerPath=dist+'/sw.js';
const base=process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:4178';
const original=fs.readFileSync(workerPath,'utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:'test',fullName:'Test Operator',email:'test@example.invalid',role:'ADMIN'};
 await page.addInitScript(user=>{localStorage.setItem('barcamp_token','test-only');localStorage.setItem('barcamp_user',JSON.stringify(user));},user);
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/stream')) return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
  let data=[];
  if(path.endsWith('/auth/me'))data=user;
  if(path.endsWith('/events'))data=[{id:'test',name:'BarCamp RD 2026',year:2026,status:'ACTIVE',settings:{},venue:'Santiago'}];
  await route.fulfill({json:{success:true,data,pagination:{total:0,totalPages:1,page:1,limit:10}}});
 });
 await page.goto(base+'/participants');
 await page.getByRole('button',{name:'Nuevo Participante',exact:true}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const state=await page.evaluate(async()=>{
  const keys=await caches.keys();const urls=[];
  for(const key of keys)for(const req of await(await caches.open(key)).keys())urls.push(new URL(req.url).pathname);
  return {keys,urls};
 });
 assert(state.keys.some(k=>/^eventgrid-[a-f0-9]{16}$/.test(k)));
 assert(state.urls.length>20);assert(state.urls.every(p=>!p.startsWith('/api')&&!p.startsWith('/uploads')));
 assert(state.urls.some(p=>p.includes('DashboardPage')));
 const manifest=await page.evaluate(async()=>await(await fetch('/manifest.webmanifest')).json());
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons.filter(i=>i.type==='image/png')) {
  const file=dist+icon.src;
  const png=fs.readFileSync(file);assert.equal(png.readUInt32BE(16)+'x'+png.readUInt32BE(20),icon.sizes);
 }
 fs.writeFileSync(workerPath,original.replace(/eventgrid-([a-f0-9]{16})/,'eventgrid-test-$1'));
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
 await page.getByRole('button',{name:'Actualizar ahora',exact:true}).waitFor();
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Actualizar ahora',exact:true}).click()]);
 assert(await page.evaluate(async()=>(await caches.keys()).some(k=>k.startsWith('eventgrid-test-'))));
 await context.unroute('**/api/**');await context.setOffline(true);
 await page.goto(base+'/login');
 await page.getByRole('button',{name:'Ingresar a la Plataforma',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pwa:'PASS',cachedPublicResources:state.urls.length,checks:['manifest and icon dimensions','complete lazy modules precached','API and uploads absent from caches','update waits for worker activation then reloads','offline shell and login render'],errors},null,2));
} finally {fs.writeFileSync(workerPath,original);await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
