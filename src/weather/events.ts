import type { ForecastPoint, RainEvent, WeatherSnapshot } from '../types';

const HOUR = 3_600_000;
export function detectEvents(snapshot: WeatherSnapshot, now = Date.now()): RainEvent[] {
  const points = snapshot.hourly.filter(p => Date.parse(p.validAt) > now && Date.parse(p.validAt) <= now + 12 * HOUR).sort((a, b) => a.validAt.localeCompare(b.validAt));
  const result: RainEvent[] = [];
  // Hourly precipitation is accumulated over the PRECEDING hour.
  let raining: boolean | null = snapshot.current.precipitationMm === null ? null : snapshot.current.precipitationMm >= 0.1;
  let previous: ForecastPoint | undefined;
  let lastWet: ForecastPoint | undefined, hadDryGap = false;
  for (const [index, point] of points.entries()) {
    const value = point.precipitationMm;
    const nextWet = value === null ? null : value >= (raining ? 0.05 : 0.15);
    const previousTime = previous ? Date.parse(previous.validAt) : now;
    const contiguous = Date.parse(point.validAt) - previousTime <= HOUR * 1.1;
    if (!contiguous || nextWet === null) { raining = nextWet; previous = point; lastWet = undefined; hadDryGap = false; continue; }
    const next = points[index + 1];
    if (nextWet) {
      if (hadDryGap && lastWet) { result.push({ kind: 'intermittent', from: lastWet.validAt, to: point.validAt }); hadDryGap = false; }
      if (previous?.precipitationMm != null && value !== null && value >= 1 && value >= previous.precipitationMm * 2 && previous.precipitationMm >= .1) result.push({ kind: 'intensify', from: previous.validAt, to: point.validAt });
      lastWet = point;
    } else if (lastWet) hadDryGap = true;
    // Require a second dry interval before announcing the end of an episode.
    const sustained = nextWet || (next && Date.parse(next.validAt) - Date.parse(point.validAt) <= HOUR * 1.1 && next.precipitationMm !== null && next.precipitationMm < 0.05);
    if (raining !== null && nextWet !== raining && sustained) {
      result.push({ kind: nextWet ? 'start' : 'end', from: new Date(Math.max(now, Date.parse(point.validAt) - HOUR)).toISOString(), to: point.validAt });
      raining = nextWet;
    } else if (raining === null) raining = nextWet;
    if (nextWet === false && point.cloudCover !== null && point.cloudCover <= 35 && point.isDay === true && !result.some(e => e.kind === 'clear')) {
      result.push({ kind: 'clear', from: point.validAt, to: new Date(Date.parse(point.validAt) + HOUR).toISOString() });
    }
    previous = point;
  }
  return result;
}

export function hourLabel(value: string | number, timezone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', timeZone: timezone }).format(new Date(value)).replace(' h', '') + ' h';
}

export function condition(code: number | null): string {
  if (code === null) return 'Conditions indisponibles';
  if (code === 0) return 'Ciel dégagé';
  if (code <= 2) return 'Quelques éclaircies';
  if (code === 3) return 'Ciel couvert';
  if (code <= 48) return 'Brouillard';
  if (code <= 57) return 'Bruine';
  if (code <= 67) return code <= 61 ? 'Pluie faible' : 'Pluie';
  if (code <= 77 || code === 85 || code === 86) return 'Neige';
  if (code <= 82) return 'Averses';
  return 'Orage';
}
