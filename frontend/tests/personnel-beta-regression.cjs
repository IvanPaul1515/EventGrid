
const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try {
for(const width of [320,390,844,1440]){
 const c=await b.newContext({viewport:{width,height:900},hasTouch:width<1024}),p=await c.newPage();p.setDefaultTimeout(12000);
 const event={id:'event',name:'QA Event 2026',year:2026,status:'ACTIVE',isDefault:true,settings:{}}, user={id:'admin',email:'admin@example.invalid',fullName:'QA Admin',role:'ADMIN'};
 let staff=[{id:'staff',firstName:'Iván',lastName:'Marcelino',email:'ivan@example.invalid',phone:'+18294616106',function:'Hidden legacy',area:'Hidden area'}], linked=null,saved=[],sends=0,denied=false,role='ADMIN',configReads=0;
 const template={id:'digital',code:'DIGITAL_TICKET',name:'Entrada digital',subject:'Entrada',bodyHtml:'<p>Entrada {{nombre}}</p>'};
 await p.addInitScript(user=>{localStorage.setItem('barcamp_token','mock');localStorage.setItem('barcamp_user',JSON.stringify(user));},user);
 await p.route('**/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname,m=q.method();let data=[];
  if(path.endsWith('/stream')) return r.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
  if(path.endsWith('/auth/me'))data={...user,role};else if(path.endsWith('/events'))data=[event];
  else if(path.endsWith('/communications/status')){if(denied)return r.fulfill({status:403,json:{message:'Restricted'}});data={isEnabled:false,isConfigured:false};}
  else if(path.endsWith('/communications/config')){configReads++;data={isEnabled:false,host:''};}
  else if(path.endsWith('/communications/templates'))data=[template];
  else if(path.endsWith('/users/invitations/selection'))data=[linked];
  else if(path.endsWith('/users/invitations/send')||path.endsWith('/communications/send'))sends++;
  else if(path.endsWith('/staff/staff/access')){if(m==='GET')data={linked:!!linked,account:linked};else{linked={id:'linked',fullName:'Iván Marcelino',email:'ivan@example.invalid',role:q.postDataJSON().role,accountStatus:'PENDING'};staff[0].userId='linked';data=linked;}}
  else if(path.endsWith('/staff')){if(m==='GET')data=staff;else {saved.push(q.postDataJSON()); data={...q.postDataJSON(),id:'created'};}}
  else if(path.endsWith('/staff/staff')){saved.push(q.postDataJSON());data={...staff[0],...q.postDataJSON()};}
  else if(path.endsWith('/users'))data=linked?[{...linked,staffMembers:[{id:'staff',eventId:event.id,firstName:'Iván',lastName:'Marcelino'}]}]:[];
  else if(path.endsWith('/stats')||path.endsWith('/financial-summary'))data=null;
  await r.fulfill({json:{data,pagination:{total:linked?1:0,page:1,totalPages:1},counters:{}}});
 });
 await p.goto('http://127.0.0.1:5178/staff');await p.getByRole('button',{name:'Agregar colaborador',exact:true}).click();const dialog=p.getByRole('dialog',{name:'Miembro de staff'});assert.equal(await dialog.locator('input').count(),4);
 const phone=dialog.getByLabel('Teléfono',{exact:true});await phone.pressSequentially('8294616106');assert.equal(await phone.inputValue(),'(829) 461-6106');
 await phone.press('Backspace');assert.equal((await phone.inputValue()).replace(/\D/g,''),'829461610');await phone.press('Control+End');await phone.press('6');assert.equal(await phone.inputValue(),'(829) 461-6106');
 await phone.fill('+18294616106');assert.equal(await phone.inputValue(),'+1 (829) 461-6106');
 await phone.fill('+34612345678');assert.equal(await phone.inputValue(),'+34 612 34 56 78');
 await dialog.getByLabel('Nombre',{exact:true}).fill('New');await dialog.getByLabel('Apellido',{exact:true}).fill('Person');await dialog.getByLabel('Correo electrónico',{exact:true}).fill('new@example.invalid');
 await phone.fill('123');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(saved.length,0);
 await phone.fill('+34612345678');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(saved[0].phone,'+34612345678');
 assert.equal(await p.getByText('Función / Área',{exact:true}).count(),0);assert.equal(await p.getByText('Hidden legacy',{exact:false}).count(),0);
 await p.getByRole('button',{name:'Crear acceso a EventGrid',exact:true}).filter({visible:true}).click();const access=p.getByRole('dialog',{name:'Acceso del colaborador'});await access.getByRole('combobox').selectOption('VIEWER');await access.getByRole('button',{name:'Crear cuenta pendiente'}).click();await access.getByRole('button',{name:'Invitar usuario',exact:true}).click();const invite=p.getByRole('dialog',{name:'Confirmar invitaciones'});await invite.getByText('ivan@example.invalid · Consulta',{exact:true}).waitFor();assert.equal(sends,0);await invite.getByRole('button',{name:'Cancelar',exact:true}).click();
 await p.goto('http://127.0.0.1:5178/users');await p.getByRole('link',{name:'Colaborador: Iván Marcelino',exact:true}).filter({visible:true}).waitFor();
 assert.equal(await p.getByText('Edición en Gestión',{exact:true}).count(),0);assert.equal(await p.locator('header').getByText('Activo',{exact:true}).count(),0);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 role='OPERATOR';await p.evaluate(user=>localStorage.setItem('barcamp_user',JSON.stringify({...user,role:'OPERATOR'})),user);
 await p.goto('http://127.0.0.1:5178/communications');await p.getByRole('heading',{name:'Comunicaciones y Mensajería',exact:true}).waitFor();assert.equal(configReads,0);assert.equal(await p.getByRole('heading',{name:'Acceso restringido',exact:true}).count(),0);
 for(const text of ['Envíos Masivos','Cola de Lotes','Configuración técnica','Probar envío'])assert.equal(await p.getByText(text,{exact:true}).count(),0);
 denied=true;await p.reload();await p.getByRole('heading',{name:'Acceso restringido',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Comunicaciones y Mensajería',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Reintentar conexión',exact:true}).count(),0);assert.equal(await p.getByRole('alert').count(),1);
 console.log(width+'px PASS: phone input/edit/delete/E.164; explicit staff link/invite; navigation; operator capabilities and exclusive 403; zero sends');await c.close();
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
