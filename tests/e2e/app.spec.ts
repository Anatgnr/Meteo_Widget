import { expect, test } from '@playwright/test';
import { weekFixture } from '../fixtures';

test('un seul widget, prévisions détaillées, cache et radar arrêté au repli', async ({ page }) => {
  let forecasts = 0, radarCalls = 0, tileCalls = 0;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.open-meteo.com/**', route => { forecasts++; expect(new URL(route.request().url()).searchParams.get('forecast_days')).toBe('10'); return route.fulfill({ json: weekFixture() }); });
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [
    { id: 2988507, name: 'Paris', country: 'France', admin1: 'Île-de-France', latitude: 48.85, longitude: 2.35, timezone: 'Europe/Paris' },
    { id: 4717560, name: 'Paris', country: 'États-Unis', admin1: 'Texas', latitude: 33.66, longitude: -95.55, timezone: 'America/Chicago' },
  ] } }));
  await page.route('https://api.rainviewer.com/**', route => { radarCalls++; return route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1794474000, path: '/v2/radar/a925100fc938' }, { time: 1794474600, path: '/v2/radar/a925100fc939' }] } } }); });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tilecache\.rainviewer\.com)\//, route => { tileCalls++; return route.fulfill({ body: pixel, contentType: 'image/png' }); });
  await page.goto('/');
  await expect(page.locator('.mode-compact')).toBeVisible();
  await expect(page.getByText('Pluie faible', { exact: true })).toBeVisible();
  expect(forecasts).toBe(1); expect(radarCalls).toBe(0);
  await page.screenshot({ path: 'test-results/v3-compact.png' });
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await expect(page.locator('.mode-expanded')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prévisions aujourd’hui' })).toBeVisible();
  await expect(page.locator('.forecast-point')).toHaveCount(24);
  await page.locator('.forecast-point').nth(12).focus();
  await expect(page.getByLabel('Détail de l’heure sélectionnée')).toContainText('Humidité 78 %');
  await page.screenshot({ path: 'test-results/v3-today.png' });
  await page.getByRole('button', { name: 'Semaine', exact: true }).click();
  await expect(page.locator('.daily-card')).toHaveCount(10);
  await page.locator('.daily-card').nth(4).click();
  await expect(page.locator('.forecast-point')).toHaveCount(24);
  await page.getByRole('button', { name: 'Vent', exact: true }).click();
  await expect(page.getByRole('img', { name: /Prévisions horaires · km\/h/ })).toBeVisible();
  await page.getByRole('button', { name: 'Vue continue', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Zoom temporel' })).toBeVisible();
  expect(forecasts).toBe(1);
  await page.screenshot({ path: 'test-results/v3-week.png' });
  await page.getByRole('button', { name: 'Replier le widget' }).click();
  await expect(page.locator('.mode-compact')).toBeVisible();
  await expect(page.locator('.forecast-svg, .leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await expect(page.getByRole('button', { name: 'Semaine', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(forecasts).toBe(1);
  await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click();
  await page.getByRole('button', { name: /Bordeaux France/ }).click();
  await page.getByRole('textbox', { name: 'Rechercher une ville' }).fill('Paris');
  await expect(page.getByRole('button', { name: /Paris Île-de-France/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter Paris des favoris' }).first().click(); expect(forecasts).toBe(1);
  await page.getByRole('button', { name: /Paris Île-de-France/ }).click();
  await expect(page.locator('.city-trigger')).toContainText('Paris'); await expect.poll(() => forecasts).toBe(2);
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Clair', exact: true }).click();
  await page.getByRole('slider', { name: 'Opacité du verre' }).fill('45');
  await page.screenshot({ path: 'test-results/v3-settings.png' });
  await page.reload(); await expect(page.locator('.mode-compact')).toBeVisible();
  await expect(page.locator('.compact-top')).toContainText('Paris'); expect(forecasts).toBe(2);
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Radar des précipitations' })).toBeVisible();
  await expect.poll(() => radarCalls).toBe(1);
  await page.getByRole('button', { name: 'Lire le radar' }).click();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Replier le widget' }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  const stopped = tileCalls; await page.waitForTimeout(2500); expect(tileCalls).toBe(stopped);
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Replier le widget' })).toBeVisible();
  await page.screenshot({ path: 'test-results/v3-small-screen.png' });
  expect(errors).toEqual([]);
});

test('hors ligne : message explicite, aucune météo inventée', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', route => route.abort('internetdisconnected'));
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('Connexion météo indisponible');
  await expect(page.locator('.temperature')).toContainText('—');
});
