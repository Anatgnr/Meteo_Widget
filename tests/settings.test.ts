import { expect, it } from 'vitest';
import { normalizeSettings } from '../src/store';

it('migre les préférences anciennes sans conserver des dimensions ou sources invalides', () => {
  const settings = normalizeSettings({ alwaysOnTop: true, compact: false, opacity: 200, expandedWidth: -5, sourceModels: ['ecmwf_ifs025', 'ecmwf_ifs025', 'unknown'], accent: 'url(bad)' });
  expect(settings).toMatchObject({ compact: true, displayMode: 'desktop', alwaysOnTop: false, opacity: 18, expandedWidth: 1000, sourceModels: ['ecmwf_ifs025'], accent: '#6edbff' });
  expect(normalizeSettings(null).compactWidth).toBe(320);
});

it('replace tous les anciens modes derrière les applications et accepte le verre transparent', () => {
  for (const displayMode of ['hybrid', 'floating', 'desktop']) {
    expect(normalizeSettings({ displayMode, alwaysOnTop: true, opacity: 0 })).toMatchObject({ displayMode: 'desktop', alwaysOnTop: false, opacity: 0 });
  }
  expect(normalizeSettings({ opacity: 65 }).opacity).toBe(18);
});
