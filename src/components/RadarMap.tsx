import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Pause, Play, Radio, X } from 'lucide-react';
import type { City } from '../types';
import { getJson } from '../services/network';

type Frame = { time: number; path: string };
let metadataCache: { at: number; frames: Frame[]; host: string } | null = null;
export default function RadarMap({ city, onClose }: { city: City; onClose(): void }) {
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), overlay = useRef<L.TileLayer | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]), [host, setHost] = useState('');
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { center: [city.latitude, city.longitude], zoom: 7, minZoom: 3, maxZoom: 7, zoomControl: true });
    map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 7, keepBuffer: 1 }).addTo(instance);
    L.circleMarker([city.latitude, city.longitude], { radius: 6, color: '#fff', weight: 2, fillColor: '#41bfff', fillOpacity: 1 }).addTo(instance).bindTooltip(city.name, { permanent: true, direction: 'top' });
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(element.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; overlay.current = null; };
  }, [city.id, city.latitude, city.longitude, city.name]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (!metadataCache || Date.now() - metadataCache.at > 300_000) {
          const data = await getJson('https://api.rainviewer.com/public/weather-maps.json', controller.signal) as { host?: string; radar?: { past?: Frame[] } };
          if (data.host !== 'https://tilecache.rainviewer.com' || !Array.isArray(data.radar?.past)) throw new Error('Métadonnées radar invalides');
          const past = data.radar.past.filter(f => Number.isFinite(f.time) && typeof f.path === 'string' && /^\/v2\/radar\/[a-zA-Z0-9_-]{1,64}$/.test(f.path)).slice(-13);
          if (!past.length) throw new Error('Aucune image radar disponible');
          metadataCache = { at: Date.now(), frames: past, host: data.host };
        }
        if (!controller.signal.aborted) { setHost(metadataCache.host); setFrames(metadataCache.frames); setIndex(metadataCache.frames.length - 1); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Radar indisponible'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, []);
  useEffect(() => {
    const instance = map.current, frame = frames[index];
    if (!instance || !frame) return;
    setTileError(false);
    const layer = L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: .65, attribution: 'Radar : <a href="https://www.rainviewer.com/">RainViewer</a>', maxZoom: 7, maxNativeZoom: 7, keepBuffer: 0, updateWhenIdle: true });
    layer.on('tileerror', () => setTileError(true));
    layer.addTo(instance); overlay.current = layer;
    // Keep only the visible frame; browser HTTP caching handles recently visited tiles.
    return () => { layer.off(); layer.remove(); };
  }, [frames, host, index, city.id]);
  useEffect(() => {
    if (!playing || !frames.length) return;
    let handle = 0, last = performance.now();
    const step = (time: number) => {
      const size = map.current?.getSize();
      // Allow fewer than 100 tile requests/minute even before the HTTP cache warms.
      const tiles = size ? (Math.ceil(size.x / 256) + 1) * (Math.ceil(size.y / 256) + 1) : 12;
      const delay = Math.max(2000, tiles * 800);
      if (!document.hidden && time - last >= delay) { setIndex(i => (i + 1) % frames.length); last = time; }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step); return () => cancelAnimationFrame(handle);
  }, [playing, frames.length]);
  const time = (value: number) => new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit', timeZone: city.timezone }).format(value * 1000);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="radar-modal glass" role="dialog" aria-modal="true" aria-label="Radar des précipitations">
      <header className="modal-header"><div><span className="eyebrow">UNE VUE D’ENSEMBLE</span><h2><Radio size={20}/> Radar · {city.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer le radar"><X size={20}/></button></header>
      <div className="radar-map" ref={element}/>
      {(error || tileError) && <p className="inline-warning" role="alert">{error || 'Certaines tuiles sont indisponibles. Une zone vide ne signifie pas une absence de pluie.'}</p>}
      {loading && <p className="radar-status" role="status">Chargement des observations radar…</p>}
      <div className="radar-controls"><button className="icon-button" disabled={!frames.length} aria-label={playing ? 'Mettre en pause' : 'Lire le radar'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button><input aria-label="Heure du radar" type="range" min="0" max={Math.max(0, frames.length - 1)} value={index} disabled={!frames.length} onChange={e => { setPlaying(false); setIndex(Number(e.target.value)); }}/><time>{frames[index] ? time(frames[index].time) : '—'}</time></div>
      <div className="radar-legend"><span>Faible</span><i/><span>Forte</span><span>Réflectivité radar</span></div>
      <p className="radar-note">Observations passées · aucune prévision extrapolée. Couverture variable selon les radars. Zoom limité à 7 par le fournisseur.</p>
    </section>
  </div>;
}
