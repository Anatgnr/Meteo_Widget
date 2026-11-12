export type City = {
  id: string; name: string; country: string; region?: string;
  latitude: number; longitude: number; timezone: string;
};

export type ForecastPoint = {
  source: string; modelId: string; cityId: string;
  issuedAt: string | null; retrievedAt: string; validAt: string;
  temperatureC: number | null; precipitationProbability: number | null;
  precipitationMm: number | null; cloudCover: number | null;
  windSpeedKmh: number | null; isDay: boolean | null;
  temporalResolutionMinutes: number; forecastHorizonMinutes: number;
};

export type CurrentWeather = {
  validAt: string; temperatureC: number | null; apparentC: number | null;
  humidity: number | null; windSpeedKmh: number | null;
  precipitationMm: number | null; weatherCode: number | null; isDay: boolean | null;
};

export type WeatherSnapshot = {
  cityId: string; retrievedAt: string; current: CurrentWeather;
  hourly: ForecastPoint[]; sources: string[]; warnings: string[];
  originalForecasts?: ForecastPoint[];
};

export type RainEvent = {
  kind: 'start' | 'end' | 'clear'; from: string; to: string;
};

export type Settings = {
  theme: 'auto' | 'dark' | 'light'; opacity: number; blur: number;
  accent: string; compact: boolean; alwaysOnTop: boolean;
  refreshMinutes: number; multiModel: boolean;
};

export const BORDEAUX: City = {
  id: 'geonames:3031582', name: 'Bordeaux', country: 'France',
  region: 'Nouvelle-Aquitaine', latitude: 44.8404, longitude: -0.5805,
  timezone: 'Europe/Paris',
};
