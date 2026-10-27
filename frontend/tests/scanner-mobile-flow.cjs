// Isolated local fixture or explicitly authorized synthetic demo registrations only.
module.exports=async({api,base,eventId,accounts,firstToken='relay-test-ticket',secondToken='relay-test-ticket-2',firstName='Safe Fixture',secondName='Second Safe Fixture'})=>{
 const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT),assert=require('node:assert/strict'),qr=require('qrcode');
 const browser=await chromium.launch({headless:true,channel:'chrome'}),contexts=[],errors=[];let unlinks=0;
 const panel=p=>p.getByRole('region',{name:'Vinculación de escáner móvil'});
 try{
  const pages=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:i?390:1440,height:i?844:1000},isMobile:!!i,hasTouch:!!i});contexts.push(context);
   const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/unlink'))unlinks++;});
   await page.addInitScript(({account,eventId})=>{
    localStorage.setItem('barcamp_token',account.token);localStorage.setItem('barcamp_user',JSON.stringify(account.user));localStorage.setItem('barcamp_current_event_id',eventId);
    // Synthetic camera frames; the production QR decoder and track cleanup run unchanged.
    window.__tracks=[];window.__frame='';
    navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d'),image=new Image();let last='';const timer=setInterval(()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);if(window.__frame!==last){last=window.__frame;image.src=last;}if(image.complete&&image.naturalWidth)ctx.drawImage(image,120,40,400,400);},100);const stream=canvas.captureStream(10);for(const track of stream.getTracks()){window.__tracks.push(track);track.addEventListener('ended',()=>clearInterval(timer));const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};}return stream;};
   },{account:accounts[i],eventId});pages.push(page);
  }
  const [pc,phone]=pages;
  // PC dashboard advertises availability but remains a normal dashboard.
  await pc.goto(base+'/');await pc.getByTestId('dashboard-attendance').waitFor();
  await phone.goto(base+'/');await phone.getByRole('dialog',{name:'Hay una computadora disponible'}).waitFor();
  await phone.getByRole('button',{name:'Usar EventGrid normalmente',exact:true}).click();await phone.getByTestId('dashboard-attendance').waitFor();
  await phone.goto(base+'/reception');await panel(phone).getByRole('button',{name:'Vincular como escáner',exact:true}).click();
  await panel(phone).getByRole('button',{name:/Vincular a/}).first().click();
  // PC authorization must arrive even outside Reception.
  const approval=pc.getByRole('dialog',{name:'Autorizar escáner'});await approval.waitFor();
  const code=(await approval.locator('strong').innerText()).trim();assert(/^\d{6}$/.test(code));
  const authorize=approval.getByRole('button',{name:'Autorizar',exact:true});assert((await authorize.boundingBox()).height>=44);
  await authorize.click();await approval.getByText('Autorizado. Esperando confirmación del teléfono.',{exact:true}).waitFor();
  const input=panel(phone).getByRole('textbox',{name:'Código mostrado en la PC'}),confirm=panel(phone).getByRole('button',{name:'Confirmar vinculación',exact:true});
  assert.equal(await input.getAttribute('inputmode'),'numeric');
  assert(await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  assert.notEqual(await authorize.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await input.fill('123');assert(await confirm.isDisabled());await input.fill(code);await confirm.click();
  await phone.getByRole('heading',{name:'Escáner móvil',exact:true}).waitFor();assert.equal(await panel(phone).getByRole('button').count(),2);
  assert.equal(await phone.locator('a[href="/participants"]').count(),0);
  await phone.goto(base+'/participants');await phone.waitForURL(u=>u.pathname==='/reception');await phone.reload();await panel(phone).getByRole('button',{name:'Leer QR',exact:true}).waitFor();
  await pc.goto(base+'/reception');await pc.reload();assert.equal(unlinks,0);
  await contexts[1].setOffline(true);await phone.getByRole('heading',{name:/Sin conexión|Conexión con la PC/}).waitFor();await contexts[1].setOffline(false);
  async function scan(token){const image=await qr.toDataURL(token,{width:400,margin:4});await phone.evaluate(frame=>{window.__frame=frame;},image);await panel(phone).getByRole('button',{name:'Leer QR',exact:true}).click();const camera=phone.getByRole('dialog',{name:'Escáner de entradas QR'});assert.equal(await camera.getByRole('button',{name:'Lector USB / Manual',exact:true}).count(),0);const box=await camera.boundingBox();assert(box.y>=0&&box.y+box.height<=phone.viewportSize().height);}
  // Rejected QR is a large persistent result, never mislabeled as revoked.
  await phone.setViewportSize({width:844,height:390});
  await phone.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.style.setProperty('--primary','210 80% 40%');});
  await scan('unrecognized-safe-qa');await phone.getByRole('dialog',{name:'Entrada no válida',exact:true}).waitFor();
  await phone.waitForFunction(()=>window.__tracks.length&&window.__tracks.every(t=>t.readyState==='ended'));
  // Next opens camera immediately, so set the next frame before continuing.
  await phone.setViewportSize({width:390,height:844});
  await phone.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.removeProperty('--primary');});
  const firstImage=await qr.toDataURL(firstToken,{width:400,margin:4});await phone.evaluate(frame=>{window.__frame=frame;},firstImage);
  await phone.getByRole('button',{name:'Escanear siguiente',exact:true}).click();
  for(const [index,name] of [firstName,secondName].entries()){
   if(index)await scan(secondToken);
   await pc.getByRole('dialog').filter({hasText:name}).waitFor();
   await phone.waitForFunction(()=>window.__tracks.every(t=>t.readyState==='ended'));
   assert.equal(await phone.getByRole('button',{name:/Confirmar asistencia/i}).count(),0);
   await pc.getByRole('button',{name:'MARCAR ASISTENCIA',exact:true}).click();await pc.getByRole('dialog',{name:'Confirmar asistencia',exact:true}).getByRole('button',{name:'Confirmar Asistencia',exact:true}).click();
   await pc.getByText(/Asistencia registrada correctamente/).first().waitFor();await phone.getByRole('heading',{name:'Asistencia confirmada',exact:true}).waitFor();
   await pc.getByRole('button',{name:'Siguiente participante',exact:true}).click();
  }
  assert.equal(unlinks,0);
  await panel(phone).getByRole('button',{name:'Desvincular',exact:true}).click();const response=phone.waitForResponse(r=>r.url().endsWith('/unlink')&&r.request().method()==='POST');await phone.getByRole('dialog',{name:'Desvincular escáner',exact:true}).getByRole('button',{name:'Desvincular',exact:true}).click();assert.equal((await response).status(),200);
  await panel(phone).getByRole('button',{name:'Vincular como escáner',exact:true}).waitFor();
  // Verify the reverse initiation and rejection without resetting either session.
  await panel(pc).getByRole('button',{name:'Habilitar escáner móvil',exact:true}).click();
  await panel(phone).getByRole('button',{name:'Vincular como escáner',exact:true}).click();await panel(phone).getByRole('button',{name:/Vincular a/}).first().click();await approval.waitFor();await approval.getByRole('button',{name:'Rechazar',exact:true}).click();
  await panel(phone).getByRole('button',{name:/Vincular a/}).first().waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  return {browserSessions:2,role:accounts[0].user.role,dedicatedMobileWorkspace:true,onlyTwoPrimaryActions:true,routeEscapePrevented:true,pcDashboardDiscovery:true,normalMobileChoice:true,phoneInitiated:true,pcInitiated:true,pcApprovalOnDashboard:true,incompleteCodeBlocked:true,approvalAndCode:true,invalidQrVisible:true,manualReaderHidden:true,manualPCConfirmation:true,twoConfirmedReads:true,cameraReleased:true,reloadPreservesLink:true,temporaryNetworkRecovery:true,unlinkWithoutLogout:true,requestRejection:true,mobileSafeGeometry:true,physicalCamera:false};
 }finally{for(const c of contexts)await c.close();await browser.close();}
};
