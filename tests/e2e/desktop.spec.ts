import { expect, test } from '@playwright/test';
import { apiFixture } from '../fixtures';
import { normalize } from '../../src/weather/providers';
import { BORDEAUX } from '../../src/types';

test('le mode bureau ouvre le widget compact et garde uniquement la timeline en mode étendu', async ({ page }) => {
  const data = normalize(apiFixture(Date.now()), BORDEAUX, new Date().toISOString());
  // Test-only bridge: native storage/window calls are recorded without launching Windows binaries.
  await page.addInitScript(({ weather }) => {
    const target = window as unknown as {
      isTauri: boolean;
      __nativeCalls: Array<{ command: string; args: unknown }>;
      __TAURI_INTERNALS__: Record<string, unknown>;
    };
    target.isTauri = true;
    target.__nativeCalls = [];
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      invoke: async (command: string, args: Record<string, unknown>) => {
        target.__nativeCalls.push({ command, args });
        if (command === 'read_value') return String(args.key).startsWith('weather:') ? JSON.stringify(weather) : null;
        return null;
      },
    };
  }, { weather: data });

  await page.setViewportSize({ width: 660, height: 410 });
  await page.goto('/');
  await expect(page.locator('.native-app.compact-mode')).toBeVisible();
  await expect(page.getByText('Pluie faible', { exact: true })).toBeVisible();
  await expect(page.locator('.page-heading, .side-column, .app-footer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fermer WeatherGlass' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(410);
  await page.screenshot({ path: 'test-results/desktop-widget-compact.png' });

  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.setViewportSize({ width: 660, height: 780 });
  await expect(page.getByText('Les prochaines heures', { exact: true })).toBeVisible();
  await expect(page.locator('.chart-column')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(780);
  await expect(page.locator('.page-heading, .side-column, .app-footer')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: Array<{ command: string }> }).__nativeCalls.filter(call => call.command === 'plugin:window|set_size').length)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/desktop-widget-expanded.png' });

  await page.getByRole('button', { name: 'Ouvrir les paramètres' }).click();
  await expect(page.getByRole('dialog', { name: 'Personnaliser WeatherGlass' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer les paramètres' }).click();
});
