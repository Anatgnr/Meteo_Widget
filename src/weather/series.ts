import type { ForecastPoint } from '../types';

export const localDay = (time: string | number, timezone: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(new Date(time));
export const available = (value: number | null | undefined, suffix = '', digits = 0) => value == null ? '—' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })}${suffix}`;
export function daysFrom(points: ForecastPoint[], timezone: string, now: number) {
  const today = localDay(now, timezone);
  const groups = new Map<string, ForecastPoint[]>();
  for (const point of points) {
    const day = localDay(point.validAt, timezone);
    if (day < today) continue;
    const group = groups.get(day) ?? []; group.push(point); groups.set(day, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).slice(0, 10).map(([date, hourly]) => {
    const temperatures = hourly.flatMap(p => p.temperatureC === null ? [] : [p.temperatureC]);
    const probabilities = hourly.flatMap(p => p.precipitationProbability === null ? [] : [p.precipitationProbability]);
    const rain = points.filter(p => localDay(Date.parse(p.validAt) - 1, timezone) === date);
    const amounts = rain.flatMap(p => p.precipitationMm === null ? [] : [p.precipitationMm]);
    return { date, hourly, min: temperatures.length ? Math.min(...temperatures) : null, max: temperatures.length ? Math.max(...temperatures) : null,
      probability: probabilities.length ? Math.max(...probabilities) : null,
      precipitation: amounts.length ? amounts.reduce((a, b) => a + b, 0) : null,
      partial: hourly.length < 23 || rain.length < 23 || amounts.length !== rain.length,
      representative: hourly.find(p => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(p.validAt)) === '14') ?? hourly[0],
    };
  });
}

export function lineSegments(points: ForecastPoint[], field: 'temperatureC' | 'apparentC' | 'windSpeedKmh' | 'humidity' | 'cloudCover') {
  const segments: ForecastPoint[][] = []; let previous = -Infinity;
  for (const point of points) {
    if (point[field] == null) { previous = -Infinity; continue; }
    if (Date.parse(point.validAt) - previous > 66 * 60_000) segments.push([]);
    segments.at(-1)!.push(point); previous = Date.parse(point.validAt);
  }
  return segments;
}
