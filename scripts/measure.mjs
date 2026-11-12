import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Live smoke check: no mocked API responses are used by this script.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, colorScheme: 'dark' });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/open-meteo|rainviewer|openstreetmap/.test(request.url())) requests.push(request.url()); });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const start = performance.now();
  await page.goto('http://127.0.0.1:1420');
  await page.waitForFunction(() => /\d/.test(document.querySelector('.compact-current .temperature')?.textContent ?? ''), { timeout: 30_000 });
  const startupMs = Math.round(performance.now() - start);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(6000);
  const before = await session.send('Performance.getMetrics');
  await page.waitForTimeout(5000);
  const after = await session.send('Performance.getMetrics');
  const metric = (set, name) => set.metrics.find(m => m.name === name)?.value ?? 0;
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/live-compact.png', fullPage: true });
  const report = {
    measuredAt: new Date().toISOString(), runtime: 'Chromium headless / Vite development / live APIs',
    startupToWeatherMs: startupMs,
    jsHeapUsedMiB: +(metric(after, 'JSHeapUsedSize') / 1024 ** 2).toFixed(2),
    mainThreadBusyPercentOver5Seconds: +((metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) / 5 * 100).toFixed(2),
    weatherRequests: requests.filter(u => u.includes('api.open-meteo.com')).length,
    radarRequestsWhileClosed: requests.filter(u => /rainviewer|openstreetmap/.test(u)).length,
    pageErrors: errors, currentDisplay: await page.locator('.compact-current').innerText(),
    limits: 'Browser measurements only. These are not total application RAM, native CPU, or Windows startup measurements.',
  };
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.locator('.mode-expanded').waitFor();
  await page.screenshot({ path: 'docs/screenshots/live-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Semaine', exact: true }).click();
  report.forecastDays = await page.locator('.daily-card').count();
  report.weatherRequestsAfterExpansion = requests.filter(u => u.includes('api.open-meteo.com')).length;
  await page.screenshot({ path: 'docs/screenshots/live-week.png', fullPage: true });
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  const radarSlider = page.getByRole('slider', { name: 'Heure du radar' });
  await radarSlider.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('.radar-controls input')?.getAttribute('max') !== '0', { timeout: 25_000 });
  await page.waitForTimeout(2500);
  report.liveRadarCheck = {
    frames: Number(await radarSlider.getAttribute('max')) + 1,
    loadedTiles: await page.locator('.leaflet-tile-loaded').count(),
    warnings: await page.locator('.radar-modal .inline-warning').allTextContents(),
  };
  await page.screenshot({ path: 'docs/screenshots/live-radar.png', fullPage: true });
  await page.getByRole('button', { name: 'Fermer le radar' }).click();
  await writeFile('docs/performance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || report.radarRequestsWhileClosed) process.exitCode = 1;
} finally { await browser.close(); }
