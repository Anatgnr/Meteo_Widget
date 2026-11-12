import { useState } from 'react';
import { Droplets, Sun, Clock3 } from 'lucide-react';
import type { ForecastPoint } from '../types';
import { hourLabel } from '../weather/events';

export function RainTimeline({ points, timezone, now }: { points: ForecastPoint[]; timezone: string; now: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const visible = points.filter(p => Date.parse(p.validAt) > now).slice(0, 12);
  const maximum = Math.max(1, ...visible.map(p => p.precipitationMm ?? 0));
  const current = selected === null ? null : visible[selected];
  return <section className="timeline-section">
    <div className="section-heading"><h2>Les prochaines heures</h2><span><Clock3 size={13}/> Prévisions horaires</span></div>
    <div className="timeline-meta"><span>Précipitations</span><div><span className="legend-dot rain"/>Pluie<span className="legend-dot clear"/>Éclaircie</div></div>
    <div className="chart" role="group" aria-label="Précipitations des douze prochaines heures">
      <div className="chart-grid"><span>{maximum.toFixed(1)} mm</span><span>{(maximum / 2).toFixed(1)}</span><span>0</span></div>
      <div className="chart-bars">
        <div className="now-marker"><i/><span>Maint.</span></div>
        {visible.map((point, i) => {
          const clear = point.precipitationMm !== null && point.precipitationMm < .05 && point.cloudCover !== null && point.cloudCover <= 35 && point.isDay;
          return <button key={point.validAt} className={`chart-column ${selected === i ? 'selected' : ''}`} onMouseEnter={() => setSelected(i)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(i)} onBlur={() => setSelected(null)} onClick={() => setSelected(selected === i ? null : i)} aria-label={`${hourLabel(point.validAt, timezone)} : ${point.precipitationMm ?? 'indisponible'} mm, ${point.precipitationProbability ?? 'indisponible'} %`}>
            <span className={`bar ${clear ? 'clear' : ''} ${point.precipitationMm === null ? 'missing' : ''}`} style={{ height: `${point.precipitationMm === null ? 5 : Math.max(5, point.precipitationMm / maximum * 95)}%` }}/>
            <span className="bar-label">{hourLabel(point.validAt, timezone)}</span>
          </button>;
        })}
      </div>
      {current && <div className="chart-tooltip" role="status"><strong>{hourLabel(current.validAt, timezone)}</strong><span><Droplets size={13}/>{current.precipitationMm?.toFixed(1) ?? '—'} mm · {current.precipitationProbability === null ? '—' : Math.round(current.precipitationProbability)} %</span><small>Cumul de l’heure précédente</small></div>}
      {!visible.length && <div className="chart-empty">La timeline apparaîtra avec les premières données.</div>}
    </div>
    <div className="timeline-caption"><Sun size={14}/><span>Survolez une heure pour explorer les prévisions.</span><span>mm / heure</span></div>
  </section>;
}
