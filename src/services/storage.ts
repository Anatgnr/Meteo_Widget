import { isTauri, invoke } from '@tauri-apps/api/core';

// Browser preview uses the same data contract, with localStorage instead of SQLite.
export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  clear(): Promise<void>;
}

export const storage: Storage = {
  async get<T>(key: string) {
    const raw = isTauri() ? await invoke<string | null>('read_value', { key }) : localStorage.getItem(`wg:${key}`);
    if (raw === null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  async set(key, value) {
    const valueJson = JSON.stringify(value);
    if (isTauri()) await invoke('write_value', { key, valueJson });
    else localStorage.setItem(`wg:${key}`, valueJson);
  },
  async clear() {
    if (isTauri()) await invoke('clear_data');
    else Object.keys(localStorage).filter(k => k.startsWith('wg:')).forEach(k => localStorage.removeItem(k));
  },
};
