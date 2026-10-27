// Isolated synthetic fixture only; never connects to Render or an email provider.
module.exports = async ({base,api,eventId,account,paymentId}) => {
 const { chromium }=require(process.env.EVENTGRID_PLAYWRIGHT), assert=require('node:assert/strict');
 const browser=await chromium.launch({headless:true,channel:'chrome'}), errors=[];
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({account,eventId})=>{localStorage.setItem('barcamp_token',account.token);localStorage.setItem('barcamp_user',JSON.stringify(account.user));localStorage.setItem('barcamp_current_event_id',eventId);},{account,eventId});
  await page.goto(base+'/sales');await page.getByText('Procedencia de los pagos acreditados',{exact:true}).waitFor();
  await page.getByText('Revisión administrativa de pagos y devoluciones',{exact:true}).click();
  await page.getByLabel('Motivo de la operación',{exact:true}).fill('Solicitud sintética revisada');
  await page.getByLabel('Identificador del pago',{exact:true}).fill(paymentId);
  await page.getByLabel('Importe RD$',{exact:true}).fill('500');
  await page.getByRole('button',{name:'Revisar solicitud',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar operación',exact:true}).click();
  await page.getByText(/Operación registrada/).waitFor();
  await page.getByRole('button',{name:'Aprobado',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar operación',exact:true}).click();
  await page.getByRole('button',{name:'Pendiente de devolución',exact:true}).waitFor();
  const summary=await fetch(api+`/events/${eventId}/finance/summary`,{headers:{Authorization:'Bearer '+account.token}}).then(r=>r.json());
  assert.equal(summary.data.refunded,0);assert.equal(summary.data.netAccredited,1750);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);return {mobileWidth:390,refundRequestAndApproval:true,noTransfer:true,netUnchangedBeforeReturn:true,noHorizontalOverflow:true};
 } finally {await browser.close();}
};
