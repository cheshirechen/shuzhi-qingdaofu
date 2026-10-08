const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const base = process.env.TEST_URL || 'http://localhost:4173/shuzhi-qingdaofu/';
  const expectCloud = process.env.EXPECT_CLOUD === '1';
  const session = process.env.TEST_SESSION || 'ICAN2026';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const dashboardContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const detectorContext = expectCloud ? await browser.newContext({ viewport: { width: 390, height: 844 } }) : dashboardContext;
  const workerContext = expectCloud ? await browser.newContext({ viewport: { width: 390, height: 844 } }) : dashboardContext;
  const errors = [];
  const browserLogs = [];
  const track = page => {
    page.on('pageerror', error => {
      if (/drawImage.*canvas element with a width or height of 0/i.test(error.message)) return;
      if (/wsclient\.send timedout/i.test(error.message)) return;
      errors.push(`${page.url()}: ${error.message}`);
    });
    page.on('console', async message => {
      if (!['warning', 'error'].includes(message.type())) return;
      const details = [];
      for (const argument of message.args()) {
        try { details.push(JSON.stringify(await argument.jsonValue())); }
        catch { details.push(argument.toString()); }
      }
      browserLogs.push(`${page.url()}: ${message.type()}: ${message.text()} | args: ${details.join(' ')}`);
    });
  };
  const dashboard = await dashboardContext.newPage(); track(dashboard);
  const detector = await detectorContext.newPage(); track(detector);
  const worker = await workerContext.newPage(); track(worker);
  fs.mkdirSync('validation', { recursive: true });

  const readMapView = page => page.evaluate(() => {
    const element = document.querySelector('#main-echarts-map');
    const chart = window.echarts?.getInstanceByDom(element);
    const geo = chart?.getOption()?.geo?.[0] || {};
    return { zoom: Number(geo.zoom), center: geo.center, roam: geo.roam };
  });
  const waitForMapZoom = (page, expected) => page.waitForFunction(value => {
    const element = document.querySelector('#main-echarts-map');
    const chart = window.echarts?.getInstanceByDom(element);
    return Number(chart?.getOption()?.geo?.[0]?.zoom) === value;
  }, expected, { timeout: 10000 });
  const settleOfflineShell = async page => {
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !('serviceWorker' in navigator) || Boolean(navigator.serviceWorker.controller));
    await page.reload({ waitUntil: 'domcontentloaded' });
  };

  try {
    await dashboard.goto(`${base}dashboard.html?session=${encodeURIComponent(session)}`, { waitUntil: 'domcontentloaded' });
    await settleOfflineShell(dashboard);
    await dashboard.waitForFunction(() => typeof window.qingdaofuApplyState === 'function', null, { timeout: 30000 });
    if (expectCloud) {
      await dashboard.waitForFunction(
        () => window.__QINGDAOFU_RELAY__?.mode === 'cloudbase' && window.__QINGDAOFU_RELAY__?.connected,
        null,
        { timeout: 30000 },
      );
    }
    await dashboard.keyboard.press('r');
    await dashboard.waitForFunction(
      () => document.querySelector('#event-detail-modal')?.classList.contains('translate-x-full'),
      null,
      { timeout: 20000 },
    );
    await dashboard.waitForSelector('#main-echarts-map canvas', { timeout: 30000 });
    assert.equal(await dashboard.locator('#snap-img').count(), 0, 'dashboard must not contain a photo block');
    assert.equal(await dashboard.locator('#event-list [data-event-kind="historical"]').count(), 10, 'event pool must start with ten historical events');
    assert.equal(await dashboard.locator('#event-list [data-event-kind="live"]').count(), 0, 'event pool must not invent a live event');
    const historyDatesAreBeforeToday = await dashboard.locator('#event-list [data-event-kind="historical"]').evaluateAll(rows => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return rows.every(row => Number(row.dataset.eventTime) < today.getTime());
    });
    assert.equal(historyDatesAreBeforeToday, true, 'historical events must be dated before today');
    await dashboard.screenshot({ path: 'validation/event-pool-idle.png', fullPage: true });
    assert.doesNotMatch(
      await dashboard.locator('body').innerText(),
      /三端云端联动|云端环境待配置/,
      'dashboard must not expose cloud relay wording',
    );

    const senseView = await readMapView(dashboard);
    assert.equal(senseView.zoom, 2.16, 'sense map must use its enlarged initial view');
    assert.equal(senseView.roam, true, 'sense map must remain zoomable and draggable');
    await dashboard.locator('#tab-heat').click();
    await waitForMapZoom(dashboard, 3.04);
    const heatView = await readMapView(dashboard);
    assert.equal(heatView.zoom, 3.04, 'heat map must use its enlarged initial view');
    assert.equal(heatView.roam, true, 'heat map must remain zoomable and draggable');
    await dashboard.locator('#tab-dispatch').click();
    await waitForMapZoom(dashboard, 3.24);
    const dispatchView = await readMapView(dashboard);
    assert.equal(dispatchView.zoom, 3.24, 'dispatch map must focus more closely on the BJUT area');
    assert.equal(dispatchView.roam, true, 'dispatch map must remain zoomable and draggable');
    await dashboard.locator('#tab-sense').click();
    await waitForMapZoom(dashboard, 2.16);

    await detector.setViewportSize({ width: 390, height: 844 });
    await detector.goto(`${base}detector.html?session=${encodeURIComponent(session)}`, { waitUntil: 'domcontentloaded' });
    await settleOfflineShell(detector);
    if (expectCloud) {
      await detector.waitForFunction(() => window.__QINGDAOFU_RELAY__?.mode === 'cloudbase' && window.__QINGDAOFU_RELAY__?.connected, null, { timeout: 30000 });
    }
    await detector.getByRole('button', { name: '开启相机', exact: true }).waitFor({ state: 'visible' });
    await detector.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '开启相机' && !button.disabled), null, { timeout: 180000 });
    assert.match(await detector.locator('header').innerText(), /手机垃圾识别/);
    assert.doesNotMatch(await detector.locator('body').innerText(), /云端联动/, 'detector must not expose cloud relay wording');

    await worker.setViewportSize({ width: 390, height: 844 });
    await worker.goto(`${base}?view=worker&session=${encodeURIComponent(session)}`, { waitUntil: 'domcontentloaded' });
    await settleOfflineShell(worker);
    if (expectCloud) {
      await worker.waitForFunction(() => window.__QINGDAOFU_RELAY__?.mode === 'cloudbase' && window.__QINGDAOFU_RELAY__?.connected, null, { timeout: 30000 });
    }
    await worker.getByRole('button', { name: '进入待命' }).click();
    await worker.getByText('正在等待新任务').waitFor();
    assert.doesNotMatch(
      await worker.locator('body').innerText(),
      /云端联机|通道待配置/,
      'worker must not expose cloud relay wording',
    );

    await detector.getByText('现场演示保障', { exact: true }).click();
    await detector.getByRole('button', { name: '手动发送事件信号' }).click();
    await dashboard.waitForFunction(() => !document.querySelector('#event-detail-modal').classList.contains('translate-x-full'));
    assert.match(await dashboard.locator('#event-detail-modal').innerText(), /北京工业大学/);
    assert.match(await dashboard.locator('#event-detail-modal').innerText(), /道路抛洒物/);
    assert.equal(await dashboard.locator('#event-detail-modal img').count(), 0, 'event drawer must not render an image');
    assert.equal(await dashboard.locator('#event-list [data-event-kind="live"]').count(), 1, 'only the detector signal may add a live event');

    await worker.getByText('新任务').waitFor({ timeout: 20000 });
    assert.equal(await worker.locator('.task-card img').count(), 0, 'worker task card must not render an image');
    assert.match(await worker.locator('.task-card').innerText(), /< 1 m/);
    const onsiteDistance = await dashboard.evaluate(() => {
      const chart = window.echarts?.getInstanceByDom(document.querySelector('#main-echarts-map'));
      const series = chart?.getOption()?.series || [];
      const worker = series.find(item => item.name === '环卫人员03')?.data?.[0]?.value;
      const event = series.find(item => item.id === 'bjut-demo-event')?.data?.[0]?.value;
      return worker && event ? Math.hypot(worker[0] - event[0], worker[1] - event[1]) : null;
    });
    assert.ok(onsiteDistance !== null && onsiteDistance < 0.00001, 'worker and event coordinates must be within the same onsite point');
    await dashboard.screenshot({ path: 'validation/dispatch-same-point.png', fullPage: true });
    await worker.getByRole('button', { name: '接单' }).click();
    await dashboard.waitForFunction(() => document.querySelector('#detail-status')?.textContent.includes('处理中'));
    await worker.getByRole('button', { name: '完成' }).click();
    await dashboard.waitForFunction(() => document.querySelector('#detail-status')?.textContent.includes('已完成'));

    await dashboard.screenshot({ path: 'validation/original-dashboard-flow.png', fullPage: true });
    await detector.screenshot({ path: 'validation/original-detector.png', fullPage: true });
    await worker.screenshot({ path: 'validation/worker-completed.png', fullPage: true });
    assert.deepEqual(errors, []);
    await dashboard.keyboard.press('r');
    await worker.getByText('正在等待新任务').waitFor({ timeout: 20000 });
    await detector.getByRole('button', { name: '手动发送事件信号' }).waitFor({ state: 'visible', timeout: 20000 });
    console.log(JSON.stringify({ passed: true, checks: [expectCloud ? 'three-isolated-cloud-clients' : 'browser-local-relay', 'detector-to-dashboard-signal', 'cloud-status-hidden', 'static-historical-event-pool', 'only-live-signal-adds-event', 'three-map-presets', 'all-maps-remain-interactive', 'same-onsite-map-point', 'chaoyang-map-rendered', 'drawer-has-no-photo', 'worker-card-has-no-photo', 'detector-ready', 'reset-enables-next-round', 'dispatch-received', 'accepted', 'completed'] }, null, 2));
  } catch (error) {
    console.error(error.stack);
    if (errors.length) console.error(errors.join('\n'));
    if (browserLogs.length) console.error(browserLogs.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
