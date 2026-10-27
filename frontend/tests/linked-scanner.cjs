// Runs only against the temporary backend fixture, never Render.
module.exports = async ({api,base,eventId,accounts,firstToken='relay-test-ticket',secondToken='relay-test-ticket-2',firstName='Safe Fixture',secondName='Second Safe Fixture',syntheticCamera=true}) => {
 const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT),assert=require('node:assert/strict');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 let cameraFile;
 if(syntheticCamera){
  const matrix=require('qrcode').create(firstToken,{errorCorrectionLevel:'M'}).modules;
  const width=640,height=480,scale=Math.floor(400/(matrix.size+8));
  const y=Buffer.alloc(width*height,235),u=Buffer.alloc(width*height/4,128),v=Buffer.alloc(width*height/4,128);
  const left=Math.floor((width-matrix.size*scale)/2),top=Math.floor((height-matrix.size*scale)/2);
  for(let row=0;row<matrix.size;row++)for(let col=0;col<matrix.size;col++)if(matrix.get(row,col))for(let dy=0;dy<scale;dy++)y.fill(16,(top+row*scale+dy)*width+left+col*scale,(top+row*scale+dy)*width+left+(col+1)*scale);
  cameraFile=path.join(os.tmpdir(),'eventgrid-camera-'+require('node:crypto').randomUUID()+'.y4m');
  fs.writeFileSync(cameraFile,Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F5:1 Ip A1:1 C420jpeg\nFRAME\n`),y,u,v]));
 }
 const browser=await chromium.launch({headless:true,channel:'chrome',args:cameraFile?['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+cameraFile]:[]}),contexts=[],errors=[];let automaticUnlinks=0;
 try {
  const pages=[];
  for(let i=0;i<4;i++) {
   const context=await browser.newContext({viewport:{width:i%2?390:1440,height:1000},isMobile:!!(i%2),hasTouch:!!(i%2)});contexts.push(context);
   await context.grantPermissions(['camera']);
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/unlink'))automaticUnlinks++;});
   await page.addInitScript(({account,eventId})=>{localStorage.setItem('barcamp_token',account.token);localStorage.setItem('barcamp_user',JSON.stringify(account.user));localStorage.setItem('barcamp_current_event_id',eventId);window.__scannerTracks=[];const capture=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);if(capture)navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await capture(...args);window.__scannerTracks.push(...stream.getTracks());return stream;};window.__scannerEvents=[];window.addEventListener('eventgrid:realtime:SCANNER_CHANGED',e=>window.__scannerEvents.push(e.detail));},{account:accounts[i],eventId});
   await page.goto(base+'/reception');await page.getByRole('region',{name:'Vinculación de escáner móvil'}).waitFor();pages.push(page);
  }
  const [pc,phone,pc2,phone2]=pages;
  const panel=p=>p.getByRole('region',{name:'Vinculación de escáner móvil'});
  await phone.goto(base+'/');await phone.getByTestId('dashboard-attendance').waitFor();
  assert.equal(await phone.getByRole('complementary',{name:'Sugerencia de escáner vinculado'}).count(),0);
  await panel(phone2).getByRole('button',{name:'Vincular teléfono a una PC',exact:true}).click();
  await phone2.getByText('Para vincular este teléfono, abre Recepción rápida en tu PC y selecciona Habilitar escáner móvil.',{exact:true}).waitFor();
  await panel(pc).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).click();
  await pc.getByText('Estación de recepción disponible',{exact:true}).waitFor();
  await phone.getByRole('complementary',{name:'Sugerencia de escáner vinculado'}).waitFor({timeout:6000});
  await phone2.getByRole('button',{name:'Continuar normalmente',exact:true}).click();
  await panel(pc2).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).click();
  await pc2.getByText('Estación de recepción disponible',{exact:true}).waitFor();
  assert.equal(await phone2.getByRole('complementary',{name:'Sugerencia de escáner vinculado'}).count(),0);
  await phone.getByRole('button',{name:'Vincular como escáner',exact:true}).click();
  for(const p of [phone,phone2])assert.equal(await panel(p).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).count(),0);
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
  // SPA unmounts must not unlink either device or stop its heartbeat.
  for(const p of [desktop,phone]){await p.locator('a[href="/"]').first().evaluate(a=>a.click());await p.waitForURL(url=>url.pathname==='/');}
  await phone.getByRole('complementary',{name:'Teléfono vinculado'}).waitFor();
  await desktop.locator('a[href="/reception"]').first().evaluate(a=>a.click());
  await phone.getByRole('button',{name:'Volver al escáner',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).waitFor();
  await phone.reload();await desktop.reload();
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).waitFor();
  await contexts[1].setOffline(true);await phone.getByText(/Sin conexión con la estación/).waitFor();
  await contexts[1].setOffline(false);
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).waitFor();
  assert.equal(automaticUnlinks,0);
  const before=await untouched.evaluate(()=>window.__scannerEvents.length);
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).click();
  if(!syntheticCamera){
    await phone.getByRole('button',{name:'Lector USB / Manual',exact:true}).click();
    await phone.getByPlaceholder('Escanee con lector USB o pegue el enlace/token...').fill(firstToken);
    await phone.getByRole('button',{name:'Validar',exact:true}).click();
  }
  await desktop.getByRole('dialog').filter({hasText:firstName}).waitFor();
  if(syntheticCamera)await phone.waitForFunction(()=>window.__scannerTracks.length>0&&window.__scannerTracks.every(t=>t.readyState==='ended'));
  assert.equal(await untouched.evaluate(()=>window.__scannerEvents.length),before);
  assert.equal(await phone.getByRole('button',{name:/Confirmar asistencia/i}).count(),0);
  await desktop.reload();
  await desktop.getByRole('dialog').filter({hasText:firstName}).waitFor();
  await desktop.getByRole('button',{name:'MARCAR ASISTENCIA',exact:true}).click();
  await desktop.getByRole('dialog',{name:'Confirmar asistencia',exact:true}).getByRole('button',{name:'Confirmar Asistencia',exact:true}).click();
  await desktop.getByText(/Asistencia registrada correctamente/).first().waitFor();
  assert((await desktop.url()).endsWith('/reception'));
  await desktop.getByRole('button',{name:'Siguiente participante',exact:true}).click();
  assert((await desktop.url()).endsWith('/reception'));
  assert.equal(await phone.getByPlaceholder('Escanee con lector USB o pegue el enlace/token...').count(),0);
  await phone.reload();await desktop.reload();
  await panel(phone).getByRole('button',{name:'Leer QR para la PC',exact:true}).click();
  await phone.getByRole('button',{name:'Lector USB / Manual',exact:true}).click();
  await phone.getByPlaceholder('Escanee con lector USB o pegue el enlace/token...').fill(secondToken);
  await phone.getByRole('button',{name:'Validar',exact:true}).click();
  await desktop.getByRole('dialog').filter({hasText:secondName}).waitFor();
  await desktop.getByRole('button',{name:'MARCAR ASISTENCIA',exact:true}).click();
  await desktop.getByRole('dialog',{name:'Confirmar asistencia',exact:true}).getByRole('button',{name:'Confirmar Asistencia',exact:true}).click();
  await desktop.getByText(/Asistencia registrada correctamente/).first().waitFor();
  assert.equal(automaticUnlinks,0);
  // Accepted relay closes the scan surface and releases camera before PC confirmation.
  assert.equal(await phone.getByPlaceholder('Escanee con lector USB o pegue el enlace/token...').count(),0);
  await panel(phone).getByRole('button',{name:'Desvincular y usar EventGrid normalmente',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Vincular teléfono a una PC',exact:true}).waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const page of pages)assert(!(await page.url()).includes('/login'));
  assert.deepEqual(errors,[]);
  return {browserSessions:4,mobileWidths:[390,390],role:accounts[0].user.role,mobileOpenedFirst:true,discoveryWithoutReload:true,dismissalRespected:true,moduleNavigationPreservesLink:true,bothDevicesReloaded:true,temporaryNetworkRecovery:true,twoConfirmedReads:true,targetedDelivery:true,noAutomaticCheckIn:true,manualPCConfirmation:true,reloadResumesReading:true,twoSimultaneousLinks:true,unlinkWithoutLogout:true,cameraInput:syntheticCamera?'synthetic WebRTC video decoded by the real scanner':'manual token',cameraReleasedAfterRead:syntheticCamera,physicalCamera:false};
 } finally {for(const c of contexts)await c.close();await browser.close();if(cameraFile)fs.unlinkSync(cameraFile);}
};
