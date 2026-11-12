import { BORDEAUX, type ForecastPoint, type WeatherSnapshot } from '../src/types';

export const NOW = Date.parse('2026-11-12T09:30:00Z');
export const point = (changes: Partial<ForecastPoint> = {}): ForecastPoint => ({
  source: 'test-only', modelId: 'model-a', cityId: BORDEAUX.id,
  issuedAt: null, retrievedAt: new Date(NOW).toISOString(), validAt: '2026-11-12T10:00:00Z',
  temperatureC: 14, precipitationProbability: 65, precipitationMm: .5,
  cloudCover: 85, windSpeedKmh: 12, isDay: true,
  temporalResolutionMinutes: 60, forecastHorizonMinutes: 30, ...changes,
});
export const snapshot = (changes: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  cityId: BORDEAUX.id, retrievedAt: new Date(NOW).toISOString(),
  current: { validAt: new Date(NOW).toISOString(), temperatureC: 14, apparentC: 12, humidity: 78, windSpeedKmh: 12, precipitationMm: .2, weatherCode: 61, isDay: true },
  hourly: [point()], sources: ['model-a'], warnings: [], ...changes,
});
export const apiFixture = (now = NOW) => {
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  return {
    current: { time: Math.floor(now / 1000), temperature_2m: 14, apparent_temperature: 12, relative_humidity_2m: 78, precipitation: .2, weather_code: 61, wind_speed_10m: 12, is_day: 1 },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => hour / 1000 + (i + 1) * 3600),
      temperature_2m: Array.from({ length: 24 }, (_, i) => 14 + i / 10),
      precipitation: [.3, .8, 1.1, .9, .6, .2, .03, 0, 0, 0, 0, 0, ...Array(12).fill(0)],
      precipitation_probability: [75, 85, 80, 70, 60, 30, 15, 5, 0, 0, 0, 0, ...Array(12).fill(0)],
      cloud_cover: [90, 90, 85, 80, 70, 65, 50, 40, 30, 20, 20, 15, ...Array(12).fill(20)],
      wind_speed_10m: Array(24).fill(12), is_day: Array(24).fill(1),
    },
  };
};
