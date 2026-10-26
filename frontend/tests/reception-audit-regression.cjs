
const {chromium}=require(process.env.EVENTGRID_PLAYWRIGHT||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
for(const width of [320,390,412,844,1440]){
 const c=await b.newContext({viewport:{width,height:900},hasTouch:width<1024}),p=await c.newPage();p.setDefaultTimeout(15000);let checkins=0, uncertainRead=true;
 const event={id:'qa',name:'QA tariff 2030',year:2030,status:'ACTIVE',isDefault:true,settings:{tshirtSizesEnabled:true,tshirtSizes:['M','L']}},user={id:'qa-user',role:'ADMIN',email:'qa@example.invalid',fullName:'QA User'};
 await p.addInitScript(user=>{localStorage.setItem('barcamp_token','mock');localStorage.setItem('barcamp_user',JSON.stringify(user));},user);
 await p.route('**/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname;let data=[];
 if(path.endsWith('/stream'))return r.fulfill({contentType:'text/event-stream',body:': connected'+String.fromCharCode(10,10)});
 if(path.endsWith('/auth/me'))data=user;else if(path.endsWith('/events'))data=[event];
 else if(path.endsWith('/events/qa'))data={...event,ticketTypes:[{id:'tariff',name:'Entrada General',price:315,isActive:true},{id:'other',name:'Other tariff',price:525,isActive:true}],paymentMethods:[],salesResponsibles:[]};
 else if(path.endsWith('/inventory'))data={items:[{size:'M',isActive:true,availableQuantity:3},{size:'L',isActive:true,availableQuantity:2}],stats:{}};
 else if(path.endsWith('/attendance/check-in')){checkins++;return r.abort('connectionreset');}
 else if(path.endsWith('/participants/uncertain')){if(uncertainRead)return r.abort('connectionreset');data={id:'uncertain',attended:true,tshirtDelivered:true,participant:{fullName:'QA Participant'}};}
 else if(path.endsWith('/attendance/counters'))data={attendedCount:1,totalRegistrations:1,pendingCount:0};
 else if(path.endsWith('/stats')||path.endsWith('/financial-summary'))data=null;
 await r.fulfill({json:{data,pagination:{page:1,total:0,totalPages:1},counters:{attendedCount:0,totalRegistrations:0,pendingCount:0}}});
 });
 await p.goto('http://127.0.0.1:5178/participants');await p.getByRole('button',{name:'Nuevo Participante',exact:true}).click();const d=p.getByRole('dialog');await p.getByLabel('Tarifa oficial',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('output[aria-label="Tarifa oficial"]').textContent==='Entrada General');
 assert.equal(await d.locator('select[aria-label="Tarifa"]').count(),0);
 assert.equal(await d.getByLabel('Precio de la tarifa').textContent(),'315.00');assert.equal(await d.getByLabel('Monto pagado').inputValue(),'0.00');
 await d.getByLabel('Monto pagado').fill('100');
 await d.getByRole('checkbox',{name:'Registrar como Entrada de Cortesía'}).check();assert.equal(await d.getByLabel('Precio de la tarifa').textContent(),'0.00');assert(await d.getByLabel('Monto pagado').isDisabled());assert.equal(await d.locator('option[value=ATTENDED]').count(),0);
 assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await p.goto('http://127.0.0.1:5178/login');
 const result=await p.evaluate(async()=>{const {attendanceService}=await import('/src/services/attendance.service.ts');try{await attendanceService.checkIn('uncertain','M',true);return 'false success';}catch(e){return e.message;}});
 assert.match(result,/sin confirmar/);assert.equal(checkins,1);uncertainRead=false;
 const persisted=await p.evaluate(async()=>{const {attendanceService}=await import('/src/services/attendance.service.ts');return await attendanceService.checkIn('uncertain','M',true);});assert.equal(persisted.registration.attended,true);assert.equal(persisted.registration.tshirtDelivered,true);assert.equal(checkins,1);
 // Render the real confirmation component, not a mirrored implementation.
 await p.evaluate(async()=>{
 const reactModule=await import('/node_modules/.vite/deps/react.js');const React=reactModule.default||reactModule;const dom=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=dom.createRoot||dom.default.createRoot;const {CheckInConfirmModal}=await import('/src/components/attendance/CheckInConfirmModal.tsx');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 window.confirmProps={isOpen:true,onClose:()=>{},onConfirm:async(size,delivered)=>{window.confirmed={size,delivered}},participantName:'QA Participant',registrationNumber:'QA-1',ticketTypeName:'QA',tshirtEnabled:true,availableSizes:['M','L'],eventId:'qa',initialTshirtSize:'M'};
 window.renderConfirm=props=>root.render(React.createElement(CheckInConfirmModal,{...window.confirmProps,...props}));window.renderConfirm({});
 });
 const now=p.getByRole('radio',{name:'Entregar ahora',exact:true});await now.waitFor();await p.waitForTimeout(150);assert(await now.isChecked());
 await p.getByRole('radio',{name:'Registrar entrega pendiente',exact:true}).check();await p.getByRole('button',{name:/^L\s*2$/}).click();assert(await p.getByRole('radio',{name:'Registrar entrega pendiente',exact:true}).isChecked());
 await p.evaluate(()=>window.renderConfirm({registrationNumber:'QA-2',initialTshirtSize:'L'}));await p.waitForTimeout(150);assert(await now.isChecked());
 await c.close();console.log(width+'px PASS: configured tariff, no invented payment, courtesy, stable delivery preference/reset, unknown check-in reconciled without duplicate POST');
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
