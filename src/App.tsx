import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { ArrowRight, ArrowUpRight, Check, CloudRain, Droplets, Info, Layers3, LoaderCircle, Maximize2, Minimize2, Radio, RefreshCw, Settings2, ShieldCheck, Sun, Wind, X } from 'lucide-react';
import { useApp } from './store';
import { storage } from './services/storage';
import { WeatherScheduler, type WeatherState } from './weather/scheduler';
import { openMeteoProvider } from './weather/providers';
import { condition, detectEvents, hourLabel } from './weather/events';
import { CitySearch } from './components/CitySearch';
import { WeatherIcon } from './components/WeatherIcon';
import { RainTimeline } from './components/RainTimeline';
import { SettingsPanel } from './components/Settings';

const RadarMap = lazy(() => import('./components/RadarMap'));
const initial: WeatherState = { data: null, loading: true, stale: false, error: null };
const format = (value: number | null | undefined, suffix = '') => value === null || value === undefined ? '—' : `${Math.round(value)}${suffix}`;

export default function App() {
  const { city, favorites, settings, ready, persistenceError, hydrate, setCity, updateSettings, clear } = useApp();
  const [weather, setWeather] = useState<WeatherState>(initial), [settingsOpen, setSettingsOpen] = useState(false), [radarOpen, setRadarOpen] = useState(false);
  const [nativeError, setNativeError] = useState(''), [now, setNow] = useState(Date.now()), [generation, setGeneration] = useState(0);
  const previousLayout = useRef<string | null>(null);
  const scheduler = useMemo(() => new WeatherScheduler(settings.multiModel ? [openMeteoProvider('icon_seamless'), openMeteoProvider('ecmwf_ifs025')] : [openMeteoProvider()], storage, settings.refreshMinutes * 60_000), [settings.multiModel, settings.refreshMinutes, generation]);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => {
    if (!ready) return;
    setWeather(initial);
    return scheduler.subscribe(city, value => { setWeather(value); setNow(Date.now()); });
  }, [city.id, scheduler, ready]);
  useEffect(() => {
    const wake = () => { setNow(Date.now()); scheduler.tick(); };
    window.addEventListener('online', wake); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
    return () => { window.removeEventListener('online', wake); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); };
  }, [scheduler]);
  useEffect(() => {
    if (!isTauri() || !ready) return;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop)).catch(() => setNativeError('Le mode premier plan est indisponible.'));
  }, [ready, settings.alwaysOnTop]);
  useEffect(() => {
    if (!isTauri() || !ready) return;
    const layout = radarOpen ? 'radar' : settingsOpen ? 'settings' : settings.compact ? 'compact' : 'expanded';
    const previous = previousLayout.current;
    previousLayout.current = layout;
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow, LogicalSize }) => {
      const win = getCurrentWindow();
      await win.setMinSize(new LogicalSize(390, layout === 'expanded' ? 650 : 395));
      if (previous !== null && previous !== layout) await win.setSize(new LogicalSize(layout === 'radar' ? 820 : 660, layout === 'compact' ? 410 : layout === 'expanded' ? 780 : 700));
    }).catch(() => setNativeError('Le redimensionnement automatique est indisponible.'));
  }, [ready, settings.compact, radarOpen, settingsOpen]);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!settingsOpen && !radarOpen) { previousFocus.current?.focus(); return; }
    previousFocus.current = document.activeElement as HTMLElement;
    const timeout = setTimeout(() => document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(), 100);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSettingsOpen(false); setRadarOpen(false); }
      if (e.key !== 'Tab') return;
      const focusable = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]), [role="dialog"] input:not([disabled]), [role="dialog"] select, [role="dialog"] a[href]')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key); return () => { clearTimeout(timeout); document.removeEventListener('keydown', key); };
  }, [settingsOpen, radarOpen]);
  const data = weather.data?.cityId === city.id ? weather.data : null;
  const events = data ? detectEvents(data, now) : [];
  const rainEvent = events.find(e => e.kind !== 'clear'), clearEvent = events.find(e => e.kind === 'clear');
  const nextPoints = data?.hourly.filter(p => Date.parse(p.validAt) > now) ?? [];
  const rainy = data?.current.precipitationMm !== null && (data?.current.precipitationMm ?? 0) >= .1;
  const sunny = (data?.current.weatherCode ?? 99) <= 2;
  const enoughRainData = nextPoints.length >= 2 && nextPoints.slice(0, 6).every(p => p.precipitationMm !== null);
  const mainMessage = !data ? 'Un instant, on regarde le ciel…' : rainEvent ? `${rainEvent.kind === 'end' ? 'Fin de pluie' : 'Pluie probable'} vers ${hourLabel(rainEvent.to, city.timezone)}` : !enoughRainData ? 'Données de pluie insuffisantes' : rainy ? 'La pluie se poursuit' : 'Pas de pluie prévue à court terme';
  const clearMessage = clearEvent ? `Éclaircie vers ${hourLabel(clearEvent.from, city.timezone)}` : 'Le ciel garde ses nuances';
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: city.timezone }).format(now);
  const ageMinutes = data ? Math.max(0, Math.floor((now - Date.parse(data.retrievedAt)) / 60_000)) : 0;
  const ageLabel = ageMinutes < 1 ? 'à l’instant' : ageMinutes < 60 ? `il y a ${ageMinutes} min` : ageMinutes < 1440 ? `il y a ${Math.floor(ageMinutes / 60)} h` : `il y a ${Math.floor(ageMinutes / 1440)} j`;
  const browser = !isTauri();
  const style = { '--glass-opacity': settings.opacity / 100, '--glass-blur': `${settings.blur}px`, '--accent': settings.accent } as CSSProperties;
  async function nativeAction(action: 'minimize' | 'close') {
    try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow()[action](); } catch { setNativeError('Cette action Windows a échoué.'); }
  }
  return <div className={`app theme-${settings.theme} ${browser ? 'browser-preview' : 'native-app'} ${settings.compact ? 'compact-mode' : ''}`} style={style}>
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="ambient ambient-three"/>
    <header className="app-header" data-tauri-drag-region>
      <a className="brand" href="#" aria-label="WeatherGlass accueil"><span className="brand-mark"><Droplets size={22}/></span><span>weather<span className="brand-light">glass</span><small>LE CIEL, UN PEU PLUS CLAIR.</small></span></a>
      <div className="header-right"><span className="local-label"><span className="active-dot"/>Votre météo, simplement</span><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Ouvrir les paramètres"><Settings2 size={19}/></button>{!browser && <><button className="icon-button" onClick={() => void nativeAction('minimize')} aria-label="Réduire la fenêtre"><Minimize2 size={16}/></button><button className="icon-button" onClick={() => void nativeAction('close')} aria-label="Fermer WeatherGlass"><X size={16}/></button></>}</div>
    </header>
    <main className="main-content">
      {browser && !settings.compact && <div className="page-heading"><div><p className="eyebrow">UNE LONGUEUR D’AVANCE SUR LA PLUIE</p><h1>Votre fenêtre sur le ciel.</h1><p>Les bonnes prévisions. Au bon moment.</p></div><span className="date-label">{dateLabel}</span></div>}
      <div className="workspace">
        <section className="weather-card glass" aria-label={`Météo de ${city.name}`}>
          <div className="card-top"><CitySearch/><div className="card-tools"><span className={`live-badge ${weather.stale ? 'stale' : ''}`}><i/>{weather.loading ? 'Actualisation' : weather.stale ? 'Données anciennes' : data ? 'À jour' : 'En attente'}</span><button className="icon-button" onClick={() => scheduler.refresh(city.id)} aria-label="Actualiser la météo" disabled={weather.loading}><RefreshCw size={15} className={weather.loading ? 'spin' : ''}/></button><button className="icon-button" onClick={() => updateSettings({ compact: !settings.compact })} aria-label={settings.compact ? 'Agrandir le widget' : 'Passer en mode compact'}>{settings.compact ? <Maximize2 size={16}/> : <Minimize2 size={16}/>}</button></div></div>
          <div className="current-weather"><div className="temperature-block"><span className="temperature">{format(data?.current.temperatureC)}<sup>°</sup></span><div><h2>{data ? condition(data.current.weatherCode) : 'À l’écoute du ciel'}</h2><p>Ressenti {format(data?.current.apparentC, '°')}<span> · </span>{city.region || city.country}</p></div></div><WeatherIcon rainy={rainy} sunny={sunny}/></div>
          <div className="weather-stats"><span><Droplets size={16}/><strong>{format(nextPoints[0]?.precipitationProbability, ' %')}</strong> risque de pluie</span><span><Wind size={17}/><strong>{format(data?.current.windSpeedKmh, ' km/h')}</strong> vent</span><span><Layers3 size={16}/><strong>{format(data?.current.humidity, ' %')}</strong> humidité</span></div>
          <div className="rain-insight"><span className="insight-icon"><CloudRain size={25}/></span><div><span className="eyebrow">VOTRE PROCHAINE FENÊTRE</span><h3>{mainMessage}</h3><p>{rainEvent ? `Créneau estimé : ${hourLabel(rainEvent.from, city.timezone)} – ${hourLabel(rainEvent.to, city.timezone)}. ` : ''}{clearMessage}</p></div><ArrowUpRight size={21}/></div>
          {!settings.compact && <RainTimeline points={data?.hourly ?? []} timezone={city.timezone} now={now}/>}
          <div className="card-bottom"><span><ShieldCheck size={14}/>Confiance non calibrée{!browser && <><span>·</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><span>· {data ? ageLabel : 'en attente'}</span></>}</span><button onClick={() => setRadarOpen(true)}><Radio size={15}/>Voir le radar<ArrowRight size={15}/></button></div>
          {(weather.error || persistenceError || nativeError || data?.warnings.length) ? <p className="inline-warning" role="alert"><Info size={14}/>{weather.error || persistenceError || nativeError || data?.warnings.join(' ')}</p> : null}
        </section>
        {browser && !settings.compact && <aside className="side-column">
          <section className="outlook-card glass"><span className="eyebrow">L’HORIZON SE DESSINE</span><div className="outlook-title"><Sun size={24}/><h2>Et après la pluie ?</h2></div><p>{clearEvent ? 'Une respiration dans votre journée.' : 'Chaque nuance compte.'}</p><div className="outlook-time">{clearEvent ? hourLabel(clearEvent.from, city.timezone) : 'À suivre'}<span>{clearEvent ? 'prochaine éclaircie estimée' : 'pas d’éclaircie confirmée'}</span></div><div className="outlook-divider"/><div className="outlook-detail"><span className="sun-dot"/><p>Une éclaircie dépend aussi de la couverture nuageuse, pas seulement de l’absence de pluie.</p></div></section>
          <button className="radar-card glass" onClick={() => setRadarOpen(true)}><div className="radar-art"><i/><i/><i/><span/><Radio size={24}/></div><span className="eyebrow">LES NUAGES EN MOUVEMENT</span><strong>Un œil sur le radar <ArrowUpRight size={18}/></strong><span>Les dernières observations, autour de vous.</span></button>
        </aside>}
      </div>
      {browser && !settings.compact && <><div className="below-widget"><span title={data ? new Date(data.retrievedAt).toLocaleString('fr', { timeZone: city.timezone }) : undefined}><span className="active-dot"/>{data ? `Récupéré ${ageLabel}` : 'Connexion aux données météo…'}<span className="dot-separator">·</span>Heure locale de {city.name}</span><span>Précision horaire<Info size={13}/></span></div>
        <div className="favorites-row"><span className="eyebrow">VOS ESCALES</span>{favorites.map(favorite => <button key={favorite.id} className={favorite.id === city.id ? 'active' : ''} onClick={() => setCity(favorite)}>{favorite.name}{favorite.id === city.id ? <Check size={13}/> : <ArrowUpRight size={13}/>}</button>)}<span className="favorites-hint">Vos favoris se reposent tant que vous ne les consultez pas.</span></div>
        <footer className="app-footer"><span>Un peu de clarté, quel que soit le temps.</span><span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Données Open-Meteo · CC BY 4.0</a><span>·</span><a href="https://www.geonames.org/" target="_blank" rel="noreferrer">Villes GeoNames</a><span>·</span><span>WeatherGlass 0.1</span></span></footer></>}
    </main>
    {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} onClear={async () => { scheduler.dispose(); try { await clear(); } finally { setGeneration(g => g + 1); setWeather(initial); } }}/ >}
    {radarOpen && <Suspense fallback={<div className="modal-backdrop"><div className="loading-dialog glass"><LoaderCircle className="spin"/>Ouverture du radar…<button onClick={() => setRadarOpen(false)}>Annuler</button></div></div>}><RadarMap key={city.id} city={city} onClose={() => setRadarOpen(false)}/></Suspense>}
  </div>;
}
