import { expect, test } from '@playwright/test';
import { weekFixture } from '../fixtures';
import { normalize } from '../../src/weather/providers';
import { BORDEAUX } from '../../src/types';

test('contrat natif : transitions, transparence des thèmes et placement bureau', async ({ page }) => {
  const data = normalize(weekFixture(), BORDEAUX, new Date().toISOString());
  // This bridge checks frontend/native calls, not Windows composition or monitor placement.
  await page.addInitScript(({ weather }) => {
    const target = window as unknown as { isTauri: boolean; __nativeCalls: Array<{ command: string; args: Record<string, unknown> }>; __TAURI_INTERNALS__: Record<string, unknown> };
    target.isTauri = true; target.__nativeCalls = [];
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (command: string, args: Record<string, unknown>) => {
        target.__nativeCalls.push({ command, args });
        if (command === 'read_value') return String(args.key).startsWith('weather:') ? JSON.stringify(weather) : args.key === 'preferences' ? JSON.stringify({ settings: { displayMode: 'floating', alwaysOnTop: true }, favorites: [] }) : null;
        if (command === 'widget_transition') return { x: 20, y: 30, width: args.expanded ? 1000 : 320, height: args.expanded ? 790 : 180 };
        return 1;
      },
    };
  }, { weather: data });
  await page.setViewportSize({ width: 320, height: 180 }); await page.goto('/');
  await expect(page.locator('.native-app.mode-compact')).toBeVisible();
  await expect(page.getByText('Pluie faible', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(180);
  await page.screenshot({ path: 'test-results/v3-native-compact.png' });
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.setViewportSize({ width: 1000, height: 790 });
  await expect(page.locator('.native-app.mode-expanded')).toBeVisible();
  await expect(page.locator('.forecast-point')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/v3-native-expanded.png' });
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const theme of ['Clair', 'Sombre', 'Système']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      for (const selector of ['html', 'body', '#root', '.native-app']) {
        await expect(page.locator(selector)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(page.locator(selector)).toHaveCSS('background-image', 'none');
      }
    }
  }
  await page.getByRole('slider', { name: 'Opacité du verre' }).fill('35');
  expect(await page.locator('.widget-shell').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(242, 242, 245, 0.35)');
  await expect(page.getByRole('combobox', { name: 'Mode d’affichage' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: Array<{ command: string; args: { options?: { displayMode: string } } }> }).__nativeCalls.filter(c => c.command === 'widget_transition').at(-1)?.args.options?.displayMode)).toBe('desktop');
  for (const section of ['Aujourd’hui', 'Précipitations', 'Semaine', 'Paramètres']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await page.getByRole('button', { name: 'Replier le widget' }).click();
    await expect(page.locator('.mode-compact')).toBeVisible();
    await page.getByRole('button', { name: 'Agrandir le widget' }).click();
    await expect(page.getByRole('button', { name: section, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  expect(await page.evaluate(() => (window as unknown as { __nativeCalls: Array<{ command: string }> }).__nativeCalls.some(c => c.command === 'plugin:window|create'))).toBe(false);
});
