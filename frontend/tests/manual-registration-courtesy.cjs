const { chromium } = require(process.env.EVENTGRID_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = process.env.EVENTGRID_TEST_URL || 'http://127.0.0.1:5178';
  try {
    for (const width of [390, 1440]) for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const user = { id: 'qa', role, fullName: 'QA '+role, email: 'qa@example.invalid' };
      const event = { id: 'qa', name: 'QA edition', year: 2026, isDefault: true, status: 'ACTIVE', settings: {} };
      await page.addInitScript(u => { localStorage.setItem('barcamp_token', 'mock'); localStorage.setItem('barcamp_user', JSON.stringify(u)); }, user);
      let submitted;
      await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname; let data = [];
        if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': connected\n\n' });
        if (path.endsWith('/auth/me')) data = user;
        else if (path.endsWith('/events')) data = [event];
        else if (path.endsWith('/events/qa')) data = { ...event, ticketTypes: [{ id: 'general', name: 'Entrada General', price: 2000, isActive: true }, { id: 'preventa', name: 'Preventa', price: 1000, isActive: true }], paymentMethods: [], salesResponsibles: [] };
        else if (path.endsWith('/participants') && req.method() === 'POST') {
          submitted = req.postDataJSON();
          return route.fulfill({ status: 400, json: { message: 'Respuesta QA controlada: no se escribió ningún dato.' } });
        }
        await route.fulfill({ json: { data, pagination: { total: 0, page: 1, totalPages: 1 }, stats: {} } });
      });
      await page.goto(base+'/participants');
      if (width === 1440) {
        const sidebar = page.locator('aside');
        await sidebar.getByText('Desarrollado por Iván Marcelino', { exact: true }).waitFor();
      }
      const create = page.getByRole('button', { name: 'Nuevo Participante', exact: true });
      if (role === 'VIEWER') { assert.equal(await create.count(), 0); await context.close(); continue; }
      await create.click();
      const dialog = page.getByRole('dialog').first();
      await page.waitForFunction(() => document.querySelector('output[aria-label="Tarifa oficial"]')?.textContent === 'Entrada General');
      assert.equal(await dialog.locator('select[aria-label="Tarifa"]').count(), 0);
      assert.equal(await dialog.getByLabel('Precio de la tarifa').textContent(), '2,000.00');
      await dialog.getByRole('checkbox', { name: 'Registrar como Entrada de Cortesía' }).click();
      if (role === 'OPERATOR') {
        const approval = page.getByRole('dialog', { name: 'Autorización administrativa' }); await approval.waitFor();
        await approval.getByLabel('Correo del administrador').fill('admin@example.invalid');
        await approval.getByLabel('Contraseña del administrador').fill('MockPassword!Only');
        await approval.getByRole('button', { name: 'Confirmar autorización' }).click();
      } else assert.equal(await page.getByRole('dialog', { name: 'Autorización administrativa' }).count(), 0);
      assert.equal(await dialog.getByLabel('Precio de la tarifa').textContent(), '0.00');
      assert(await dialog.getByLabel('Monto pagado').isDisabled());
      const inputs = dialog.locator('input[type="text"]');
      await inputs.nth(0).fill('Prueba'); await inputs.nth(1).fill('QA');
      await dialog.locator('input[type="email"]').fill('qa@example.invalid');
      await dialog.locator('input[placeholder="ej. Ponente, Becado, Voluntario, Prensa"]').fill('Invitado QA');
      await dialog.getByRole('button', { name: 'Registrar Participante', exact: true }).click();
      await page.getByText('Respuesta QA controlada: no se escribió ningún dato.', { exact: true }).waitFor();
      assert.equal(submitted.isCourtesy, true); assert.equal(submitted.ticketPrice, 0); assert.equal(submitted.amountPaid, 0);
      if (role === 'OPERATOR') assert.equal(submitted.courtesyApproval.email, 'admin@example.invalid');
      else assert.equal(submitted.courtesyApproval, undefined);
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
      await context.close(); console.log(width+'px '+role+' PASS');
    }
    console.log('PASS: viewer blocked, official read-only tariff, admin and elevated operator courtesy, responsive branding; all API calls mocked.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
