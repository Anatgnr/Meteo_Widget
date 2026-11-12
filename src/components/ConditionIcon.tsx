import { useId } from 'react';

type WeatherSymbol = 'sun' | 'moon' | 'cloud' | 'partly-cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'unknown' | 'drop' | 'wind' | 'thermometer';
type Conditions = { code?: number | null; isDay?: boolean | null; cloud?: number | null; rain?: number | null };

export function conditionSymbol({ code, isDay, cloud, rain }: Conditions): WeatherSymbol {
  if (code == null && cloud == null && rain == null) return 'unknown';
  if (code != null && code >= 95) return 'storm';
  if (code != null && (code >= 71 && code <= 77 || code === 85 || code === 86)) return 'snow';
  if ((rain ?? 0) >= .1 || code != null && code >= 51 && code <= 82) return 'rain';
  if (code != null && code >= 45 && code <= 48) return 'fog';
  if (code === 0 || code == null && cloud != null && cloud < 15) return isDay === false ? 'moon' : 'sun';
  if (code === 1 || code === 2 || code == null && cloud != null && cloud < 65) return isDay === false ? 'moon' : 'partly-cloudy';
  return 'cloud';
}

export function WeatherIcon({ symbol, size = 24 }: { symbol: WeatherSymbol; size?: number }) {
  const id = useId().replaceAll(':', '');
  const cloud = <path d="M8 22.5h16a5.7 5.7 0 0 0 .1-11.4A8.4 8.4 0 0 0 8 12.5a5 5 0 0 0 0 10Z"/>;
  return <svg className={`weather-symbol weather-symbol-${symbol}`} width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={`url(#${id}-cyan)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-cyan`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c6f1ff"/><stop offset=".5" stopColor="#79d8fa"/><stop offset="1" stopColor="#10b8ed"/></linearGradient>
      <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe36c"/><stop offset="1" stopColor="#ffb900"/></linearGradient>
    </defs>
    {symbol === 'sun' && <g stroke={`url(#${id}-sun)`}><circle cx="18" cy="18" r="7"/><path d="M18 3v4m0 22v4M3 18h4m22 0h4M7.4 7.4l2.8 2.8m15.6 15.6 2.8 2.8m0-21.2-2.8 2.8M10.2 25.8l-2.8 2.8"/></g>}
    {symbol === 'partly-cloudy' && <><g stroke={`url(#${id}-sun)`}><circle cx="23" cy="12" r="5"/><path d="M23 2v2m7.1 1-1.5 1.5M33 12h-2M15.9 5l1.5 1.5"/></g><g transform="translate(0 6) scale(.88)">{cloud}</g></>}
    {['cloud', 'rain', 'snow', 'storm', 'fog'].includes(symbol) && cloud}
    {symbol === 'rain' && <path strokeWidth="2.8" d="m12 27-1 4m8-4-1.5 6m8-6-1 4"/>}
    {symbol === 'snow' && <path d="M12 27v6m-2.6-4.5 5.2 3m0-3-5.2 3M25 27v6m-2.6-4.5 5.2 3m0-3-5.2 3"/>}
    {symbol === 'storm' && <path stroke={`url(#${id}-sun)`} d="m19 25-4 5h5l-3 5"/>}
    {symbol === 'fog' && <path d="M6 28h24M10 33h16"/>}
    {symbol === 'moon' && <path d="M25 23a12 12 0 0 1-13-17 12 12 0 1 0 17 17Z"/>}
    {symbol === 'drop' && <path fill={`url(#${id}-cyan)`} fillOpacity=".3" d="M18 4S8 17 8 23a10 10 0 0 0 20 0c0-6-10-19-10-19Zm-4 18c-1 3 0 5 3 6"/>}
    {symbol === 'wind' && <path d="M4 13h18a4 4 0 1 0-4-4M4 19h25a4 4 0 1 1-4 4M9 25h7a4 4 0 1 1-4 4"/>}
    {symbol === 'thermometer' && <><path d="M15 21V7a3 3 0 0 1 6 0v14a7 7 0 1 1-6 0Z"/><path d="M18 14v12m0 0v1m7-16h3m-3 5h3"/></>}
    {symbol === 'unknown' && <><circle cx="18" cy="18" r="13"/><path d="M14 13a4 4 0 0 1 8 0c0 3-4 3-4 6m0 6h.01"/></>}
  </svg>;
}

export function ConditionIcon({ size = 24, ...conditions }: Conditions & { size?: number }) {
  return <WeatherIcon symbol={conditionSymbol(conditions)} size={size}/>;
}
