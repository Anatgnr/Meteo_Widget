import type { ForecastPoint, WeatherSnapshot } from '../types';
import { learnedWeight, type Learning } from './learning';

export type WeightFactors = { reliability: number; freshness: number; geographic: number; horizon: number };
export const INITIAL_FACTORS: WeightFactors = { reliability: 1, freshness: 1, geographic: 1, horizon: 1 };
const variables = ['temperatureC', 'precipitationProbability', 'precipitationMm', 'cloudCover', 'windSpeedKmh', 'apparentC', 'humidity'] as const;

export function fuseForecasts(snapshots: WeatherSnapshot[], factors: Record<string, WeightFactors> = {}, learning?: Learning): WeatherSnapshot {
  if (!snapshots.length) throw new Error('Aucune source disponible');
  const base = snapshots[0];
  if (snapshots.some(s => s.cityId !== base.cityId)) throw new Error('Villes incompatibles');
  const groups = new Map<string, ForecastPoint[]>();
  for (const snapshot of snapshots) for (const point of snapshot.hourly) {
    const points = groups.get(point.validAt) ?? [];
    // A model redistributed by two providers is still a single forecast.
    if (!points.some(p => p.modelId === point.modelId)) points.push(point);
    groups.set(point.validAt, points);
  }
  const hourly = [...groups.values()].map(points => {
    const output = { ...points[0] };
    for (const key of variables) {
      let total = 0, weights = 0;
      for (const p of points) {
        const f = factors[p.modelId] ?? INITIAL_FACTORS;
        // Retrieval time is deliberately not a proxy for model production time.
        const weight = f.reliability * f.freshness * f.geographic * f.horizon * (learning ? learnedWeight(learning, p, key) : 1);
        if (p[key] != null && Number.isFinite(weight) && weight > 0) { total += p[key]! * weight; weights += weight; }
      }
      output[key] = weights ? total / weights : null;
    }
    output.temporalResolutionMinutes = Math.max(...points.map(p => p.temporalResolutionMinutes));
    if (points.length > 1) output.modelId = `fusion:${points.map(p => p.modelId).sort().join('+')}`;
    return output;
  }).sort((a, b) => a.validAt.localeCompare(b.validAt));
  return { ...base, hourly, originalForecasts: snapshots.flatMap(s => s.originalForecasts ?? s.hourly), sources: [...new Set(snapshots.flatMap(s => s.sources))], warnings: snapshots.flatMap(s => s.warnings) };
}
