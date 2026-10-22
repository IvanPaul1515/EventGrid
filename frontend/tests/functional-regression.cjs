// Simulated APIs only. No deployed records or SMTP are touched.
const { chromium } = require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178';
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
 const checks = [];
 try {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
   const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, permissions: ['camera'] });
   const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
   const user = { id: 'fake-user', fullName: 'Simulated User', email: 'fake@example.invalid', role };
   const event = { id: 'fake-event', name: 'BarCamp RD 2026', year: 2026, status: 'ACTIVE', isDefault: true, settings: { tshirtSizesEnabled: true, tshirtSizes: ['M', 'L'] } };
   const categories = ['Geek Gold', 'Geek Silver', 'Geek'].map(name => ({ name, value: null }));
   const sponsors = []; let qrFailed = false, checkins = 0, lastCheckin;
   await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method(); let data = [];
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': connected\n\n' });
    if (path.endsWith('/demo-access')) return route.fulfill({ json: { enabled: true } });
    if (path.endsWith('/demo-login')) data = { token: 'fake-token', user };
    else if (path.endsWith('/auth/me')) data = user;
    else if (path.endsWith('/events')) data = [event];
    else if (path.endsWith('/stats') || path.endsWith('/financial-summary')) data = null;
    else if (path.endsWith('/sponsors/categories')) data = categories;
    else if (path.endsWith('/sponsors/summary')) data = {};
    else if (path.endsWith('/sponsors') && method === 'POST') { data = { ...route.request().postDataJSON(), id: String(sponsors.length), committedAmount: 100, receivedAmount: 0, pendingBalance: 100, status: 'PENDING', payments: [] }; sponsors.push(data); }
    else if (path.endsWith('/sponsors')) data = { items: sponsors.filter(s => !url.searchParams.get('category') || s.category === url.searchParams.get('category')), pagination: { total: sponsors.length, page: 1, totalPages: 1 }, summary: {} };
    else if (/\/sponsors\/\d+$/.test(path)) {
     data = sponsors.find(s => s.id === path.split('/').pop()); if (method === 'PUT') Object.assign(data, route.request().postDataJSON());
    }
    else if (path.endsWith('/ticket-types')) data = [{ id: 'ticket', name: 'General', price: 100 }];
    else if (path.endsWith('/inventory')) data = { items: [], stats: {} };
    else if (path.endsWith('/counters')) data = { totalRegistrations: 0, attendedCount: 0, pendingCount: 0 };
    else if (path.endsWith('/daily-sales')) data = null;
    else if (path.endsWith('/qr/scan')) data = { valid: true, status: 'VALID', canCheckIn: true, message: 'Valid simulated QR', registration: { id: 'fake-registration', registrationNumber: 'TEST-001', status: 'CONFIRMED', tshirtSize: 'M', participant: { fullName: 'Fictitious Person', email: 'fake@example.invalid' }, ticketType: { name: 'General' } } };
    else if (path.endsWith('/attendance/check-in')) {
     if (!qrFailed) { qrFailed = true; return route.fulfill({ status: 503, json: { message: 'Simulated offline failure' } }); }
     checkins++; lastCheckin = route.request().postDataJSON(); await new Promise(r => setTimeout(r, 100)); data = {};
    }
    await route.fulfill({ json: { status: 'success', data, pagination: { total: 0, page: 1, totalPages: 1 }, counters: {} } });
   });
   await page.goto(base + '/login');
   await page.getByRole('button', { name: role === 'ADMIN' ? /^Admin/ : role === 'OPERATOR' ? /^Operador/ : /^Consulta/ }).click();
   await page.waitForURL(base + '/');
   await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
   assert.equal(await page.getByRole('link', { name: 'Ediciones', exact: true }).count(), role === 'ADMIN' ? 1 : 0);
   assert.equal(await page.getByText(/EventGrid Admin$/i).count(), 0);
   await page.getByRole('link', { name: 'Participantes', exact: true }).click();
   if (role !== 'ADMIN') assert.equal(await page.getByTitle('Edición asignada').isDisabled(), true);
   await page.goto(base + '/editions');
   if (role !== 'ADMIN') await page.getByText('Acceso No Autorizado', { exact: true }).waitFor();
   else assert.equal(await page.getByText('Acceso No Autorizado', { exact: true }).count(), 0);
   if (role === 'VIEWER') {
    await page.goto(base + '/'); assert.equal(await page.getByRole('button', { name: 'Escanear QR', exact: true }).count(), 0);
    await page.goto(base + '/participants'); assert.equal(await page.getByRole('button', { name: 'Nuevo Participante', exact: true }).count(), 0);
   }
   if (role === 'ADMIN') {
    await page.goto(base + '/sponsors');
    for (const category of categories) {
     await page.getByRole('button', { name: 'Nuevo Patrocinador', exact: true }).click(); const modal = page.getByRole('dialog');
     await modal.locator('input').first().fill('Fictitious ' + category.name);
     await modal.getByLabel('Categoría de patrocinio').selectOption(category.name);
     const amount = modal.locator('input[inputmode="decimal"]'); await amount.fill('100');
     if (process.env.EVENTGRID_SCREENSHOT_DIR && category.name === 'Geek Gold') await page.screenshot({path: require('node:path').join(process.env.EVENTGRID_SCREENSHOT_DIR, 'eventgrid-sponsor-mobile.png')});
     const notes = modal.locator('textarea').last(); await notes.focus();
     await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 380 }); visualViewport.dispatchEvent(new Event('resize')); });
     await page.waitForTimeout(350);
     const b = await notes.boundingBox(); assert(b.y >= 0 && b.y + b.height <= 380, JSON.stringify(b));
     assert.equal(await modal.evaluate(e => e.scrollWidth > e.clientWidth), false);
     assert.equal(await page.locator('[data-app-scroll]').evaluate(e => getComputedStyle(e).overflowY), 'hidden');
     await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
     await modal.getByRole('button', { name: 'Registrar Patrocinador', exact: true }).click(); await modal.waitFor({ state: 'hidden' });
    }
    await page.getByLabel('Filtrar por categoría').selectOption('Geek Silver');
    await page.getByRole('row').filter({ hasText: 'Fictitious Geek Silver' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByTitle('Editar', { exact: true }).click();
    await page.getByLabel('Categoría de patrocinio').selectOption('Geek Gold');
    await page.getByRole('button', { name: 'Guardar Cambios', exact: true }).click();
    checks.push('Sponsor create/edit, legacy-compatible categories, mobile keyboard and no horizontal overflow');
   }
   await page.goto(base + '/participants');
   const search = page.locator('input.mobile-search-empty'); await search.waitFor();
   // Page autofocus is allowed to finish before testing the empty, blurred state.
   await page.locator('input').first().blur();
   const example = page.locator('.mobile-search-example');
   assert.equal(await example.evaluate(e => getComputedStyle(e).display), 'block');
   assert.equal(await example.locator('span').evaluate(e => getComputedStyle(e).animationName), 'search-example-pan');
   await page.locator('input').first().focus(); assert.equal(await example.evaluate(e => getComputedStyle(e).visibility), 'hidden');
   await page.locator('input').first().fill('Fictitious'); assert.equal(await example.evaluate(e => getComputedStyle(e).visibility), 'hidden');
   await page.locator('input').first().fill(''); await page.locator('input').first().blur();
   await page.emulateMedia({ reducedMotion: 'reduce' });
   assert.equal(await example.locator('span').evaluate(e => getComputedStyle(e).animationName), 'none');
   await page.setViewportSize({ width: 1440, height: 900 });
   assert.equal(await example.evaluate(e => getComputedStyle(e).display), 'none');
   if (process.env.EVENTGRID_SCREENSHOT_DIR && role === 'ADMIN') await page.screenshot({path: require('node:path').join(process.env.EVENTGRID_SCREENSHOT_DIR, 'eventgrid-participants-desktop-current.png')});
   await page.goto(base + '/');
   const main = page.locator('[data-app-scroll]'); await page.getByRole('button', { name: 'Control de Asistencia', exact: true }).waitFor();
   await main.evaluate(e => e.scrollTop = 600); assert((await main.evaluate(e => e.scrollTop)) > 0);
   await page.getByRole('link', { name: 'Participantes', exact: true }).click(); await page.locator('input').first().waitFor();
   assert.equal(await main.evaluate(e => e.scrollTop), 0);
   if (role === 'OPERATOR') {
    await page.goto(base + '/'); await page.getByRole('button', { name: 'Escanear QR', exact: true }).click();
    await page.waitForURL(base + '/attendance');
    const qr = page.getByRole('dialog', { name: /de entradas QR/ });
    await qr.getByRole('button', { name: 'Lector USB / Manual', exact: true }).click();
    await qr.locator('input').fill('fake-qr'); await qr.getByRole('button', { name: 'Validar', exact: true }).click();
    assert.equal(checkins, 0);
    await qr.getByRole('button', { name: 'MARCAR ASISTENCIA AHORA', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirmar asistencia', exact: true });
    assert(await confirm.getByRole('button', { name: /^M/ }).getAttribute('class').then(v => v.includes('bg-primary')));
    await confirm.getByRole('button', { name: /^L/ }).click();
    page.once('dialog', d => d.accept()); await confirm.getByRole('button', { name: 'Confirmar Asistencia', exact: true }).click();
    assert.equal(checkins, 0); assert.equal(await confirm.isVisible(), true);
    await confirm.getByRole('button', { name: 'Confirmar Asistencia', exact: true }).evaluate(e => { e.click(); e.click(); });
    await qr.waitFor({ state: 'hidden' }); assert.equal(checkins, 1); assert.equal(lastCheckin.tshirtSize, 'L');
    await page.getByText('Asistencia confirmada', { exact: true }).waitFor();
    checks.push('Dashboard reuses QR; explicit confirmation, previous size, changed size, failure without false success, one request, returns to attendance');
   }
   assert.deepEqual(errors, []); checks.push(role + ': demo login, nav/route permissions, branding, mobile placeholder/reduced motion, desktop placeholder, scroll reset');
   await context.close();
  }
  console.log(JSON.stringify({ checks }, null, 2));
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
