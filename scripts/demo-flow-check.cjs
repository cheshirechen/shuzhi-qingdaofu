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

  const readMapView = page => page.evaluate(() => {
    const element = document.querySelector('#main-echarts-map');
    const chart = window.echarts?.getInstanceByDom(element);
    const geo = chart?.getOption()?.geo?.[0] || {};
    return { zoom: Number(geo.zoom), center: geo.center, roam: geo.roam };
  });

  try {
    await dashboard.goto(`${base}dashboard.html?session=ICAN2026`, { waitUntil: 'domcontentloaded' });
    await dashboard.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
    });
    await dashboard.waitForFunction(() => !('serviceWorker' in navigator) || Boolean(navigator.serviceWorker.controller));
    await dashboard.reload({ waitUntil: 'domcontentloaded' });
    await dashboard.waitForFunction(() => typeof window.qingdaofuApplyState === 'function', null, { timeout: 30000 });
    if (process.env.EXPECT_CLOUD === '1') {
      await dashboard.waitForFunction(
        () => document.body.innerText.includes('云端联机'),
        null,
        { timeout: 30000 },
      );
    }
    await dashboard.waitForSelector('#main-echarts-map canvas', { timeout: 30000 });
    assert.equal(await dashboard.locator('#snap-img').count(), 0, 'dashboard must not contain a photo block');

    const senseView = await readMapView(dashboard);
    assert.equal(senseView.zoom, 1.08, 'sense map must use its medium initial view');
    assert.equal(senseView.roam, true, 'sense map must remain zoomable and draggable');
    await dashboard.locator('#tab-heat').click();
    const heatView = await readMapView(dashboard);
    assert.equal(heatView.zoom, 1.52, 'heat map must use its closer initial view');
    assert.equal(heatView.roam, true, 'heat map must remain zoomable and draggable');
    await dashboard.locator('#tab-dispatch').click();
    const dispatchView = await readMapView(dashboard);
    assert.equal(dispatchView.zoom, 1.62, 'dispatch map must focus on the BJUT area');
    assert.equal(dispatchView.roam, true, 'dispatch map must remain zoomable and draggable');
    await dashboard.locator('#tab-sense').click();

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
    console.log(JSON.stringify({ passed: true, checks: ['three-map-presets', 'all-maps-remain-interactive', 'chaoyang-map-rendered', 'drawer-has-no-photo', 'detector-ready', 'dispatch-received', 'accepted', 'completed'] }, null, 2));
  } catch (error) {
    console.error(error.stack);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
