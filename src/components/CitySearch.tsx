import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Star, X, LoaderCircle, ChevronDown } from 'lucide-react';
import { searchCities } from '../weather/providers';
import { useApp } from '../store';
import type { City } from '../types';

export function CitySearch() {
  const { city, favorites, setCity, toggleFavorite } = useApp();
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: PointerEvent) => { if (!container.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); setBusy(false); setError(''); return; }
    const controller = new AbortController(); setBusy(true); setError(''); setResults([]);
    const timeout = setTimeout(() => {
      searchCities(query, controller.signal).then(value => { if (!controller.signal.aborted) setResults(value); })
        .catch(() => { if (!controller.signal.aborted) setError('Recherche indisponible. Vos favoris restent accessibles.'); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 350);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, open]);
  const select = (value: City) => { setCity(value); setOpen(false); setQuery(''); };
  return <div className="city-search" ref={container} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button className="city-trigger" aria-expanded={open} onClick={() => setOpen(!open)}><MapPin size={16}/><span>{city.name}<small>{city.country}</small></span><ChevronDown size={15}/></button>
    {open && <div className="city-popover glass" role="dialog" aria-label="Choisir une ville">
      <div className="search-input"><Search size={17}/><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une ville…" aria-label="Rechercher une ville"/>{busy ? <LoaderCircle className="spin" size={16}/> : <button aria-label="Fermer la recherche" onClick={() => setOpen(false)}><X size={16}/></button>}</div>
      <p className="eyebrow">{query.length >= 2 ? 'RÉSULTATS' : 'VOS VILLES FAVORITES'}</p>
      {error && <p role="alert" className="search-message">{error}</p>}
      {(query.length >= 2 ? results : favorites).map(value => <div className="city-result" key={value.id}>
        <button onClick={() => select(value)}><MapPin size={16}/><span>{value.name}<small>{[value.region, value.country].filter(Boolean).join(', ')}</small></span>{value.id === city.id && <span className="active-dot"/>}</button>
        <button aria-label={`${favorites.some(c => c.id === value.id) ? 'Retirer' : 'Ajouter'} ${value.name} des favoris`} onClick={() => toggleFavorite(value)}><Star size={16} fill={favorites.some(c => c.id === value.id) ? 'currentColor' : 'none'}/></button>
      </div>)}
      {!busy && query.length >= 2 && !results.length && !error && <p className="search-message">Aucune ville trouvée.</p>}
      <p className="search-footnote">Seule la ville affichée est actualisée.</p>
    </div>}
  </div>;
}
