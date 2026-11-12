import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeatherScheduler } from '../src/weather/scheduler';
import { BORDEAUX } from '../src/types';
import { snapshot, NOW } from './fixtures';
import type { Storage } from '../src/services/storage';

const memory = (): Storage => {
  const values = new Map<string, unknown>();
  return { async get<T>(key: string) { return (values.get(key) ?? null) as T | null; }, async set(key, value) { values.set(key, value); }, async clear() { values.clear(); } };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const schedulers: WeatherScheduler[] = [];
const make = (...args: ConstructorParameters<typeof WeatherScheduler>) => { const scheduler = new WeatherScheduler(...args); schedulers.push(scheduler); return scheduler; };
afterEach(() => { schedulers.forEach(s => s.dispose()); schedulers.length = 0; vi.restoreAllMocks(); });

describe('ordonnanceur des seules villes actives', () => {
  it('ne lance aucun appel pour un favori inactif', async () => {
    const fetch = vi.fn().mockResolvedValue(snapshot()); const scheduler = make([{ id: 'test', fetch }], memory(), 600_000, () => NOW);
    scheduler.tick(); await flush(); expect(fetch).not.toHaveBeenCalled();
    const unsubscribe = scheduler.subscribe(BORDEAUX, vi.fn()); await flush(); expect(fetch).toHaveBeenCalledTimes(1);
    unsubscribe(); scheduler.tick(); await flush(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('mutualise deux widgets de la même ville', async () => {
    const fetch = vi.fn().mockResolvedValue(snapshot()), listener = vi.fn();
    const scheduler = make([{ id: 'test', fetch }], memory(), 600_000, () => NOW);
    scheduler.subscribe(BORDEAUX, listener); scheduler.subscribe(BORDEAUX, vi.fn()); scheduler.tick();
    await flush(); expect(fetch).toHaveBeenCalledTimes(1); expect(listener.mock.calls.at(-1)?.[0].data?.cityId).toBe(BORDEAUX.id);
  });
  it('réutilise un cache valide sans requête', async () => {
    const cache = memory(); await cache.set(`weather:test:${BORDEAUX.id}`, snapshot());
    const fetch = vi.fn(); const listener = vi.fn();
    make([{ id: 'test', fetch }], cache, 600_000, () => NOW).subscribe(BORDEAUX, listener);
    await flush(); expect(fetch).not.toHaveBeenCalled(); expect(listener.mock.calls.at(-1)?.[0].data).not.toBeNull();
  });
  it('annule immédiatement une requête de ville abandonnée', async () => {
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_city, s) => { signal = s; return new Promise<never>(() => {}); });
    const scheduler = make([{ id: 'test', fetch }], memory(), 600_000, () => NOW);
    const unsubscribe = scheduler.subscribe(BORDEAUX, vi.fn()); await flush(); unsubscribe();
    expect(signal?.aborted).toBe(true);
  });
  it('ignore les résultats tardifs après un changement rapide de ville', async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    const cache = memory(), write = vi.spyOn(cache, 'set'), oldListener = vi.fn();
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(snapshot({ cityId: 'paris' }));
    const scheduler = make([{ id: 'test', fetch }], cache, 600_000, () => NOW);
    const unsubscribe = scheduler.subscribe(BORDEAUX, oldListener); await flush(); unsubscribe();
    const count = oldListener.mock.calls.length;
    scheduler.subscribe({ ...BORDEAUX, id: 'paris', name: 'Paris' }, vi.fn()); await flush();
    resolve(snapshot()); await flush();
    expect(oldListener).toHaveBeenCalledTimes(count); expect(write).toHaveBeenCalledTimes(1);
  });
  it('affiche le cache périmé hors ligne et applique un backoff', async () => {
    let now = NOW; const cache = memory(); await cache.set(`weather:test:${BORDEAUX.id}`, snapshot({ retrievedAt: '2026-11-11T09:30:00Z' }));
    const fetch = vi.fn().mockRejectedValue(new Error('Offline')), listener = vi.fn();
    const scheduler = make([{ id: 'test', fetch }], cache, 600_000, () => now);
    scheduler.subscribe(BORDEAUX, listener); await flush(); scheduler.tick(); await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ stale: true, loading: false });
    expect(listener.mock.calls.at(-1)?.[0].data).not.toBeNull();
    now += 30_001; scheduler.tick(); await flush(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reprend après veille uniquement pour une ville encore active', async () => {
    let now = NOW; const fetch = vi.fn().mockResolvedValue(snapshot());
    const scheduler = make([{ id: 'test', fetch }], memory(), 600_000, () => now);
    const unsubscribe = scheduler.subscribe(BORDEAUX, vi.fn()); await flush();
    now += 3_600_000; scheduler.tick(); await flush(); expect(fetch).toHaveBeenCalledTimes(2);
    unsubscribe(); now += 3_600_000; scheduler.tick(); await flush(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('continue avec une source si la seconde est indisponible', async () => {
    const listener = vi.fn();
    make([{ id: 'ok', fetch: vi.fn().mockResolvedValue(snapshot()) }, { id: 'down', fetch: vi.fn().mockRejectedValue(new Error('HTTP 503')) }], memory(), 600_000, () => NOW).subscribe(BORDEAUX, listener);
    await flush(); const state = listener.mock.calls.at(-1)?.[0];
    expect(state.data).not.toBeNull(); expect(state.data.warnings).toHaveLength(1); expect(state.error).toBeNull();
  });
  it('reste fonctionnel si le stockage est indisponible', async () => {
    const cache: Storage = { get: vi.fn().mockRejectedValue(new Error()), set: vi.fn().mockRejectedValue(new Error()), clear: vi.fn() };
    const listener = vi.fn();
    make([{ id: 'test', fetch: vi.fn().mockResolvedValue(snapshot()) }], cache, 600_000, () => NOW).subscribe(BORDEAUX, listener);
    await flush(); expect(listener.mock.calls.at(-1)?.[0].data).not.toBeNull();
  });
});
