import { expect, test } from '@playwright/test';
import { apiFixture } from '../fixtures';

test('recherche, favoris inactifs, modes, paramètres et radar à la demande', async ({ page }) => {
  let forecasts = 0, radarCalls = 0;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.open-meteo.com/**', route => { forecasts++; return route.fulfill({ json: apiFixture(Date.now()) }); });
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [
    { id: 2988507, name: 'Paris', country: 'France', admin1: 'Île-de-France', latitude: 48.85, longitude: 2.35, timezone: 'Europe/Paris' },
    { id: 4717560, name: 'Paris', country: 'États-Unis', admin1: 'Texas', latitude: 33.66, longitude: -95.55, timezone: 'America/Chicago' },
  ] } }));
  await page.route('https://api.rainviewer.com/**', route => { radarCalls++; return route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1794474000, path: '/v2/radar/a925100fc938' }, { time: 1794474600, path: '/v2/radar/a925100fc939' }] } } }); });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tilecache\.rainviewer\.com)\//, route => route.fulfill({ body: pixel, contentType: 'image/png' }));
  await page.goto('/');
  await expect(page.getByText('Pluie faible', { exact: true })).toBeVisible();
  expect(forecasts).toBe(1); expect(radarCalls).toBe(0);
  await page.screenshot({ path: 'test-results/expanded-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Passer en mode compact' }).click();
  await expect(page.getByText('Les prochaines heures', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/compact.png', fullPage: true });
  await page.getByRole('button', { name: 'Agrandir le widget' }).click();
  await page.getByRole('button', { name: /Bordeaux France/ }).click();
  await page.getByRole('textbox', { name: 'Rechercher une ville' }).fill('Paris');
  await expect(page.getByRole('button', { name: /Paris Île-de-France/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter Paris des favoris' }).first().click();
  expect(forecasts).toBe(1);
  await page.getByRole('button', { name: /Paris Île-de-France/ }).click();
  await expect(page.locator('.city-trigger')).toContainText('Paris');
  await expect.poll(() => forecasts).toBe(2);
  await page.getByRole('button', { name: 'Ouvrir les paramètres' }).click();
  await page.getByRole('button', { name: 'Clair', exact: true }).click();
  await page.getByRole('slider', { name: 'Opacité du verre' }).fill('80');
  await page.getByRole('button', { name: 'Fermer les paramètres' }).click();
  await expect(page.locator('.app')).toHaveClass(/theme-light/);
  await page.screenshot({ path: 'test-results/expanded-light.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.city-trigger')).toContainText('Paris');
  await expect(page.locator('.app')).toHaveClass(/theme-light/);
  expect(forecasts).toBe(2);
  await page.getByRole('button', { name: 'Voir le radar' }).click();
  await expect(page.getByRole('dialog', { name: 'Radar des précipitations' })).toBeVisible();
  await expect.poll(() => radarCalls).toBe(1);
  await page.getByRole('button', { name: 'Lire le radar' }).click();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le radar' }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Les prochaines heures', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('absence réseau : message explicite, aucune météo inventée', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', route => route.abort('internetdisconnected'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Connexion météo indisponible');
  await expect(page.locator('.temperature')).toContainText('—');
});
