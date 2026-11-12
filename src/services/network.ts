import { isTauri } from '@tauri-apps/api/core';

export async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const fetcher = isTauri() ? (await import('@tauri-apps/plugin-http')).fetch : globalThis.fetch;
  const response = await fetcher(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Service indisponible (HTTP ${response.status})`);
  return response.json();
}
