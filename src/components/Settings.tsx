import { isTauri } from '@tauri-apps/api/core';
import { Check, Monitor, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store';

export function SettingsPanel({ onClose, onClear }: { onClose(): void; onClear(): Promise<void> }) {
  const { settings: s, updateSettings } = useApp();
  const [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  async function pin(value: boolean) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setAlwaysOnTop(value); updateSettings({ alwaysOnTop: value });
    } catch { setError('Impossible de modifier la fenêtre Windows.'); }
  }
  return <div className="modal-backdrop" onClick={e => { if (e.currentTarget === e.target) onClose(); }}><section className="settings-modal glass" role="dialog" aria-modal="true" aria-label="Personnaliser WeatherGlass">
    <header className="modal-header"><div><span className="eyebrow">À VOTRE IMAGE</span><h2>Personnaliser le widget</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer les paramètres"><X size={20}/></button></header>
    <label className="setting-title">Apparence</label><div className="theme-options">{([['light', Sun, 'Clair'], ['dark', Moon, 'Sombre'], ['auto', Monitor, 'Système']] as const).map(([value, Icon, label]) => <button key={value} className={s.theme === value ? 'active' : ''} onClick={() => updateSettings({ theme: value })}><Icon size={20}/>{label}{s.theme === value && <Check size={13}/>}</button>)}</div>
    <label className="range-label" htmlFor="opacity">Opacité du verre <span>{s.opacity} %</span></label><input id="opacity" type="range" min="35" max="95" value={s.opacity} onChange={e => updateSettings({ opacity: Number(e.target.value) })}/>
    <label className="range-label" htmlFor="blur">Flou de l’interface <span>{s.blur} px</span></label><input id="blur" type="range" min="0" max="40" value={s.blur} onChange={e => updateSettings({ blur: Number(e.target.value) })}/>
    <div className="accent-setting"><span>Couleur d’accent</span><div>{['#6edbff', '#b6b2ff', '#a5e5c1', '#ffc892'].map(color => <button key={color} aria-label={`Accent ${color}`} className={s.accent === color ? 'active' : ''} style={{ background: color }} onClick={() => updateSettings({ accent: color })}>{s.accent === color && <Check size={13}/>}</button>)}</div></div>
    <label className="switch-row"><span>Mode compact<small>L’essentiel, en un regard</small></span><input type="checkbox" checked={s.compact} onChange={e => updateSettings({ compact: e.target.checked })}/></label>
    {isTauri() && <label className="switch-row"><span>Toujours au premier plan</span><input type="checkbox" checked={s.alwaysOnTop} onChange={e => void pin(e.target.checked)}/></label>}
    <label className="switch-row"><span>Comparer deux modèles<small>ICON + ECMWF · pondération initiale égale</small></span><input type="checkbox" checked={s.multiModel} onChange={e => updateSettings({ multiModel: e.target.checked })}/></label>
    <label className="select-row">Actualisation<select value={s.refreshMinutes} onChange={e => updateSettings({ refreshMinutes: Number(e.target.value) })}><option value="10">Toutes les 10 min</option><option value="15">Toutes les 15 min</option><option value="30">Toutes les 30 min</option></select></label>
    <p className="settings-note">La confiance reste non calibrée tant qu’aucun historique d’observations ne permet de la mesurer. Aucune géolocalisation automatique.</p>
    <button className="clear-data" onClick={async () => { if (!confirm) { setConfirm(true); return; } try { await onClear(); onClose(); } catch { setError('La suppression des données locales a échoué.'); } }}>{confirm ? 'Confirmer la suppression des données locales' : 'Effacer les données locales'}</button>
    {error && <p role="alert" className="inline-warning">{error}</p>}
  </section></div>;
}
