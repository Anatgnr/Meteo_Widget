import type { City, WeatherSnapshot } from '../types';
import type { Storage } from '../services/storage';
import type { WeatherProvider } from './providers';
import { fuseForecasts } from './fusion';

export type WeatherState = { data: WeatherSnapshot | null; loading: boolean; stale: boolean; error: string | null };
type Listener = (state: WeatherState) => void;
type Entry = {
  city: City; consumers: Set<Listener>; monitoringEnabled: boolean; lastAccess: number;
  state: WeatherState; controller?: AbortController; flight?: Promise<void>;
  nextAttempt: number; failures: number;
};

export class WeatherScheduler {
  private entries = new Map<string, Entry>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private providers: WeatherProvider[], private cache: Storage, private ttlMs = 600_000, private now = Date.now) {}

  subscribe(city: City, listener: Listener): () => void {
    let entry = this.entries.get(city.id);
    if (!entry) {
      entry = { city, consumers: new Set(), monitoringEnabled: false, lastAccess: this.now(), state: { data: null, loading: false, stale: false, error: null }, nextAttempt: 0, failures: 0 };
      this.entries.set(city.id, entry);
    }
    entry.consumers.add(listener);
    entry.lastAccess = this.now();
    listener(entry.state);
    void this.load(entry);
    this.timer ??= setInterval(() => this.tick(), 30_000);
    const current = entry;
    return () => {
      current.consumers.delete(listener);
      if (!this.active(current)) {
        current.controller?.abort(); current.controller = undefined; current.flight = undefined;
        current.state = { ...current.state, loading: false };
      }
      if (![...this.entries.values()].some(e => this.active(e))) { clearInterval(this.timer); this.timer = undefined; }
      // Keep a bounded in-memory cache when browsing many cities.
      const inactive = [...this.entries.values()].filter(e => !this.active(e)).sort((a, b) => a.lastAccess - b.lastAccess);
      for (const old of inactive.slice(0, Math.max(0, inactive.length - 12))) this.entries.delete(old.city.id);
    };
  }

  private active(entry: Entry) { return entry.consumers.size > 0 || entry.monitoringEnabled; }
  private key(cityId: string) { return `weather:${this.providers.map(p => p.id).join('+')}:${cityId}`; }
  private emit(entry: Entry) { for (const listener of entry.consumers) listener(entry.state); }

  tick() {
    for (const entry of this.entries.values()) if (this.active(entry)) void this.load(entry);
  }

  refresh(cityId: string) {
    const entry = this.entries.get(cityId);
    // Manual refresh respects a one-minute floor to avoid quota abuse.
    if (entry && this.active(entry) && (!entry.state.data || this.now() - Date.parse(entry.state.data.retrievedAt) >= 60_000)) {
      entry.nextAttempt = 0; void this.load(entry, true);
    }
  }

  private load(entry: Entry, force = false): Promise<void> {
    if (entry.flight) return entry.flight;
    if (!this.active(entry)) return Promise.resolve();
    const controller = new AbortController();
    entry.controller = controller;
    const flight = Promise.resolve().then(async () => {
      try {
        let cacheError: string | null = null;
        if (!entry.state.data) {
          try {
            const cached = await this.cache.get<WeatherSnapshot>(this.key(entry.city.id));
            if (cached?.cityId === entry.city.id && Array.isArray(cached.hourly) && cached.current && Number.isFinite(Date.parse(cached.retrievedAt))) entry.state = { ...entry.state, data: cached };
          } catch { cacheError = 'Cache local inaccessible'; }
        }
        if (controller.signal.aborted || !this.active(entry)) return;
        const age = entry.state.data ? this.now() - Date.parse(entry.state.data.retrievedAt) : Infinity;
        entry.state = { ...entry.state, stale: age >= this.ttlMs, error: cacheError };
        this.emit(entry);
        if ((!force && age >= 0 && age < this.ttlMs) || this.now() < entry.nextAttempt) return;
        entry.state = { ...entry.state, loading: true }; this.emit(entry);
        const results = await Promise.allSettled(this.providers.map(p => p.fetch(entry.city, controller.signal)));
        if (controller.signal.aborted || !this.active(entry)) return;
        const available = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
        if (!available.length) throw new Error('Connexion météo indisponible. Nouvelle tentative automatique.');
        const data = fuseForecasts(available);
        if (results.some(r => r.status === 'rejected')) data.warnings.push('Une source est indisponible ; les autres restent affichées.');
        entry.failures = 0; entry.nextAttempt = 0;
        try { await this.cache.set(this.key(entry.city.id), data); } catch { data.warnings.push('Enregistrement local indisponible.'); }
        if (controller.signal.aborted || !this.active(entry)) return;
        entry.state = { data, loading: false, stale: false, error: null }; this.emit(entry);
      } catch (error) {
        if (controller.signal.aborted) return;
        entry.failures++;
        entry.nextAttempt = this.now() + Math.min(30 * 60_000, 30_000 * 2 ** (entry.failures - 1));
        entry.state = { ...entry.state, loading: false, stale: true, error: error instanceof Error ? error.message : 'Erreur météo' };
        this.emit(entry);
      } finally {
        if (entry.controller === controller) { entry.flight = undefined; entry.controller = undefined; }
      }
    });
    entry.flight = flight;
    return flight;
  }

  dispose() {
    clearInterval(this.timer); this.timer = undefined;
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
  }
}
