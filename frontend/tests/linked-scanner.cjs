// Runs only against the temporary backend fixture, never Render.
module.exports = async ({api,base,eventId,accounts}) => {
 const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT),assert=require('node:assert/strict');
 const browser=await chromium.launch({headless:true,channel:'chrome'}),contexts=[],errors=[];
 try {
  const pages=[];
  for(let i=0;i<4;i++) {
   const context=await browser.newContext({viewport:{width:i%2?390:1440,height:1000},isMobile:!!(i%2),hasTouch:!!(i%2)});contexts.push(context);
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({account,eventId})=>{localStorage.setItem('barcamp_token',account.token);localStorage.setItem('barcamp_user',JSON.stringify(account.user));localStorage.setItem('barcamp_current_event_id',eventId);window.__scannerEvents=[];window.addEventListener('eventgrid:realtime:SCANNER_CHANGED',e=>window.__scannerEvents.push(e.detail));},{account:accounts[i],eventId});
   await page.goto(base+'/reception');await page.getByRole('region',{name:'Vinculación de escáner móvil'}).waitFor();pages.push(page);
  }
  const [pc,phone,pc2,phone2]=pages;
  const panel=p=>p.getByRole('region',{name:'Vinculación de escáner móvil'});
  await panel(pc).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).click();
  await panel(pc).getByRole('button',{name:'Escáner móvil',exact:true}).click();
  await panel(pc2).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).click();
  await panel(pc2).getByRole('button',{name:'Escáner móvil',exact:true}).click();
  for (const p of [phone,phone2]) { assert.equal(await panel(p).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).count(),0); await panel(p).getByRole('button',{name:'Vincular teléfono a una PC',exact:true}).click(); }
  await panel(phone).getByRole('button',{name:/Vincular a/}).first().waitFor();
  await panel(phone).getByRole('button',{name:/Vincular a/}).first().click();
  let desktop=pc;
  try {await pc.getByRole('dialog',{name:'Autorizar escáner'}).waitFor({timeout:5000});}catch{desktop=pc2;}
  const dialog=desktop.getByRole('dialog',{name:'Autorizar escáner'});await dialog.waitFor();
  const code=(await dialog.locator('strong').innerText()).trim();assert(/^\d{6}$/.test(code));
  await dialog.getByRole('button',{name:'Autorizar',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Confirmar vinculación',exact:true}).waitFor();
  await panel(phone).getByRole('textbox',{name:'Código mostrado en la PC'}).fill(code);
  await panel(phone).getByRole('button',{name:'Confirmar vinculación',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).waitFor();
  const untouched=desktop===pc?pc2:pc;
  await panel(phone2).getByRole('button',{name:/Vincular a/}).last().waitFor();
  await panel(phone2).getByRole('button',{name:/Vincular a/}).last().click();
  const secondDialog=untouched.getByRole('dialog',{name:'Autorizar escáner'});await secondDialog.waitFor();
  const secondCode=(await secondDialog.locator('strong').innerText()).trim();
  await secondDialog.getByRole('button',{name:'Autorizar',exact:true}).click();
  await panel(phone2).getByRole('textbox',{name:'Código mostrado en la PC'}).fill(secondCode);
  await panel(phone2).getByRole('button',{name:'Confirmar vinculación',exact:true}).click();
  await panel(phone2).getByRole('button',{name:'Leer QR para la PC',exact:true}).waitFor();
  const before=await untouched.evaluate(()=>window.__scannerEvents.length);
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).click();
  await phone.getByRole('button',{name:'Lector USB / Manual',exact:true}).click();
  await phone.getByPlaceholder('Escanee con lector USB o pegue el enlace/token...').fill('relay-test-ticket');
  await phone.getByRole('button',{name:'Validar',exact:true}).click();
  await desktop.getByRole('dialog').filter({hasText:'Safe Fixture'}).waitFor();
  assert.equal(await untouched.evaluate(()=>window.__scannerEvents.length),before);
  assert.equal(await phone.getByRole('button',{name:/Confirmar asistencia/i}).count(),0);
  await desktop.reload();
  await desktop.getByRole('dialog').filter({hasText:'Safe Fixture'}).waitFor();
  await desktop.getByRole('button',{name:'MARCAR ASISTENCIA',exact:true}).click();
  await desktop.getByRole('dialog',{name:'Confirmar asistencia',exact:true}).getByRole('button',{name:'Confirmar Asistencia',exact:true}).click();
  await desktop.getByText(/Asistencia registrada correctamente/).first().waitFor();
  assert((await desktop.url()).endsWith('/reception'));
  await desktop.getByRole('button',{name:'Siguiente participante',exact:true}).click();
  assert((await desktop.url()).endsWith('/reception'));
  // Close the QR modal first; unpairing releases hardware via its existing cleanup.
  await phone.keyboard.press('Escape');
  const close=phone.getByRole('button',{name:/cerrar/i});if(await close.count())await close.last().click();
  await panel(phone).getByRole('button',{name:'Desvincular y usar EventGrid normalmente',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Vincular teléfono a una PC',exact:true}).waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const page of pages)assert(!(await page.url()).includes('/login'));
  assert.deepEqual(errors,[]);
  return {browserSessions:4,mobileWidths:[390,390],targetedDelivery:true,noAutomaticCheckIn:true,manualPCConfirmation:true,reloadResumesReading:true,twoSimultaneousLinks:true,unlinkWithoutLogout:true,physicalCamera:false};
 } finally {for(const c of contexts)await c.close();await browser.close();}
};
