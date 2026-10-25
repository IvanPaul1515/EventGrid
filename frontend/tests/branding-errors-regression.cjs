const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178';
const user={id:'qa',fullName:'QA Only',email:'qa@example.invalid',role:'VIEWER'};
const event={id:'event',name:'Encuentro de Tecnología 2031',year:2031,isDefault:true,status:'ACTIVE',settings:{primaryColor:'#34d399',secondaryColor:'#336699',backgroundColor:'#101820'},venue:'QA'};
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});const checks=[];
async function setup({stored=false,role='VIEWER',me='ok',theme='dark'}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(12000);
 const state={me,events:'ok',login:'ok',writes:0,reads:0};
 await page.addInitScript(({stored,user,theme})=>{localStorage.setItem('barcamp_theme_mode',theme);if(stored){localStorage.setItem('barcamp_token','mock-token');localStorage.setItem('barcamp_user',JSON.stringify(user));}},{stored,user:{...user,role},theme});
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=[];
  const fail=async status=>route.fulfill({status,json:{message:'PRIVATE /server/secret/password stack'}});
  if(req.method()==='POST')state.writes++;
  if(path.endsWith('/stream'))return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
  if(path.endsWith('/demo-access'))return route.fulfill({json:{enabled:true}});
  if(path.endsWith('/auth/me')){state.reads++;if(state.me==='network')return route.abort('connectionfailed');if(state.me==='hang')return; if(state.me!=='ok')return fail(Number(state.me)); data={...user,role};}
  else if(path.endsWith('/auth/login')||path.endsWith('/auth/demo-login')){await new Promise(r=>setTimeout(r,100));if(state.login!=='ok')return fail(Number(state.login));data={token:'mock-token',user:{...user,role}};}
  else if(path.endsWith('/events')){if(state.events!=='ok')return fail(Number(state.events));data=[event];}
  else if(path.endsWith('/stats')||path.endsWith('/financial-summary'))data=null;
  else if(path.endsWith('/counters'))data={totalRegistrations:0,attendedCount:0,pendingCount:0};
  else if(path.endsWith('/health'))data={status:'healthy'};
  else if(path.endsWith('/inventory'))data={items:[],stats:{}};
  await route.fulfill({json:{data,pagination:{total:0,page:1,totalPages:1},counters:{}}});
 });return {context,page,state};
}
try{
 {
  const {context,page,state}=await setup();await page.goto(base+'/login');
  await page.getByText('Gestión de Eventos y Accesos',{exact:true}).waitFor();
  await page.getByText(/© \d{4} EventGrid. Todos los derechos reservados./).waitFor();await page.getByText('Desarrollado por Iván Marcelino',{exact:true}).waitFor();
  assert.equal(await page.getByText(/Sistema Oficial|Plataforma Oficial/).count(),0);
  if(process.env.EVENTGRID_QA_IMAGES)await page.screenshot({path:process.env.EVENTGRID_QA_IMAGES+'/branding-login-mobile.png',fullPage:true});
  for(const width of [320,390,412,844,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);for(const input of await page.locator('input').all())if(width<1024)assert(parseFloat(await input.evaluate(e=>getComputedStyle(e).fontSize))>=16);}
  for(const title of ['Administrador','Operador','Consulta'])await page.getByTitle('Ingresar como '+title,{exact:true}).waitFor();
  if(process.env.EVENTGRID_QA_IMAGES)await page.screenshot({path:process.env.EVENTGRID_QA_IMAGES+'/branding-login-desktop.png',fullPage:true});
  state.login='503';await page.getByLabel('Correo Electrónico',{exact:true}).fill('qa@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill('mock-password');
  await page.getByRole('button',{name:'Ingresar a la Plataforma',exact:true}).dblclick();await page.getByRole('alert').filter({hasText:'No podemos conectarnos'}).waitFor();assert.equal(state.writes,1);assert.equal(await page.getByLabel('Correo Electrónico',{exact:true}).inputValue(),'qa@example.invalid');assert.equal(await page.getByLabel('Contraseña',{exact:true}).inputValue(),'mock-password');assert.equal(await page.getByText(/PRIVATE|server\/secret/).count(),0);
  await page.goto(base+'/no-such-route');await page.getByRole('heading',{name:'Página no encontrada'}).waitFor();assert.equal(await page.getByRole('link',{name:'Ir al inicio'}).getAttribute('href'),'/login');
  console.log('Scenario passed'); checks.push('Login copy, footer/credit, three demo buttons, widths 320–1440, mobile font, 503 form preservation, double-submit guard, public 404');await context.close();
 }
 {
  const {context,page,state}=await setup({stored:true,me:'503'});await page.goto(base+'/participants');await page.getByRole('heading',{name:'Servicio temporalmente no disponible'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('barcamp_token')),'mock-token');state.me='ok';await page.getByRole('button',{name:'Reintentar conexión',exact:true}).click();await page.getByRole('heading',{name:/Directorio de Participantes/}).waitFor();
  await page.goto(base+'/users');await page.getByRole('heading',{name:'Acceso restringido'}).waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(await page.getByRole('link',{name:'Volver al panel'}).getAttribute('href'),'/');assert.equal(await page.getByText(/PRIVATE|server\/secret/).count(),0);
  if(process.env.EVENTGRID_QA_IMAGES)await page.screenshot({path:process.env.EVENTGRID_QA_IMAGES+'/branding-error-theme.png',fullPage:true});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground').trim()),'0 0% 0%');
  await page.getByRole('link',{name:'Volver al panel'}).click();await page.getByRole('button',{name:'Control de Asistencia',exact:true}).waitFor();
  await context.setOffline(true);await page.getByRole('alert').filter({hasText:'Sin conexión'}).waitFor();assert.equal(state.writes,0);
  console.log('Scenario passed'); checks.push('Bootstrap 503 preserves credentials; manual retry; 403 denies content; custom edition palette and contrasting text; offline blocks entry');await context.close();
 }
 {
  const {context,page}=await setup({stored:true,me:'401'});await page.goto(base+'/participants');await page.getByRole('heading',{name:'Tu sesión ha finalizado'}).waitFor();assert.equal(await page.getByText('401',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('barcamp_token')),null);await page.getByRole('link',{name:'Volver a iniciar sesión'}).click();await page.getByLabel('Correo Electrónico',{exact:true}).waitFor();assert(page.url().endsWith('/login'));
  console.log('Scenario passed'); checks.push('Expired session 401, safe login action, no redirect loop');await context.close();
 }
 {
  const {context,page,state}=await setup({stored:true,me:'network'});await page.goto(base+'/participants');await page.getByRole('heading',{name:'No se pudo establecer la conexión'}).waitFor();assert.equal(state.reads,1);state.me='ok';state.events='503';await page.getByRole('button',{name:'Reintentar conexión',exact:true}).click();await page.getByRole('heading',{name:'Servicio temporalmente no disponible'}).waitFor();state.events='ok';await page.getByRole('button',{name:'Reintentar conexión',exact:true}).click();await page.getByRole('heading',{name:/Directorio de Participantes/}).waitFor();
  console.log('Scenario passed'); checks.push('Network distinguished from HTTP 503; edition failure recovery; no automatic request loop');await context.close();
 }
 {
  const {context,page}=await setup({stored:true,role:'ADMIN',theme:'light'});
  await page.route('**/src/pages/StaffPage.tsx*',route=>route.fulfill({contentType:'application/javascript',body:'export function StaffPage(){ throw new Error("PRIVATE /server/secret/password"); }'}));
  await page.goto(base+'/staff');await page.getByRole('heading',{name:'Ocurrió un problema'}).waitFor();assert.equal(await page.getByText(/PRIVATE|server\/secret/).count(),0);await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await page.getByRole('link',{name:'Volver al panel'}).click();await page.getByRole('button',{name:'Control de Asistencia',exact:true}).waitFor();
  console.log('Scenario passed'); checks.push('React render fault recovers without exposing internals; light theme and safe dashboard');await context.close();
 }
 {
  const {context,page}=await setup({stored:true,me:'hang'});await page.clock.install();await page.goto(base+'/participants');await page.getByText('Verificando sesión...',{exact:true}).waitFor();assert.equal(await page.getByText('EVENTGRID',{exact:true}).count(),1);assert.equal(await page.getByText(/BarCamp|2031/).count(),0);await page.clock.fastForward(36000);await page.getByRole('button',{name:'Reintentar conexión',exact:true}).waitFor();assert.equal(await page.getByText('Verificando sesión...',{exact:true}).count(),0);
  console.log('Scenario passed'); checks.push('Initial loading has independent branding, no invented event/year, finite deadline and manual recovery');await context.close();
 }
 for (const [status,title] of [['500','Ocurrió un problema'],['502','Servicio temporalmente no disponible']]) {
  const {context,page,state}=await setup({stored:true,me:status});await page.goto(base+'/participants');await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.getByText(/PRIVATE|server\/secret/).count(),0);assert.equal(state.reads,1);await context.close();
 }
 checks.push('HTTP 500 and 502 show safe recoverable errors without technical messages');
 console.log(JSON.stringify({brandingErrors:'PASS',checks},null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
