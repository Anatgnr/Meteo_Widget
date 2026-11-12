import { describe, expect, it, vi, afterEach } from 'vitest';
import { normalize, searchCities } from '../src/weather/providers';
import { fuseForecasts } from '../src/weather/fusion';
import { detectEvents, hourLabel } from '../src/weather/events';
import { BORDEAUX } from '../src/types';
import { apiFixture, NOW, point, snapshot } from './fixtures';

afterEach(() => vi.unstubAllGlobals());
describe('normalisation et géocodage', () => {
  it('conserve les valeurs absentes et ne confond pas récupération et production', () => {
    const raw = apiFixture(); raw.hourly.precipitation = [null as unknown as number];
    const data = normalize(raw, BORDEAUX, new Date(NOW).toISOString());
    expect(data.hourly[0].precipitationMm).toBeNull();
    expect(data.hourly[0].issuedAt).toBeNull();
    expect(data.hourly[0].retrievedAt).toBe('2026-11-12T09:30:00.000Z');
    expect(data.hourly[0].validAt).toBe('2026-11-12T10:00:00.000Z');
  });
  it('rejette une réponse sans timeline et les timestamps invalides', () => {
    expect(() => normalize({}, BORDEAUX, new Date(NOW).toISOString())).toThrow();
    const raw = apiFixture(); raw.hourly.time[0] = NaN;
    expect(() => normalize(raw, BORDEAUX, new Date(NOW).toISOString())).toThrow();
  });
  it('distingue les villes homonymes et utilise les IDs GeoNames', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: 1, name: 'Paris', country: 'France', latitude: 48, longitude: 2, timezone: 'Europe/Paris' },
      { id: 2, name: 'Paris', country: 'États-Unis', latitude: 33, longitude: -95, timezone: 'America/Chicago' },
    ] }))));
    const cities = await searchCities('Paris');
    expect(cities.map(c => c.id)).toEqual(['geonames:1', 'geonames:2']);
    expect(cities[1].longitude).toBe(-95);
  });
  it('ne requête pas les recherches trop courtes', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await searchCities('P')).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fusion explicable', () => {
  it('pondère les modèles et ne remplace pas les absences par zéro', () => {
    const a = snapshot({ hourly: [point({ temperatureC: 10, precipitationMm: null })] });
    const b = snapshot({ hourly: [point({ modelId: 'model-b', temperatureC: 20, precipitationMm: 1 })], sources: ['model-b'] });
    const result = fuseForecasts([a, b], { 'model-a': { reliability: 3, freshness: 1, geographic: 1, horizon: 1 } });
    expect(result.hourly[0].temperatureC).toBe(12.5);
    expect(result.hourly[0].precipitationMm).toBe(1);
    expect(result.originalForecasts).toHaveLength(2);
    expect(result.hourly[0].modelId).toContain('fusion:');
  });
  it('ne compte pas deux fois le même modèle redistribué', () => {
    const a = snapshot({ hourly: [point({ temperatureC: 10 })] });
    const duplicate = snapshot({ hourly: [point({ temperatureC: 100 })] });
    expect(fuseForecasts([a, duplicate]).hourly[0].temperatureC).toBe(10);
  });
  it('ne mélange pas des villes ni des échéances distinctes', () => {
    expect(() => fuseForecasts([snapshot(), snapshot({ cityId: 'other' })])).toThrow();
    const result = fuseForecasts([snapshot(), snapshot({ hourly: [point({ validAt: '2026-11-12T11:00:00Z' })] })]);
    expect(result.hourly).toHaveLength(2);
  });
  it('garde une valeur manquante si tous les poids sont nuls', () => {
    expect(fuseForecasts([snapshot()], { 'model-a': { reliability: 0, freshness: 1, geographic: 1, horizon: 1 } }).hourly[0].temperatureC).toBeNull();
  });
});

describe('événements et fuseaux', () => {
  const dry = (hour: number, changes = {}) => point({ validAt: `2026-11-12T${hour}:00:00Z`, precipitationMm: 0, cloudCover: 85, ...changes });
  it('détecte une fin durable, avec un intervalle plutôt qu’une minute fictive', () => {
    const events = detectEvents(snapshot({ hourly: [point(), dry(11), dry(12)] }), NOW);
    expect(events.find(e => e.kind === 'end')).toEqual({ kind: 'end', from: '2026-11-12T10:00:00.000Z', to: '2026-11-12T11:00:00Z' });
  });
  it('ignore une interruption sèche isolée', () => {
    expect(detectEvents(snapshot({ hourly: [point(), dry(11), point({ validAt: '2026-11-12T12:00:00Z' })] }), NOW).filter(e => e.kind === 'end')).toHaveLength(0);
  });
  it('une valeur absente ne produit pas une fin de pluie', () => {
    expect(detectEvents(snapshot({ hourly: [point({ precipitationMm: null }), dry(11), dry(12)] }), NOW).filter(e => e.kind === 'end')).toHaveLength(0);
  });
  it('ne confond pas intervalle sec, nuit et éclaircie', () => {
    expect(detectEvents(snapshot({ hourly: [dry(10), dry(11)] }), NOW).filter(e => e.kind === 'clear')).toHaveLength(0);
    expect(detectEvents(snapshot({ hourly: [dry(10, { cloudCover: 10, isDay: false }), dry(11)] }), NOW).filter(e => e.kind === 'clear')).toHaveLength(0);
    expect(detectEvents(snapshot({ hourly: [dry(10, { cloudCover: 10 }), dry(11)] }), NOW).some(e => e.kind === 'clear')).toBe(true);
  });
  it('ne comble pas un trou de plusieurs heures par un événement', () => {
    expect(detectEvents(snapshot({ hourly: [dry(14), dry(15)] }), NOW).filter(e => e.kind === 'end')).toHaveLength(0);
  });
  it('n’annonce pas une échéance de demain comme une heure d’aujourd’hui', () => {
    expect(detectEvents(snapshot({ hourly: [point({ validAt: '2026-11-13T10:00:00Z', precipitationMm: 0, cloudCover: 10 })] }), NOW)).toEqual([]);
  });
  it('respecte le fuseau de la ville et les changements d’heure', () => {
    expect(hourLabel('2026-11-12T14:00:00Z', 'Europe/Paris')).toBe('15 h');
    expect(hourLabel('2026-11-12T14:00:00Z', 'America/New_York')).toBe('09 h');
    expect(hourLabel('2026-10-25T00:00:00Z', 'Europe/Paris')).toBe('02 h');
    expect(hourLabel('2026-10-25T01:00:00Z', 'Europe/Paris')).toBe('02 h');
  });
});
