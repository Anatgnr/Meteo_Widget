import { useId } from 'react';

export function WeatherIcon({ rainy = false, sunny = false, small = false }: { rainy?: boolean; sunny?: boolean; small?: boolean }) {
  const id = useId().replace(/:/g, '');
  return <svg className={`weather-icon ${small ? 'small' : ''} ${rainy ? 'rainy' : ''}`} viewBox="0 0 160 140" aria-hidden="true">
    <defs>
      <linearGradient id={`cloud${id}`} x1="0" y1="0" x2=".25" y2="1"><stop stopColor="#f2fbff"/><stop offset=".45" stopColor="#c8e2ed"/><stop offset="1" stopColor="#74aac5"/></linearGradient>
      <linearGradient id={`drop${id}`} x2=".6" y2="1"><stop stopColor="#8eeeff"/><stop offset="1" stopColor="#3ab0f1"/></linearGradient>
      <radialGradient id={`sun${id}`}><stop stopColor="#fff0aa"/><stop offset="1" stopColor="#fbc95e"/></radialGradient>
      <filter id={`shadow${id}`} x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#05283c" floodOpacity=".25"/></filter>
    </defs>
    {sunny && <g className="sun-rays" transform="translate(108 43)"><g stroke="#ffe399" strokeWidth="3" strokeLinecap="round">{Array.from({ length: 8 }, (_, i) => <path key={i} d="M0-29V-35" transform={`rotate(${i * 45})`}/>)}</g><circle r="23" fill={`url(#sun${id})`}/></g>}
    <g filter={`url(#shadow${id})`}><path d="M37 91a24 24 0 0 1-4-48 34 34 0 0 1 64-7 27 27 0 1 1 23 55Z" fill={`url(#cloud${id})`} stroke="#e8f8ff" strokeOpacity=".5" strokeWidth="1.2"/><path d="M35 48a19 19 0 0 0-15 14M51 30a27 27 0 0 1 34-3" stroke="white" strokeOpacity=".5" strokeWidth="3" fill="none" strokeLinecap="round"/></g>
    {rainy && <g fill={`url(#drop${id})`}>{[46, 74, 102].map((x, i) => <path className="raindrop" style={{ animationDelay: `${i * .3}s` }} key={x} d={`M${x} 101q-15 12-8 18q8 5 8-18`}/>)}</g>}
  </svg>;
}
