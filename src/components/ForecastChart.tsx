import { useId, useState } from 'react';
import type { ForecastPoint } from '../types';
import { hourLabel } from '../weather/events';
import { available, lineSegments, localDay } from '../weather/series';
import { ConditionIcon, WeatherIcon } from './ConditionIcon';

export type TimeSelection = { selectedTimestamp: string | null; hoveredTimestamp: string | null };
type Layer = 'temperatureC' | 'windSpeedKmh' | 'humidity' | 'cloudCover';
export function ForecastChart({ points, timezone, now, selection, onSelection, continuous = false }: { points: ForecastPoint[]; timezone: string; now: number; selection: TimeSelection; onSelection(value: TimeSelection): void; continuous?: boolean }) {
  const [layer, setLayer] = useState<Layer>('temperatureC'), [rain, setRain] = useState(true), [apparent, setApparent] = useState(false), [zoom, setZoom] = useState(1);
  const gradient = useId().replaceAll(':', '');
  if (!points.length) return <p className="empty-state">Prévisions horaires indisponibles pour cette journée.</p>;
  const values = points.flatMap(p => p[layer] == null ? [] : [p[layer]!]);
  const min = layer === 'temperatureC' ? Math.floor(Math.min(...values, 10) / 5) * 5 - 2 : 0;
  const max = layer === 'temperatureC' ? Math.ceil(Math.max(...values, 20) / 5) * 5 + 2 : layer === 'windSpeedKmh' ? Math.max(20, ...values) + 5 : 100;
  const unit = layer === 'temperatureC' ? '°C' : layer === 'windSpeedKmh' ? 'km/h' : '%';
  const width = continuous ? Math.max(760, points.length * 17 * zoom) : 900, height = 260;
  const start = Date.parse(points[0].validAt), end = Date.parse(points.at(-1)!.validAt);
  const x = (p: ForecastPoint) => 45 + (Date.parse(p.validAt) - start) / Math.max(1, end - start) * (width - 94);
  const y = (value: number) => 195 - (value - min) / (max - min) * 140;
  const rainMax = Math.max(1, ...points.flatMap(p => p.precipitationMm == null ? [] : [p.precipitationMm]));
  const active = selection.hoveredTimestamp ?? selection.selectedTimestamp;
  const chosen = points.find(p => p.validAt === active);
  const polyline = (field: Layer | 'apparentC', className: string) => lineSegments(points, field).map((segment, i) => <polyline key={`${field}-${i}`} className={className} fill="none" points={segment.map(p => `${x(p)},${y(p[field]!)}`).join(' ')}/>);
  return <section className="forecast-chart" aria-label="Graphique horaire">
    <div className="chart-toolbar"><div className="layer-tabs" aria-label="Couches météo">{([['temperatureC', 'Température', 'thermometer'], ['windSpeedKmh', 'Vent', 'wind'], ['humidity', 'Humidité', 'drop'], ['cloudCover', 'Nuages', 'cloud']] as const).map(([key, name, symbol]) => <button key={key} aria-pressed={layer === key} onClick={() => setLayer(key)}><WeatherIcon symbol={symbol} size={18}/>{name}</button>)}</div><label><input type="checkbox" checked={rain} onChange={e => setRain(e.target.checked)}/> Pluie</label><label><input type="checkbox" checked={apparent} onChange={e => setApparent(e.target.checked)}/> Ressenti</label></div>
    {continuous && <label className="zoom-control">Zoom temporel<input aria-label="Zoom temporel" type="range" min="0.5" max="2" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))}/></label>}
    <div className="forecast-scroll"><svg className="forecast-svg" viewBox={`0 0 ${width} ${height}`} style={continuous ? { width, maxWidth: 'none' } : undefined} role="img" aria-label={`Prévisions horaires · ${unit}${rain ? ' et pluie en mm/h' : ''}`}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6edbff" stopOpacity=".7"/><stop offset="1" stopColor="#1686c7" stopOpacity=".15"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(tick => { const value = min + (max - min) * tick / 4; return <g key={tick} className="axis"><line x1="42" x2={width - 45} y1={y(value)} y2={y(value)}/><text x="4" y={y(value) + 4}>{Math.round(value)}{unit}</text>{rain && <text x={width - 37} y={y(value) + 4}>{available(rainMax * tick / 4, '', 1)}</text>}</g>; })}
      {rain && <text className="axis-label" x={width - 40} y="40">mm/h</text>}
      {points.map((p, i) => <g key={p.validAt}>
        {continuous && (i === 0 || localDay(p.validAt, timezone) !== localDay(points[i - 1].validAt, timezone)) && <g className="day-separator"><line x1={x(p)} x2={x(p)} y1="28" y2="220"/><text x={x(p) + 5} y="18">{new Intl.DateTimeFormat('fr', { weekday: 'short', day: 'numeric', timeZone: timezone }).format(new Date(p.validAt))}</text></g>}
        {rain && p.precipitationMm !== null && <rect className="rain-bar" x={x(p) - 4} y={195 - p.precipitationMm / rainMax * 140} width="8" height={p.precipitationMm / rainMax * 140} rx="2" fill={`url(#${gradient})`}/>}
        {i % (continuous ? 6 : 3) === 0 && <><foreignObject x={x(p) - 12} y="27" width="24" height="25"><ConditionIcon code={p.weatherCode} cloud={p.cloudCover} rain={p.precipitationMm} isDay={p.isDay}/></foreignObject><text className="hour-tick" x={x(p)} y="218" textAnchor="middle">{hourLabel(p.validAt, timezone)}</text></>}
      </g>)}
      {polyline(layer, 'temperature-line')}{apparent && layer === 'temperatureC' && polyline('apparentC', 'apparent-line')}
      {now >= start && now <= end && <g className="now-line"><line x1={45 + (now - start) / Math.max(1, end - start) * (width - 94)} x2={45 + (now - start) / Math.max(1, end - start) * (width - 94)} y1="45" y2="200"/><text x={45 + (now - start) / Math.max(1, end - start) * (width - 94)} y="243" textAnchor="middle">Maintenant</text></g>}
      {points.map(p => <g key={p.validAt} className={`forecast-point ${Date.parse(p.validAt) < now ? 'past' : ''}`} tabIndex={0} role="button" aria-label={`${new Intl.DateTimeFormat('fr', { weekday: 'short', hour: '2-digit', timeZone: timezone }).format(new Date(p.validAt))} · ${available(p.temperatureC, ' °C')} · ${available(p.precipitationMm, ' mm', 1)}`} aria-pressed={selection.selectedTimestamp === p.validAt} onMouseEnter={() => onSelection({ ...selection, hoveredTimestamp: p.validAt })} onMouseLeave={() => onSelection({ ...selection, hoveredTimestamp: null })} onFocus={() => onSelection({ ...selection, hoveredTimestamp: p.validAt })} onBlur={() => onSelection({ ...selection, hoveredTimestamp: null })} onClick={() => onSelection({ hoveredTimestamp: p.validAt, selectedTimestamp: p.validAt })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelection({ hoveredTimestamp: p.validAt, selectedTimestamp: p.validAt }); } }}>
        <rect x={x(p) - Math.max(5, (width - 94) / points.length / 2)} y="50" width={Math.max(10, (width - 94) / points.length)} height="150" fill="transparent"/>
        {p[layer] != null && <circle cx={x(p)} cy={y(p[layer]!)} r={active === p.validAt ? 5 : 2.5}/>}<title>{Date.parse(p.validAt) < now ? 'Modèle passé · pas une observation' : 'Prévision'} · {available(p.temperatureC, ' °C')} · pluie {available(p.precipitationProbability, ' %')}</title>
      </g>)}
      {chosen && <line className="selection-line" x1={x(chosen)} x2={x(chosen)} y1="47" y2="200"/>}
    </svg></div>
    <p className="chart-caption">Courbe : {layer === 'temperatureC' ? 'température' : layer === 'windSpeedKmh' ? 'vent' : layer === 'humidity' ? 'humidité' : 'nébulosité'} · barres bleues : précipitations de l’heure précédente. Points atténués : modèle passé, pas des observations. Les trous restent vides.</p>
  </section>;
}
