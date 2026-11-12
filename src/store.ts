import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { BORDEAUX, type City, type Settings } from './types';
import { storage } from './services/storage';

const defaults: Settings = { theme: 'auto', opacity: 65, blur: 24, accent: '#6edbff', compact: isTauri(), alwaysOnTop: false, refreshMinutes: 10, multiModel: false };
type Saved = { city: City; favorites: City[]; settings: Settings };
type AppStore = Saved & {
  ready: boolean; persistenceError: string | null;
  hydrate(): Promise<void>; setCity(city: City): void; toggleFavorite(city: City): void;
  updateSettings(settings: Partial<Settings>): void; clear(): Promise<void>;
};
function validCity(city: City | undefined): city is City {
  if (!city || typeof city.id !== 'string' || typeof city.name !== 'string' || !Number.isFinite(city.latitude) || Math.abs(city.latitude) > 90 || !Number.isFinite(city.longitude) || Math.abs(city.longitude) > 180) return false;
  try { new Intl.DateTimeFormat('fr', { timeZone: city.timezone }); return true; } catch { return false; }
}
let writeQueue = Promise.resolve();
function persist(state: Saved) {
  const value: Saved = { city: state.city, favorites: state.favorites, settings: state.settings };
  writeQueue = writeQueue.catch(() => {}).then(() => storage.set('preferences', value)).catch(() => { useApp.setState({ persistenceError: 'Les préférences ne peuvent pas être enregistrées.' }); });
}
export const useApp = create<AppStore>((set, get) => ({
  city: BORDEAUX, favorites: [BORDEAUX], settings: defaults, ready: false, persistenceError: null,
  async hydrate() {
    try {
      const saved = await storage.get<Saved>('preferences');
      if (saved) set({ city: validCity(saved.city) ? saved.city : BORDEAUX, favorites: Array.isArray(saved.favorites) ? saved.favorites.filter(validCity) : [BORDEAUX], settings: { ...defaults, ...saved.settings } });
    } catch { set({ persistenceError: 'Stockage local indisponible. Les données restent utilisables pendant cette session.' }); }
    finally { set({ ready: true }); }
  },
  setCity(city) { set({ city }); persist(get()); },
  toggleFavorite(city) {
    set(s => ({ favorites: s.favorites.some(c => c.id === city.id) ? s.favorites.filter(c => c.id !== city.id) : [...s.favorites, city] })); persist(get());
  },
  updateSettings(settings) { set(s => ({ settings: { ...s.settings, ...settings } })); persist(get()); },
  async clear() { await writeQueue; await storage.clear(); set({ city: BORDEAUX, favorites: [BORDEAUX], settings: defaults, persistenceError: null }); },
}));
