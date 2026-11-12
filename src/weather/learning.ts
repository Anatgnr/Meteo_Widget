import type { ForecastPoint } from '../types';

export type Observation = { cityId: string; source: string; validAt: string; temperatureC: number | null; precipitationMm: number | null; intervalMinutes: number; kind: 'observation' };
export type Score = { count: number; temperatureError: number; temperatureCount: number; rainError: number; rainCount: number };
export type Learning = { forecasts: ForecastPoint[]; scores: Record<string, Score>; evaluated: string[] };
export const emptyLearning = (): Learning => ({ forecasts: [], scores: {}, evaluated: [] });
export const horizonBucket = (minutes: number) => minutes <= 60 ? 0 : minutes <= 180 ? 1 : minutes <= 1440 ? 2 : minutes <= 4320 ? 3 : 4;

export function validateObservations(raw: unknown, cityId: string): Observation[] {
  if (!Array.isArray(raw) || raw.length > 5000) throw new Error('Fichier d’observations invalide (5 000 mesures maximum).');
  return raw.map(value => {
    const o = value as Observation;
    const number = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
    if (!o || o.kind !== 'observation' || o.cityId !== cityId || typeof o.source !== 'string' || !o.source.trim() || !Number.isFinite(Date.parse(o.validAt)) || !number(o.temperatureC) || !number(o.precipitationMm) || o.temperatureC === null && o.precipitationMm === null || o.temperatureC !== null && (o.temperatureC < -100 || o.temperatureC > 65) || o.precipitationMm !== null && o.precipitationMm < 0 || o.intervalMinutes !== 60) throw new Error('Chaque mesure doit être une observation horaire de la ville affichée, avec sa source.');
    return { ...o, validAt: new Date(o.validAt).toISOString() };
  });
}

// A forecast is scored once per model, validity and horizon, against an independent observation.
export function learn(previous: Learning, forecasts: ForecastPoint[], observations: Observation[], now: number): Learning {
  const scores = structuredClone(previous.scores), evaluated = new Set(previous.evaluated);
  const pending = new Map<string, ForecastPoint>();
  for (const p of [...previous.forecasts, ...forecasts]) {
    if (p.modelId.startsWith('fusion:') || p.modelId.endsWith('best-match') || p.forecastHorizonMinutes <= 0) continue;
    const key = `${p.cityId}:${p.modelId}:${horizonBucket(p.forecastHorizonMinutes)}:${p.validAt}`;
    if (!evaluated.has(key) && !pending.has(key)) pending.set(key, p);
  }
  const observationsByTime = new Map(observations.map(o => [`${o.cityId}:${Date.parse(o.validAt)}`, o]));
  for (const [key, p] of pending) {
    const o = observationsByTime.get(`${p.cityId}:${Date.parse(p.validAt)}`);
    if (!o || Date.parse(o.validAt) > now || o.source === p.source || o.source === p.modelId || p.temporalResolutionMinutes !== o.intervalMinutes) continue;
    const scoreKey = `${p.modelId}:${horizonBucket(p.forecastHorizonMinutes)}`;
    const score = scores[scoreKey] ?? { count: 0, temperatureError: 0, temperatureCount: 0, rainError: 0, rainCount: 0 };
    let scored = false;
    if (o.temperatureC !== null && p.temperatureC !== null) { score.temperatureError += Math.abs(p.temperatureC - o.temperatureC); score.temperatureCount++; scored = true; }
    if (o.precipitationMm !== null && p.precipitationMm !== null) { score.rainError += Math.abs(p.precipitationMm - o.precipitationMm); score.rainCount++; scored = true; }
    if (scored) { score.count++; scores[scoreKey] = score; evaluated.add(key); pending.delete(key); }
  }
  return { forecasts: [...pending.values()].filter(p => Date.parse(p.validAt) >= now - 7 * 86_400_000).slice(-3000), scores, evaluated: [...evaluated].slice(-3000) };
}

export function learnedWeight(learning: Learning, point: ForecastPoint, variable: string): number {
  const score = learning.scores[`${point.modelId}:${horizonBucket(point.forecastHorizonMinutes)}`];
  if (!score) return 1;
  const temperature = variable === 'temperatureC', rain = variable === 'precipitationMm';
  const count = temperature ? score.temperatureCount : rain ? score.rainCount : 0;
  if (count < 30) return 1;
  const error = temperature ? score.temperatureError / count / 3 : score.rainError / count;
  return Math.max(.2, 1 / (1 + error));
}
