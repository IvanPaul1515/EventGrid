// Mock decoder + real Chrome fake MediaStream: no production data or physical camera.
const { chromium } = require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const user = { id: 'qa', role: 'ADMIN', fullName: 'QA', email: 'qa@example.invalid' };
  const event = { id: 'qa-event', name: 'QA 2026', year: 2026, status: 'ACTIVE', settings: { tshirtSizesEnabled: false } };
  let checkins = 0;
  await page.addInitScript(user => { localStorage.setItem('barcamp_user', JSON.stringify(user)); localStorage.setItem('barcamp_token', 'mock'); }, user);
  await page.route('**/node_modules/.vite/deps/html5-qrcode.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
   export const Html5QrcodeScannerState = { NOT_STARTED: 1, SCANNING: 2 };
   export class Html5Qrcode {
    constructor(id) { this.id=id; this.state=1; this.isScanning=false; }
    getState(){return this.state;}
    async start(camera,options,decode){this.stream=await navigator.mediaDevices.getUserMedia({video:true}); window.__testStream=this.stream;
     const video=document.createElement('video'); video.muted=true; video.srcObject=this.stream; document.getElementById(this.id).appendChild(video); await video.play(); this.state=2;this.isScanning=true;window.__testDecode=decode;}
    async stop(){this.stream?.getTracks().forEach(t=>t.stop());this.isScanning=false;this.state=1;}
    clear(){document.getElementById(this.id)?.replaceChildren();} pause(){} resume(){}
   }` }));
  await page.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname; let data = [];
   if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': ready\n\n' });
   if (path.endsWith('/auth/me')) data = user;
   else if (path.endsWith('/events')) data = [event];
   else if (path.endsWith('/counters')) data = {};
   else if (path.endsWith('/daily-sales')) data = null;
   else if (path.endsWith('/qr/scan')) data = { valid: true, canCheckIn: true, status: 'VALID', message: 'Mock decoded', registration: { id: 'fake-reg', registrationNumber: 'TEST', participant: { fullName: 'Fictitious Participant' } } };
   else if (path.endsWith('/check-in')) { checkins++; data = {}; }
   await route.fulfill({ json: { data, pagination: { total: 0, totalPages: 1 }, counters: {} } });
  });
  await page.goto((process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178') + '/attendance');
  await page.getByRole('button', { name: 'Escanear QR', exact: true }).click();
  await page.waitForFunction(() => window.__testDecode && window.__testStream.getTracks().some(t => t.readyState === 'live'));
  await page.evaluate(() => window.__testDecode('camera-test-token'));
  await page.getByText('Fictitious Participant', { exact: true }).waitFor();
  assert.equal(await page.locator('#qr-square-viewport').count(), 0);
  assert(await page.evaluate(() => window.__testStream.getTracks().every(t => t.readyState === 'ended')));
  assert.equal(checkins, 0); assert.equal(await page.getByRole('dialog', { name: 'Confirmar asistencia', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Confirmar asistencia', exact: true }).click();
  await page.getByText('Asistencia confirmada', { exact: true }).waitFor(); assert.equal(checkins, 1); assert.deepEqual(errors, []);
  console.log('PASS: decoded camera releases every track, removes frozen frame, waits for a single explicit confirmation and returns to attendance');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
