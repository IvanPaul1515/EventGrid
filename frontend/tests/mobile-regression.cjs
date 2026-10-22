// Run against the local Vite dev server. All API requests are mocked; no database is used.
const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,permissions:['camera']});
 const page=await context.newPage();
 page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER',msg.text());});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:'test-user',fullName:'Operador de Prueba',email:'test@example.invalid',role:'ADMIN'};
 const event={id:'test-event',name:'BarCamp RD 2026',year:2026,status:'ACTIVE',venue:'Santiago',startDate:'2026-10-22',endDate:'2026-10-22',settings:{tshirtSizesEnabled:false,demoModeEnabled:false}};
 let scanCalls=0,checkInCalls=0;
 const counters={totalRegistrations:0,attendedCount:0,pendingCount:0};
 await page.addInitScript(({user})=>{
  localStorage.setItem('barcamp_token','local-test-only');localStorage.setItem('barcamp_user',JSON.stringify(user));
  window.__streams=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await get(...args);window.__streams.push(s);return s;};
 },{user});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data=[];
  if(path.endsWith('/stream')) return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
  if(path.endsWith('/auth/me')) data=user;
  else if(path.endsWith('/events')) data=[event];
  else if(path.endsWith('/health')) data={status:'healthy'};
  else if(path.endsWith('/ticket-types')) data=[{id:'ticket',name:'General',price:1750,isActive:true}];
  else if(path.endsWith('/attendance/counters')) data=counters;
  else if(path.endsWith('/attendance/daily-sales')) data=null;
  else if(path.endsWith('/attendance/check-in')) {checkInCalls++;await new Promise(r=>setTimeout(r,200));data={};}
  else if(path.endsWith('/qr/scan')) {scanCalls++; data={valid:false,status:'INVALID_CODE',message:'Código de prueba',canCheckIn:false};
   if(route.request().postDataJSON().qrToken==='valid-test')data={valid:true,status:'VALID',message:'Valid test',canCheckIn:true,registration:{id:'test-registration',registrationNumber:'TEST-001',status:'CONFIRMED',participant:{fullName:'Test Person',documentId:'test-doc',email:'test@example.invalid'},ticketType:{name:'General'}}};
  }
  await route.fulfill({json:{success:true,data,pagination:{total:0,page:1,limit:10,totalPages:1},counters}});
 });
 await page.goto(base+'/participants');
 await page.getByRole('button',{name:'Nuevo Participante'}).waitFor({timeout:15000}).catch(()=>{});

 const checks=[];
 assert(!await page.locator('meta[name=viewport]').getAttribute('content').then(v=>/user-scalable=no|maximum-scale/.test(v)));
 for(const width of [320,390,412,844,1440]) {
  await page.setViewportSize({width,height:width===844?390:900});
  await page.getByRole('button',{name:'Nuevo Participante',exact:true}).click();
  const modal=page.getByRole('dialog'); await modal.waitFor();
  const amount=modal.locator('input[inputmode="decimal"]').first();
  await amount.fill('01750'); assert.equal(await amount.inputValue(),'1750');
  await amount.blur(); assert.equal(await amount.inputValue(),'1,750.00');
  await amount.focus(); await amount.fill(''); assert.equal(await amount.inputValue(),'');
  await amount.fill('01750'); assert.equal(await amount.inputValue(),'1750');
  await amount.blur(); assert.equal(await amount.inputValue(),'1,750.00');
  const font=await amount.evaluate(e=>getComputedStyle(e).fontSize);
  assert.equal(font,width<1024?'16px':'12px');
  const box=await modal.boundingBox();
  assert(box.y>=-1 && box.y+box.height <= (width===844?390:900)+1);
  const overflow=await page.locator('header').evaluate(e=>e.scrollWidth>e.clientWidth);
  assert.equal(overflow,false);
  page.once('dialog',d=>d.accept());
  await modal.locator('button').first().click();
  await modal.waitFor({state:'hidden'});
  checks.push('form '+width+'px: money, font, header, height OK');
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Nuevo Participante',exact:true}).click();
 await page.evaluate(()=>{
  Object.defineProperty(window.visualViewport,'height',{configurable:true,value:380});
  window.visualViewport.dispatchEvent(new Event('resize'));
 });
 await page.waitForTimeout(250);
 const keyboardBox=await page.getByRole('dialog').boundingBox();
 assert(keyboardBox.y>=0 && keyboardBox.y+keyboardBox.height<=380);
 await page.evaluate(()=>{
  delete window.visualViewport.height;
  window.visualViewport.dispatchEvent(new Event('resize'));
 });
 await page.getByRole('dialog').locator('button').first().click();
 checks.push('keyboard viewport: modal stays inside available height');
 event.name='BarCamp RD - Encuentro Nacional de Tecnologia y Comunidades';
 await page.setViewportSize({width:320,height:844});
 await page.reload();
 const edition=page.getByTitle(/Cambiar edici.n del evento/);
 await edition.getByText(/Comunidades/).waitFor();
 assert((await edition.innerText()).includes('2026'));
 assert.equal(await edition.evaluate(e=>e.scrollHeight>e.clientHeight),false);
 assert.equal(await page.locator('header').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 event.name='BarCamp RD 2026';
 checks.push('long edition: full name and appended year fit at 320px');
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/attendance');
 await page.getByRole('button',{name:'Escanear QR',exact:true}).click();
 const qr=page.getByRole('dialog',{name:/de entradas QR/});
 await page.waitForFunction(()=>window.__streams.some(s=>s.getTracks().some(t=>t.readyState==='live')));
 const square=await page.locator('#qr-square-viewport').evaluate(e=>{const b=e.getBoundingClientRect();return [b.width,b.height];});
 assert(Math.abs(square[0]-square[1])<2);
 await qr.getByRole('button',{name:'Lector USB / Manual',exact:true}).click();
 await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 assert.equal(await page.locator('#qr-square-viewport').count(),0);
 await qr.locator('input').fill('test-token');
 await qr.getByRole('button',{name:'Validar',exact:true}).click();
 await qr.getByText(/de prueba/).waitFor();

 await qr.locator('input').fill('valid-test');
 const before=scanCalls;
 await qr.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await qr.getByText('Valid test',{exact:true}).waitFor();
 assert.equal(scanCalls,before+1);
 await qr.getByRole('button',{name:'MARCAR ASISTENCIA AHORA',exact:true}).click();
 const confirm=page.getByRole('dialog',{name:'Confirmar asistencia',exact:true});
 await confirm.getByRole('button',{name:'Confirmar Asistencia',exact:true}).evaluate(button=>{button.click();button.click();});
 await confirm.waitFor({state:'hidden'});
 assert.equal(checkInCalls,1);
 checks.push('QR: duplicate submit/check-in guarded (one request each)');
 await qr.getByRole('button',{name:/Modo C.mara/,exact:true}).click();
 await qr.getByRole('button',{name:/Cerrar esc.ner/,exact:true}).click();
 await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 // Rapid reopen/close while camera initialization is pending.
 for(let i=0;i<3;i++) {
  await page.getByRole('button',{name:'Escanear QR',exact:true}).click();
  await page.getByRole('button',{name:/Cerrar esc.ner/,exact:true}).click();
 }
 await page.waitForTimeout(1000);
 await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 checks.push('QR: square, exclusive modes, manual validation, closed tracks, rapid close OK');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,errors},null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
