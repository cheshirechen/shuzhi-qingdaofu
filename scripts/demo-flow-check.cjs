const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const base = process.env.TEST_URL || 'http://localhost:4173/shuzhi-qingdaofu/';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const track = page => page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  const dashboard = await context.newPage(); track(dashboard);
  const detector = await context.newPage(); track(detector);
  const worker = await context.newPage(); track(worker);

  try {
    await dashboard.goto(`${base}dashboard.html?session=ICAN2026`, { waitUntil: 'domcontentloaded' });
    await dashboard.waitForFunction(() => typeof window.qingdaofuApplyState === 'function', null, { timeout: 30000 });
    await dashboard.waitForSelector('#main-echarts-map canvas', { timeout: 30000 });
    assert.equal(await dashboard.locator('#snap-img').count(), 0, 'dashboard must not contain a photo block');

    await detector.setViewportSize({ width: 390, height: 844 });
    await detector.goto(`${base}detector.html?session=ICAN2026`, { waitUntil: 'domcontentloaded' });
    await detector.getByRole('button', { name: '开启相机', exact: true }).waitFor({ state: 'visible' });
    await detector.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '开启相机' && !button.disabled), null, { timeout: 180000 });
    assert.match(await detector.locator('header').innerText(), /手机垃圾识别/);

    await worker.setViewportSize({ width: 390, height: 844 });
    await worker.goto(`${base}?view=worker&session=ICAN2026`, { waitUntil: 'domcontentloaded' });
    await worker.getByRole('button', { name: '进入待命' }).click();
    await worker.getByText('正在等待新任务').waitFor();

    await dashboard.keyboard.press('d');
    await dashboard.waitForFunction(() => !document.querySelector('#event-detail-modal').classList.contains('translate-x-full'));
    assert.match(await dashboard.locator('#event-detail-modal').innerText(), /北京工业大学/);
    assert.match(await dashboard.locator('#event-detail-modal').innerText(), /道路抛洒物/);
    assert.equal(await dashboard.locator('#event-detail-modal img').count(), 0, 'event drawer must not render an image');

    await worker.getByText('新任务').waitFor({ timeout: 20000 });
    await worker.getByRole('button', { name: '接单' }).click();
    await dashboard.waitForFunction(() => document.querySelector('#detail-status')?.textContent.includes('处理中'));
    await worker.getByRole('button', { name: '完成' }).click();
    await dashboard.waitForFunction(() => document.querySelector('#detail-status')?.textContent.includes('已完成'));

    fs.mkdirSync('validation', { recursive: true });
    await dashboard.screenshot({ path: 'validation/original-dashboard-flow.png', fullPage: true });
    await detector.screenshot({ path: 'validation/original-detector.png', fullPage: true });
    await worker.screenshot({ path: 'validation/worker-completed.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['chaoyang-map-rendered', 'drawer-has-no-photo', 'detector-ready', 'dispatch-received', 'accepted', 'completed'] }, null, 2));
  } catch (error) {
    console.error(error.stack);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
