import { describe, expect, it } from 'vitest';
import { emptyLearning, horizonBucket, learn, learnedWeight, validateObservations, type Observation } from '../src/weather/learning';
import { nextNotification } from '../src/weather/notifications';
import { point, NOW } from './fixtures';
import { BORDEAUX } from '../src/types';

const observation: Observation = { cityId: BORDEAUX.id, source: 'independent-test-station', kind: 'observation', validAt: '2026-11-12T10:00:00Z', temperatureC: 12, precipitationMm: .1, intervalMinutes: 60 };
describe('apprentissage sur observations indépendantes', () => {
  it('refuse les valeurs de modèle déguisées, les autres villes et les cumuls incompatibles', () => {
    expect(() => validateObservations([{ ...observation, kind: 'forecast' }], BORDEAUX.id)).toThrow();
    expect(() => validateObservations([observation], 'other-city')).toThrow();
    expect(() => validateObservations([{ ...observation, intervalMinutes: 15 }], BORDEAUX.id)).toThrow();
    expect(validateObservations([observation], BORDEAUX.id)).toHaveLength(1);
    const p = point({ source: observation.source });
    expect(learn(emptyLearning(), [p], [observation], NOW + 3_600_000).scores).toEqual({});
  });
  it('évalue une seule fois le même modèle, la même validité et le même horizon', () => {
    const p = point();
    const initial = learn(emptyLearning(), [p, p], [observation], NOW + 3_600_000);
    const next = learn(initial, [p], [observation], NOW + 3_600_000);
    expect(Object.values(next.scores)[0]).toMatchObject({ count: 1, temperatureError: 2, rainError: .4 });
    expect(next.forecasts).toHaveLength(0);
  });
  it('ne score aucune mesure future et garde les poids initiaux avant 30 comparaisons', () => {
    const pending = learn(emptyLearning(), [point()], [observation], NOW);
    expect(pending.scores).toEqual({}); expect(pending.forecasts).toHaveLength(1);
    expect(learnedWeight(pending, point(), 'temperatureC')).toBe(1);
    pending.scores['model-a:0'] = { count: 30, temperatureError: 90, temperatureCount: 30, rainCount: 0, rainError: 0 };
    expect(learnedWeight(pending, point(), 'temperatureC')).toBe(.5);
    expect(learnedWeight(pending, point(), 'precipitationMm')).toBe(1);
    expect(learnedWeight(pending, point(), 'humidity')).toBe(1);
    expect([60, 180, 1440, 4320, 10000].map(horizonBucket)).toEqual([0, 1, 2, 3, 4]);
  });
});
describe('notifications non contradictoires', () => {
  it('limite les répétitions et suit le type de transition adapté à la pluie actuelle', () => {
    const events = [{ kind: 'end' as const, from: new Date(NOW).toISOString(), to: new Date(NOW + 3_600_000).toISOString() }];
    expect(nextNotification(events, true, NOW, 0)?.kind).toBe('end');
    expect(nextNotification(events, false, NOW, 0)).toBeUndefined();
    expect(nextNotification(events, true, NOW, NOW - 1000)).toBeUndefined();
  });
});
