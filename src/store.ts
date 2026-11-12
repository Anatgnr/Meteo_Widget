import { create } from 'zustand';
import { BORDEAUX, type City, type Settings } from './types';
import { storage } from './services/storage';

const defaults: Settings = {
  theme: 'auto', opacity: 18, blur: 24, accent: '#6edbff', compact: true, alwaysOnTop: false,
  refreshMinutes: 10, multiModel: false, displayMode: 'desktop', compactWidth: 320, compactHeight: 180,
  expandedWidth: 1000, expandedHeight: 790, sourceModels: [], retentionDays: 30,
  startWithWindows: false, notifications: false,
};

export function normalizeSettings(raw: unknown): Settings {
  const value = raw && typeof raw === 'object' ? raw as Partial<Settings> : {};
  const number = (key: 'opacity' | 'blur' | 'compactWidth' | 'compactHeight' | 'expandedWidth' | 'expandedHeight', min: number, max: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key]! >= min && value[key]! <= max ? value[key]! : defaults[key];
  return {
    ...defaults, theme: ['auto', 'dark', 'light'].includes(value.theme ?? '') ? value.theme! : defaults.theme,
    opacity: number('opacity', 0, 60), blur: number('blur', 0, 40), accent: /^#[\da-f]{6}$/i.test(value.accent ?? '') ? value.accent! : defaults.accent,
    compactWidth: Math.round(number('compactWidth', 280, 600)), compactHeight: Math.round(number('compactHeight', 160, 350)), expandedWidth: Math.round(number('expandedWidth', 600, 1400)), expandedHeight: Math.round(number('expandedHeight', 450, 1100)),
    refreshMinutes: [10, 15, 30].includes(value.refreshMinutes ?? 0) ? value.refreshMinutes! : defaults.refreshMinutes,
    retentionDays: [7, 30, 90].includes(value.retentionDays ?? 0) ? value.retentionDays! : defaults.retentionDays,
    sourceModels: Array.isArray(value.sourceModels) ? [...new Set(value.sourceModels.filter(m => ['meteofrance_seamless', 'ecmwf_ifs025', 'icon_seamless'].includes(m)))] : [],
    displayMode: 'desktop', alwaysOnTop: false,
    multiModel: value.multiModel === true, notifications: value.notifications === true, startWithWindows: value.startWithWindows === true,
  };
}
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
      if (saved) set({ city: validCity(saved.city) ? saved.city : BORDEAUX, favorites: Array.isArray(saved.favorites) ? saved.favorites.filter(validCity) : [BORDEAUX], settings: normalizeSettings(saved.settings) });
    } catch { set({ persistenceError: 'Stockage local indisponible. Les données restent utilisables pendant cette session.' }); }
    finally { set({ ready: true }); }
  },
  setCity(city) { set({ city }); persist(get()); },
  toggleFavorite(city) {
    set(s => ({ favorites: s.favorites.some(c => c.id === city.id) ? s.favorites.filter(c => c.id !== city.id) : [...s.favorites, city] })); persist(get());
  },
  updateSettings(settings) { set(s => ({ settings: normalizeSettings({ ...s.settings, ...settings }) })); persist(get()); },
  async clear() { await writeQueue; await storage.clear(); set({ city: BORDEAUX, favorites: [BORDEAUX], settings: defaults, persistenceError: null }); },
}));
