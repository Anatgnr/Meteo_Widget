import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { CalendarDays, ChevronDown, Info, Maximize2, Radio, RefreshCw, Settings2, X } from 'lucide-react';
import { useApp } from './store';
import { clearWeatherCache, storage } from './services/storage';
import { WeatherScheduler, type WeatherState } from './weather/scheduler';
import { openMeteoProvider } from './weather/providers';
import { condition, detectEvents, hourLabel } from './weather/events';
import { available, daysFrom, localDay } from './weather/series';
import { nextNotification } from './weather/notifications';
import { CitySearch } from './components/CitySearch';
import { ConditionIcon, WeatherIcon } from './components/ConditionIcon';
import { ForecastChart, type TimeSelection } from './components/ForecastChart';
import { SettingsPanel } from './components/Settings';
import { createWidgetController, type WidgetSection, type WindowBounds } from './widget/controller';

const RadarMap = lazy(() => import('./components/RadarMap'));
const initial: WeatherState = { data: null, loading: true, stale: false, error: null };
const Sun = ({ size }: { size?: number }) => <WeatherIcon symbol="sun" size={size}/>;
const CloudRain = ({ size }: { size?: number }) => <WeatherIcon symbol="rain" size={size}/>;
const Droplets = ({ size }: { size?: number }) => <WeatherIcon symbol="drop" size={size}/>;
const sections = [['today', Sun, 'Aujourd’hui'], ['rain', CloudRain, 'Précipitations'], ['week', CalendarDays, 'Semaine'], ['radar', Radio, 'Radar'], ['settings', Settings2, 'Paramètres']] as const;

