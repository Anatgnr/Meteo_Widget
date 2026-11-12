import type { City, ForecastPoint, WeatherSnapshot } from '../types';
import { getJson } from '../services/network';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse météo invalide');
  return value as RecordValue;
}
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const at = (value: unknown, i: number) => Array.isArray(value) ? number(value[i]) : null;
function timestamp(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Horodatage météo absent');
  return new Date(value * 1000).toISOString();
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
  if (query.trim().length < 2) return [];
  const params = new URLSearchParams({ name: query.trim(), count: '8', language: 'fr', format: 'json' });
  const data = record(await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal));
  if (!Array.isArray(data.results)) return [];
  return data.results.flatMap(raw => {
    const r = record(raw);
    if (number(r.id) === null || typeof r.name !== 'string' || number(r.latitude) === null || number(r.longitude) === null || typeof r.timezone !== 'string') return [];
    return [{ id: `geonames:${r.id}`, name: r.name, country: String(r.country ?? ''), region: typeof r.admin1 === 'string' ? r.admin1 : undefined, latitude: r.latitude as number, longitude: r.longitude as number, timezone: r.timezone }];
  });
}

export function normalize(raw: unknown, city: City, retrievedAt: string, modelId = 'open-meteo:best-match'): WeatherSnapshot {
  const data = record(raw);
  const current = data.current ? record(data.current) : {};
  const hourly = record(data.hourly);
  if (!Array.isArray(hourly.time) || hourly.time.length === 0) throw new Error('Prévisions horaires absentes');
  const points: ForecastPoint[] = hourly.time.map((time, i) => {
    const validAt = timestamp(time);
    return {
      source: 'Open-Meteo', modelId, cityId: city.id, issuedAt: null, retrievedAt, validAt,
      temperatureC: at(hourly.temperature_2m, i), precipitationProbability: at(hourly.precipitation_probability, i),
      precipitationMm: at(hourly.precipitation, i), cloudCover: at(hourly.cloud_cover, i),
      windSpeedKmh: at(hourly.wind_speed_10m, i), isDay: at(hourly.is_day, i) === null ? null : at(hourly.is_day, i) === 1,
      temporalResolutionMinutes: 60, forecastHorizonMinutes: Math.max(0, (Date.parse(validAt) - Date.parse(retrievedAt)) / 60_000),
    };
  });
  return {
    cityId: city.id, retrievedAt, hourly: points, sources: [modelId], warnings: [],
    current: {
      validAt: current.time === undefined ? retrievedAt : timestamp(current.time),
      temperatureC: number(current.temperature_2m), apparentC: number(current.apparent_temperature),
      humidity: number(current.relative_humidity_2m), windSpeedKmh: number(current.wind_speed_10m),
      precipitationMm: number(current.precipitation), weatherCode: number(current.weather_code),
      isDay: number(current.is_day) === null ? null : current.is_day === 1,
    },
  };
}

export interface WeatherProvider { id: string; fetch(city: City, signal: AbortSignal): Promise<WeatherSnapshot> }

export function openMeteoProvider(model?: string): WeatherProvider {
  return {
    id: model ?? 'open-meteo:best-match',
    async fetch(city, signal) {
      const params = new URLSearchParams({
        latitude: String(city.latitude), longitude: String(city.longitude),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day',
        hourly: 'temperature_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,is_day',
        timezone: 'GMT', timeformat: 'unixtime', forecast_hours: '24', wind_speed_unit: 'kmh',
      });
      if (model) params.set('models', model);
      return normalize(await getJson(`https://api.open-meteo.com/v1/forecast?${params}`, signal), city, new Date().toISOString(), model);
    },
  };
}
