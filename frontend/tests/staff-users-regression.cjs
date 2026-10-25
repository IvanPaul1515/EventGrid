const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');const assert=require('node:assert/strict');
const base=process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178';
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});const checks=[];
try{for(const width of [320,390,412,844,1440]){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',hasTouch:width<1024});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-24T15:15:00Z')});
 const current={id:'qa-admin',fullName:'QA Global Admin',email:'admin@example.invalid',role:'ADMIN'};
 const event={id:'qa-event',name:'QA Event 2026',year:2026,status:'ACTIVE',isDefault:true,settings:{}};
 const accounts=['Alfa','Beta','Gamma'].map((name,i)=>({id:'user-'+i,fullName:name,email:name.toLowerCase()+'@example.invalid',role:i===1?'VIEWER':'OPERATOR',assignedEventId:event.id,accountStatus:'PENDING',isActive:false,invitationState:i===2?'EXPIRED':'PENDING',invitation:i===2?{expiresAt:'2020-01-01T00:00:00Z'}:null}));
 accounts.push({id:'active',fullName:'Active Account',email:'active@example.invalid',role:'ADMIN',accountStatus:'ACTIVE',isActive:true,invitationState:'ACTIVATED'});
 const staff=[],created=[],batches=[];let staffSaves=0;
 await page.addInitScript(current=>{localStorage.setItem('barcamp_token','mock-only');localStorage.setItem('barcamp_user',JSON.stringify(current));},current);
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();let data=[];
  if(path.endsWith('/stream'))return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
  if(path.endsWith('/auth/me'))data=current;else if(path.endsWith('/events'))data=[event];
  else if(path.endsWith('/staff')&&method==='POST'){const input=req.postDataJSON();assert.deepEqual(Object.keys(input).sort(),['email','firstName','lastName','phone']);assert.equal(req.headers()['x-event-id'],event.id);staffSaves++;data={...input,id:'staff'};staff.push(data);}
  else if(path.endsWith('/staff'))data=staff;
  else if(path.endsWith('/users')&&method==='POST'){const input=req.postDataJSON();assert.deepEqual(Object.keys(input).sort(),['email','fullName','role']);assert.equal(req.headers()['x-event-id'],event.id);data={...input,id:'created-'+created.length,accountStatus:'PENDING',isActive:false,assignedEventId:event.id,invitationState:'PENDING'};created.push(data);accounts.push(data);}
  else if(path.endsWith('/users'))data=accounts.filter(user=>!url.searchParams.get('search')||user.fullName.includes(url.searchParams.get('search')));
  else if(path.endsWith('/invitations/selection'))data=accounts.filter(user=>req.postDataJSON().userIds.includes(user.id));
  else if(path.endsWith('/invitations/send')){const input=req.postDataJSON();batches.push(input);await new Promise(r=>setTimeout(r,100));data={status:'COMPLETED',results:input.userIds.map(userId=>({userId,status:'PENDING',reason:'Proveedor desactivado; no se intentó enviar.'}))};}
  else if(path.endsWith('/invitations'))data=[{id:'history',status:'PENDING',createdAt:new Date().toISOString()}];
  else if(path.endsWith('/invitations/preview'))data={issues:[],count:req.postDataJSON().rows.length};
  else if(path.endsWith('/stats')||path.endsWith('/financial-summary'))data=null;
  await route.fulfill({json:{data,pagination:{total:accounts.length,page:1,totalPages:1},counters:{}}});
 });
 await page.goto(base+'/staff');await page.getByRole('button',{name:'Agregar colaborador',exact:true}).click();const form=page.getByRole('dialog',{name:'Miembro de staff'});
 assert.equal(await form.locator('input').count(),4);assert.equal(await form.locator('select').count(),0);
 await form.getByLabel('Nombre',{exact:true}).fill('Fictitious');await form.getByLabel('Apellido',{exact:true}).fill('Staff');await form.getByLabel('Correo electrónico',{exact:true}).fill('staff@example.invalid');assert.equal(await form.getByLabel('Teléfono',{exact:true}).getAttribute('type'),'tel');await form.getByRole('button',{name:'Guardar',exact:true}).dblclick();await form.waitFor({state:'hidden'});assert.equal(staffSaves,1);assert.equal(created.length,0);assert.equal(batches.length,0);
 const time=page.getByLabel(/Hora de Santiago/);await time.waitFor();assert.match(await time.textContent(),/11:15\s*AM/);await page.clock.fastForward(60000);assert.match(await time.textContent(),/11:16\s*AM/);assert.equal(await page.getByText('En vivo',{exact:true}).count(),0);assert.equal(await page.locator('header').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await page.goto(base+'/users');await page.getByRole('button',{name:'Nuevo Usuario',exact:true}).click();const create=page.getByRole('dialog',{name:'Crear usuario'});
 assert.equal(await create.locator('input').count(),2);assert.equal(await create.locator('select').count(),1);assert.equal(await create.locator('input[type=password]').count(),0);
 await create.getByLabel('Nombre completo',{exact:true}).fill('New Person');await create.getByLabel('Correo electrónico',{exact:true}).fill('new@example.invalid');await create.getByLabel('Rol',{exact:true}).selectOption('VIEWER');
 assert.equal(await create.evaluate(e=>e.scrollWidth>e.clientWidth),false);for(const input of await create.locator('input').all())if(width<1024)assert(parseFloat(await input.evaluate(e=>getComputedStyle(e).fontSize))>=16);
 await create.getByRole('button',{name:'Crear Usuario',exact:true}).dblclick();await create.waitFor({state:'hidden'});assert.equal(created.length,1);assert.equal(batches.length,0);
 const visibleCheck=name=>page.getByRole('checkbox',{name:'Seleccionar '+name,exact:true}).filter({visible:true});
 await visibleCheck('Alfa').check();await visibleCheck('Gamma').check();await page.getByRole('button',{name:'Enviar invitaciones (2)',exact:true}).click();const modal=page.getByRole('dialog',{name:'Confirmar invitaciones'});
 await modal.getByRole('heading',{name:'¿Enviar invitaciones a 2 usuarios?',exact:true}).waitFor();assert.equal(batches.length,0);await modal.getByText('alfa@example.invalid · Operador',{exact:true}).waitFor();await modal.getByText('gamma@example.invalid · Operador',{exact:true}).waitFor();assert.equal(await modal.getByText('beta@example.invalid',{exact:false}).count(),0);await modal.getByText('Enlace vencido',{exact:true}).waitFor();assert.equal(await modal.evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await modal.getByRole('button',{name:'Confirmar envío',exact:true}).dblclick();await modal.getByRole('heading',{name:'Resultado de invitaciones'}).waitFor();assert.equal(batches.length,1);assert.deepEqual(batches[0].userIds.sort(),['user-0','user-2']);assert.equal(batches[0].confirmed,true);assert.equal(batches[0].reinvite,false);await modal.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('checkbox',{name:/Seleccionar todos los usuarios de esta página/}).check();assert.equal(await page.getByRole('button',{name:'Enviar invitaciones (5)',exact:true}).isEnabled(),true);await page.getByRole('checkbox',{name:/Seleccionar todos los usuarios de esta página/}).uncheck();
 await visibleCheck('Active Account').check();await page.getByRole('button',{name:'Enviar invitaciones (1)',exact:true}).click();await modal.getByText('Se excluirá: cuenta ya activada.',{exact:true}).waitFor();assert.equal(await modal.getByRole('button',{name:'Confirmar envío',exact:true}).isDisabled(),true);await modal.getByRole('checkbox').check();assert.equal(await modal.getByRole('button',{name:'Confirmar envío',exact:true}).isEnabled(),true);await modal.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(batches.length,1);
 await page.locator('input[placeholder="Buscar por nombre o correo electrónico..."]').fill('Alfa');await page.getByText('0 seleccionados',{exact:true}).waitFor();assert.equal(await page.getByText(/Contraseña Temporal|Credencial Temporal|Copiar contraseña|Entrega esta clave/).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 checks.push(`${width}px: staff 4 fields, user 3 fields, no credentials or automatic sends, selected-only batch, single confirmation, disabled-provider result, active-account explicit reinvite, visible-page select-all, filters clear selection, Santiago clock independent of device timezone`);
 await context.close();
}
console.log(JSON.stringify({staffUsers:'PASS',checks},null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