export default function App() {
  const { city, settings, ready, persistenceError, hydrate, clear } = useApp();
  const native = isTauri(), options = useRef(settings); options.current = settings;
  const [weather, setWeather] = useState<WeatherState>(initial), [now, setNow] = useState(Date.now()), [generation, setGeneration] = useState(0), [nativeError, setNativeError] = useState('');
  const [selection, setSelection] = useState<TimeSelection>({ hoveredTimestamp: null, selectedTimestamp: null });
  const [selectedDay, setSelectedDay] = useState(''), [continuous, setContinuous] = useState(false), [miniRadar, setMiniRadar] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const controller = useMemo(() => createWidgetController(async expanded => {
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (native) {
      try { return await invoke<WindowBounds>('widget_transition', { expanded, options: { ...options.current, animate } }); }
      catch (error) { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().show().catch(() => {}); throw error; }
    }
    if (animate) await new Promise(resolve => setTimeout(resolve, 320));
    return null;
  }), [native]);
  const widget = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const expanded = widget.mode === 'expanded' || widget.mode === 'expanding';
  const busy = widget.mode === 'expanding' || widget.mode === 'collapsing';
  const modelKey = settings.sourceModels.length ? settings.sourceModels.join(',') : settings.multiModel ? 'icon_seamless,ecmwf_ifs025' : '';
  const scheduler = useMemo(() => new WeatherScheduler(modelKey ? modelKey.split(',').map(model => openMeteoProvider(model)) : [openMeteoProvider()], storage, settings.refreshMinutes * 60_000, Date.now, !native), [modelKey, settings.refreshMinutes, generation, native]);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => {
    if (!ready) return;
    controller.setCity(city.id); setSelection({ hoveredTimestamp: null, selectedTimestamp: null }); setSelectedDay(''); setRange({ from: '', to: '' });
    return scheduler.subscribe(city, value => { setWeather(value); setNow(Date.now()); });
  }, [ready, city.id, scheduler, controller]);
  useEffect(() => {
    if (ready) void controller.configure();
  }, [ready, controller, settings.displayMode, settings.compactWidth, settings.compactHeight, settings.expandedWidth, settings.expandedHeight]);
  useEffect(() => {
    if (widget.mode === 'expanded') document.querySelector<HTMLButtonElement>('.collapse-button')?.focus({ preventScroll: true });
    if (widget.mode === 'compact') document.querySelector<HTMLElement>('.compact-widget')?.focus({ preventScroll: true });
  }, [widget.mode]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.city-popover')) void controller.request(false); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [controller]);
  useEffect(() => {
    if (!native) return;
    let disposed = false, stop: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => listen('widget-display-changed', () => { void controller.configure(); })).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; }).catch(() => setNativeError('La détection des changements d’écran est indisponible.'));
    return () => { disposed = true; stop?.(); };
  }, [controller, native]);
  useEffect(() => {
    const wake = () => { setNow(Date.now()); scheduler.tick(); };
    window.addEventListener('online', wake); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
    let stop: (() => void) | undefined, disposed = false;
    if (native) import('@tauri-apps/api/event').then(({ listen }) => listen('weather-tick', wake)).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; }).catch(() => setNativeError('Le réveil météo natif est indisponible.'));
    return () => { disposed = true; stop?.(); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); };
  }, [scheduler, native]);
  const data = weather.data?.cityId === city.id ? weather.data : null;
  const events = useMemo(() => data ? detectEvents(data, now) : [], [data, now]);
  const rainEvent = events.find(e => e.kind === 'start' || e.kind === 'end'), clearEvent = events.find(e => e.kind === 'clear');
  const days = useMemo(() => expanded && data ? daysFrom(data.hourly, city.timezone, now) : [], [expanded, data, city.timezone, now]);
  const day = days.find(d => d.date === selectedDay) ?? days[0];
  const today = localDay(now, city.timezone);
  const points = !expanded ? [] : widget.activeSection === 'week' ? continuous ? days.filter(d => (!range.from || d.date >= range.from) && (!range.to || d.date <= range.to)).flatMap(d => d.hourly) : day?.hourly ?? [] : data?.hourly.filter(p => localDay(p.validAt, city.timezone) === today) ?? [];
  const selectedPoint = points.find(p => p.validAt === (selection.hoveredTimestamp ?? selection.selectedTimestamp));
  const current = data?.current;
  const rainy = (current?.precipitationMm ?? 0) >= .1;
  const enough = (data?.hourly.filter(p => Date.parse(p.validAt) > now).slice(0, 6) ?? []).filter(p => p.precipitationMm !== null).length >= 2;
  const rainMessage = !data ? 'Météo en cours de chargement…' : rainEvent ? `${rainEvent.kind === 'end' ? 'Fin de pluie' : 'Pluie probable'} vers ${hourLabel(rainEvent.to, city.timezone)}` : !enough ? 'Données de pluie insuffisantes' : rainy ? 'Les précipitations se poursuivent' : 'Pas de pluie prévue à court terme';
  const clearMessage = clearEvent ? `Éclaircie vers ${hourLabel(clearEvent.from, city.timezone)}` : 'Pas d’éclaircie confirmée';
  useEffect(() => {
    if (!native || !settings.notifications || !data || weather.stale) return;
    let disposed = false;
    void (async () => {
      const key = `notification:${city.id}`;
      const last = await storage.get<number>(key) ?? 0;
      const event = nextNotification(events, rainy, now, last);
      if (!event || disposed) return;
      const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');
      if (disposed || !await isPermissionGranted()) return;
      await storage.set(key, now);
      if (!disposed) sendNotification({ title: `WeatherGlass · ${city.name}`, body: `${event.kind === 'end' ? 'Fin des précipitations' : 'Précipitations probables'} vers ${hourLabel(event.to, city.timezone)}. Horaire approximatif.` });
    })().catch(() => { if (!disposed) setNativeError('La notification météo n’a pas pu être affichée.'); });
    return () => { disposed = true; };
  }, [native, settings.notifications, data, weather.stale, city.id, city.name, city.timezone, events, rainy, now]);
  const age = data ? Math.max(0, Math.floor((now - Date.parse(data.retrievedAt)) / 60_000)) : null;
  const style = { '--glass-opacity': settings.opacity / 100, '--glass-blur': `${settings.blur}px`, '--accent': settings.accent, '--compact-width': `${settings.compactWidth}px`, '--compact-height': `${settings.compactHeight}px`, '--expanded-width': `${settings.expandedWidth}px`, '--expanded-height': `${settings.expandedHeight}px` } as CSSProperties;
  const navigate = (section: WidgetSection) => { controller.navigate(section); setSelection(s => ({ ...s, hoveredTimestamp: null })); };
  const gesture = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  async function drag(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.dragging || Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6 || !native) return;
    g.dragging = true;
    try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); }
    catch { setNativeError('Le déplacement du widget est indisponible.'); }
  }
  const error = widget.error || nativeError || persistenceError || weather.error || data?.warnings.join(' ');
  return <div className={`app widget-app theme-${settings.theme} ${native ? 'native-app' : 'browser-preview'} mode-${widget.mode} ${expanded ? 'widget-expanded' : 'compact-mode'}`} style={style}>
    <div className="widget-shell glass" aria-label="WeatherGlass">
      {!expanded ? <div className="compact-widget" onPointerDown={e => { if (e.button === 0) { gesture.current = { x: e.clientX, y: e.clientY, dragging: false }; e.currentTarget.setPointerCapture(e.pointerId); } }} onPointerMove={e => void drag(e)} onPointerUp={e => { const g = gesture.current; gesture.current = null; if (g && !g.dragging && e.button === 0) void controller.request(true); }} onPointerCancel={() => { gesture.current = null; }} role="button" tabIndex={0} aria-label="Agrandir le widget" aria-expanded={false} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void controller.request(true); } }}>
        <div className="compact-top"><strong>{city.name}</strong><span title="Confiance non calibrée" className={`compact-status ${weather.stale ? 'stale' : ''}`}>{weather.loading ? 'Actualisation' : weather.stale ? 'Hors ligne / ancien' : 'Non calibrée'}</span><Maximize2 size={14}/></div>
        <div className="compact-current"><ConditionIcon code={current?.weatherCode} rain={current?.precipitationMm} isDay={current?.isDay} size={40}/><span className="temperature">{available(current?.temperatureC)}<sup>°</sup></span><span>{current ? condition(current.weatherCode) : 'À l’écoute du ciel'}</span></div>
        <p><Droplets size={13}/>{rainMessage}</p><p><Sun size={13}/>{clearMessage}</p>
        {error && <span className="compact-error" title={error} role="alert">{error}</span>}
      </div> : <>
        <header className="widget-header" data-tauri-drag-region><div className="brand" data-tauri-drag-region><Droplets size={23}/><span>weather<span className="brand-light">glass</span><small>VOTRE CENTRE MÉTÉO</small></span></div><CitySearch/><div className="header-actions"><button className="icon-button" aria-label="Actualiser la météo" disabled={weather.loading || busy} onClick={() => scheduler.refresh(city.id)}><RefreshCw size={17} className={weather.loading ? 'spin' : ''}/></button><button className="collapse-button" aria-label="Replier le widget" onClick={() => void controller.request(false)}><ChevronDown size={17}/>Replier</button>{native && <button className="icon-button" aria-label="Fermer WeatherGlass" onClick={() => import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close()).catch(() => setNativeError('La fermeture a échoué.'))}><X size={17}/></button>}</div></header>
        <nav className="widget-nav" aria-label="Sections météo">{sections.map(([id, Icon, label]) => <button key={id} aria-current={widget.activeSection === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={16}/>{label}</button>)}</nav>
        <main className="widget-content" aria-busy={busy}>
          {error && <p role="alert" className="inline-warning"><Info size={15}/>{error}</p>}
          {widget.activeSection === 'settings' ? <SettingsPanel onClose={() => navigate('today')} onClearCache={async () => { scheduler.dispose(); try { await clearWeatherCache(); } finally { setGeneration(g => g + 1); } }} onClear={async () => { scheduler.dispose(); try { await clear(); } finally { setGeneration(g => g + 1); setWeather(initial); } }}/>
          : widget.activeSection === 'radar' ? <Suspense fallback={<p className="empty-state">Chargement du radar…</p>}><RadarMap key={city.id} city={city} onClose={() => navigate('today')}/></Suspense>
          : <>
            <section className={`current-overview ${widget.activeSection === 'week' ? 'week-overview' : ''} ${rainy ? 'is-raining' : ''}`} aria-label={`Météo de ${city.name}`}><div className="current-summary"><div className="current-location"><span className="eyebrow">{city.country}</span><h1>{city.name}</h1><p className="update-time">{weather.loading ? 'Actualisation…' : age === null ? 'En attente' : `Mis à jour ${age < 1 ? 'à l’instant' : `il y a ${age} min`}`}{weather.stale ? ' · données anciennes' : ''}</p></div><div className="current-value"><span className="temperature">{available(current?.temperatureC)}<sup>°</sup></span><ConditionIcon code={current?.weatherCode} rain={current?.precipitationMm} isDay={current?.isDay} size={64}/></div><p>{current ? condition(current.weatherCode) : 'À l’écoute du ciel'}</p><div className="weather-metrics"><span><WeatherIcon symbol="thermometer" size={21}/>Ressenti<strong>{available(current?.apparentC, '°')}</strong></span><span><WeatherIcon symbol="wind" size={21}/>Vent<strong>{available(current?.windSpeedKmh, ' km/h')}</strong></span><span><WeatherIcon symbol="drop" size={21}/>Humidité<strong>{available(current?.humidity, ' %')}</strong></span></div></div>
              <div className="rain-summary glass"><span className="eyebrow">{rainy ? 'PRÉCIPITATIONS EN COURS' : 'LES PROCHAINES HEURES'}</span><h2><CloudRain size={24}/>{rainMessage}</h2><p>{rainEvent ? `Intervalle estimé : ${hourLabel(rainEvent.from, city.timezone)} – ${hourLabel(rainEvent.to, city.timezone)}.` : 'Les horaires dépendent de la résolution disponible.'}</p><div className="sun-insight"><Sun size={23}/><div><strong>{clearMessage}</strong><small>La fin de pluie ne signifie pas le retour du soleil.</small></div></div><div className="rain-footer"><span>{available(current?.precipitationMm, ' mm', 1)} sur le dernier intervalle</span><span>Confiance non calibrée</span></div></div>
            </section>
            {widget.activeSection === 'week' && <section className="week-section" aria-label="Prévisions sur plusieurs jours"><div className="section-title"><div><span className="eyebrow">UN PEU PLUS LOIN</span><h2>Les prochains jours</h2></div><button className="text-button" aria-pressed={continuous} onClick={() => setContinuous(v => !v)}>{continuous ? 'Vue par journée' : 'Vue continue'}</button></div><div className="daily-cards">{days.map(d => <button key={d.date} className={`daily-card glass ${d.date === day?.date ? 'active' : ''}`} aria-pressed={d.date === day?.date} onClick={() => { setSelectedDay(d.date); setContinuous(false); setSelection({ selectedTimestamp: null, hoveredTimestamp: null }); }}><strong>{d.date === today ? 'Aujourd’hui' : new Intl.DateTimeFormat('fr', { weekday: 'short', day: 'numeric', month: 'short', timeZone: city.timezone }).format(new Date(d.hourly[0].validAt))}</strong><ConditionIcon code={d.representative.weatherCode} rain={d.representative.precipitationMm} cloud={d.representative.cloudCover} isDay={d.representative.isDay} size={31}/><span>{available(d.min, '°')} / {available(d.max, '°')}</span><small><Droplets size={12}/>{available(d.probability, ' %')} · {available(d.precipitation, ' mm', 1)}</small><small>{d.partial ? 'Données partielles' : 'Prévisions horaires'}</small></button>)}</div>{!days.length && <p className="empty-state">Prévisions hebdomadaires indisponibles.</p>}</section>}
            <section className="chart-card glass"><div className="section-title"><div><span className="eyebrow">{widget.activeSection === 'week' ? continuous ? 'VUE CONTINUE' : day?.date : 'HEURE PAR HEURE'}</span><h2>{widget.activeSection === 'week' ? 'Évolution détaillée' : widget.activeSection === 'rain' ? 'Précipitations et température' : 'Prévisions aujourd’hui'}</h2></div><span>{city.timezone}</span></div>{widget.activeSection === 'week' && continuous && <div className="date-range"><label>Du<input aria-label="Début de l’intervalle" type="date" min={days[0]?.date} max={range.to || days.at(-1)?.date} value={range.from || days[0]?.date || ''} onChange={e => setRange({ ...range, from: e.target.value })}/></label><label>Au<input aria-label="Fin de l’intervalle" type="date" min={range.from || days[0]?.date} max={days.at(-1)?.date} value={range.to || days.at(-1)?.date || ''} onChange={e => setRange({ ...range, to: e.target.value })}/></label></div>}<ForecastChart points={points} timezone={city.timezone} now={now} continuous={widget.activeSection === 'week' && continuous} selection={selection} onSelection={setSelection}/><div className="time-details" aria-label="Détail de l’heure sélectionnée" aria-live="polite">{selectedPoint ? <><ConditionIcon code={selectedPoint.weatherCode} rain={selectedPoint.precipitationMm} cloud={selectedPoint.cloudCover} isDay={selectedPoint.isDay}/><strong>{hourLabel(selectedPoint.validAt, city.timezone)}</strong><span>{available(selectedPoint.temperatureC, ' °C')}</span><span>Ressenti {available(selectedPoint.apparentC, '°')}</span><span>Pluie {available(selectedPoint.precipitationMm, ' mm', 1)} · {available(selectedPoint.precipitationProbability, ' %')}</span><span>Vent {available(selectedPoint.windSpeedKmh, ' km/h')}</span><span>Humidité {available(selectedPoint.humidity, ' %')}</span><span>Nuages {available(selectedPoint.cloudCover, ' %')}</span></> : <p>Survolez ou sélectionnez une heure pour explorer les prévisions.</p>}</div></section>
            {widget.activeSection === 'rain' && <section className="event-list glass" aria-label="Événements météo"><h2>Les prochaines transitions</h2>{events.length ? events.map((e, i) => <p key={i}>{({ start: 'Début des précipitations', end: 'Période sèche durable', clear: 'Éclaircie possible', intensify: 'Précipitations en intensification', intermittent: 'Averses intermittentes' })[e.kind]} · entre {hourLabel(e.from, city.timezone)} et {hourLabel(e.to, city.timezone)}</p>) : <p>Aucune transition confirmée dans les données disponibles.</p>}<p className="settings-note">Seuils avec hystérésis · échéances approximatives à l’heure · les précipitations peuvent inclure neige et grêle.</p></section>}
            {widget.activeSection === 'week' && !continuous && <section className="event-list glass"><h2>Éclaircies et conditions de la journée</h2><p>Éclaircies possibles : {points.filter(p => p.isDay && p.cloudCover != null && p.cloudCover <= 35 && p.precipitationMm != null && p.precipitationMm < .05).map(p => hourLabel(p.validAt, city.timezone)).join(' · ') || 'aucune confirmée'}</p><p>{points.filter((p, i) => p.weatherCode != null && (i === 0 || points[i - 1].weatherCode != null && p.weatherCode !== points[i - 1].weatherCode)).slice(0, 8).map(p => `${hourLabel(p.validAt, city.timezone)} : ${condition(p.weatherCode ?? null)}`).join(' · ') || 'Transitions non renseignées'}</p></section>}
            {widget.activeSection === 'today' && <div className="radar-preview"><button className="radar-preview-button glass" onClick={() => setMiniRadar(v => !v)}><Radio size={24}/><span><strong>{miniRadar ? 'Masquer l’aperçu radar' : 'Afficher l’aperçu radar'}</strong><small>Dernières précipitations observées autour de {city.name}</small></span><Maximize2 size={18}/></button><button className="text-button" onClick={() => navigate('radar')}>Ouvrir le radar détaillé</button>{miniRadar && <Suspense fallback={<p>Chargement du radar…</p>}><RadarMap key={city.id} city={city} miniature onClose={() => setMiniRadar(false)}/></Suspense>}</div>}
          </>}
          <footer className="widget-footer"><span>Confiance non calibrée · {data?.sources.join(' + ') || 'En attente'}</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo · CC BY 4.0</a></footer>
        </main>
      </>}
    </div>
  </div>;
}
