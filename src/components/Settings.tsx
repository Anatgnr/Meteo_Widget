import { invoke, isTauri } from '@tauri-apps/api/core';
import { Check, Monitor, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { storage } from '../services/storage';
import { validateObservations } from '../weather/learning';

export function SettingsPanel({ onClose, onClear, onClearCache }: { onClose(): void; onClear(): Promise<void>; onClearCache(): Promise<void> }) {
  const { settings: s, city, updateSettings } = useApp();
  const [imported, setImported] = useState('');
  const [screens, setScreens] = useState<Array<{ name: string; width: number; height: number; scale: number }>>([]), [screen, setScreen] = useState(0), [corner, setCorner] = useState('top-right');
  useEffect(() => { if (isTauri()) invoke<typeof screens>('widget_screens').then(value => { if (Array.isArray(value)) setScreens(value); }).catch(() => setError('La liste des écrans est indisponible.')); }, []);
  const [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  async function autostart(value: boolean) {
    try {
      const { enable, disable } = await import('@tauri-apps/plugin-autostart');
      await (value ? enable() : disable()); updateSettings({ startWithWindows: value });
    } catch { setError('Impossible de modifier le démarrage avec la session.'); }
  }
  async function notifications(value: boolean) {
    try {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
      if (value && !(await isPermissionGranted()) && await requestPermission() !== 'granted') throw new Error();
      updateSettings({ notifications: value });
    } catch { setError('Les notifications ne sont pas autorisées par le système.'); }
  }
  return <section className="settings-modal glass inline-panel" aria-label="Personnaliser WeatherGlass">
    <header className="modal-header"><div><span className="eyebrow">À VOTRE IMAGE</span><h2>Personnaliser le widget</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer les paramètres"><X size={20}/></button></header>
    <label className="setting-title">Apparence</label><div className="theme-options">{([['light', Sun, 'Clair'], ['dark', Moon, 'Sombre'], ['auto', Monitor, 'Système']] as const).map(([value, Icon, label]) => <button key={value} className={s.theme === value ? 'active' : ''} onClick={() => updateSettings({ theme: value })}><Icon size={20}/>{label}{s.theme === value && <Check size={13}/>}</button>)}</div>
    <label className="range-label" htmlFor="opacity">Opacité du verre <span>{s.opacity} %</span></label><input id="opacity" type="range" min="0" max="60" value={s.opacity} onChange={e => updateSettings({ opacity: Number(e.target.value) })}/>
    <label className="range-label" htmlFor="blur">Flou de l’interface <span>{s.blur} px</span></label><input id="blur" type="range" min="0" max="40" value={s.blur} onChange={e => updateSettings({ blur: Number(e.target.value) })}/>
    <div className="accent-setting"><span>Couleur d’accent</span><div>{['#6edbff', '#b6b2ff', '#a5e5c1', '#ffc892'].map(color => <button key={color} aria-label={`Accent ${color}`} className={s.accent === color ? 'active' : ''} style={{ background: color }} onClick={() => updateSettings({ accent: color })}>{s.accent === color && <Check size={13}/>}</button>)}</div></div>
    <p className="settings-note">Le widget reste derrière les applications, même déplié, au-dessus du fond d’écran animé de Wallpaper Engine. Sous Linux, le placement dépend du gestionnaire de fenêtres et le flou du bureau dépend du compositeur.</p>
    {isTauri() && <><label className="switch-row"><span>Démarrer avec la session</span><input type="checkbox" checked={s.startWithWindows} onChange={e => void autostart(e.target.checked)}/></label><label className="switch-row"><span>Notifications météo<small>Ville affichée uniquement · tant que le widget fonctionne</small></span><input type="checkbox" checked={s.notifications} onChange={e => void notifications(e.target.checked)}/></label></>}
    <fieldset className="source-settings"><legend>Sources météo</legend><p className="settings-note">Sans sélection : choix automatique Open-Meteo. Les modèles nommés sont distribués par Open-Meteo, sans double comptage du choix automatique.</p>{[['meteofrance_seamless', 'Météo-France · ARPEGE / AROME'], ['ecmwf_ifs025', 'ECMWF · IFS'], ['icon_seamless', 'DWD · ICON']].map(([model, label]) => <label className="switch-row" key={model}><span>{label}</span><input type="checkbox" checked={s.sourceModels.includes(model)} onChange={e => updateSettings({ multiModel: false, sourceModels: e.target.checked ? [...s.sourceModels, model] : s.sourceModels.filter(m => m !== model) })}/></label>)}</fieldset>
    <div className="size-settings">{([['compactWidth', 'Largeur compacte', 280, 600], ['compactHeight', 'Hauteur compacte', 160, 350], ['expandedWidth', 'Largeur dépliée', 600, 1400], ['expandedHeight', 'Hauteur dépliée', 450, 1100]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" aria-label={label} min={min} max={max} value={s[key]} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) updateSettings({ [key]: n }); }}/></label>)}</div>
    {!!screens.length && <><label className="select-row">Écran<select value={screen} onChange={e => setScreen(Number(e.target.value))}>{screens.map((m, i) => <option key={i} value={i}>{m.name} · {m.width} × {m.height} · {Math.round(m.scale * 100)} %</option>)}</select></label><label className="select-row">Position<select value={corner} onChange={e => setCorner(e.target.value)}><option value="top-right">En haut à droite</option><option value="top-left">En haut à gauche</option><option value="bottom-right">En bas à droite</option><option value="bottom-left">En bas à gauche</option></select></label><button className="text-button" onClick={() => invoke('widget_place', { screen, corner }).catch(() => setError('Le placement sur cet écran a échoué.'))}>Appliquer le placement</button></>}
    <label className="select-row">Conservation de l’historique<select value={s.retentionDays} onChange={e => updateSettings({ retentionDays: Number(e.target.value) })}>{[7, 30, 90].map(n => <option value={n} key={n}>{n} jours</option>)}</select></label>
    <label className="observation-import">Importer des observations indépendantes (JSON)<input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 1_000_000) throw new Error('Fichier trop volumineux.'); const values = validateObservations(JSON.parse(await file.text()), city.id); await storage.set(`observations:${city.id}`, values); setImported(`${values.length} observations importées. Évaluation à la prochaine actualisation.`); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Import impossible.'); } }}/></label><p className="settings-note">L’apprentissage compare les anciennes prévisions aux mesures importées de la ville affichée. Les poids ne changent qu’après 30 comparaisons par modèle, variable et horizon. Les valeurs courantes d’Open-Meteo sont des modèles, pas des observations indépendantes.</p>{imported && <p role="status" className="settings-note">{imported}</p>}
    <label className="select-row">Actualisation<select value={s.refreshMinutes} onChange={e => updateSettings({ refreshMinutes: Number(e.target.value) })}><option value="10">Toutes les 10 min</option><option value="15">Toutes les 15 min</option><option value="30">Toutes les 30 min</option></select></label>
    <p className="settings-note">La confiance reste non calibrée tant qu’aucun historique d’observations ne permet de la mesurer. Aucune géolocalisation automatique.</p>
    <button className="text-button" onClick={() => onClearCache().then(() => setImported('Cache météo vidé. Les préférences et l’historique sont conservés.')).catch(() => setError('Le cache n’a pas pu être vidé.'))}>Vider le cache météo</button>
    <button className="clear-data" onClick={async () => { if (!confirm) { setConfirm(true); return; } try { await onClear(); onClose(); } catch { setError('La suppression des données locales a échoué.'); } }}>{confirm ? 'Confirmer la suppression des données locales' : 'Effacer les données locales'}</button>
    {error && <p role="alert" className="inline-warning">{error}</p>}
  </section>;
}
