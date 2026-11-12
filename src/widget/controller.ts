export type WidgetMode = 'compact' | 'expanding' | 'expanded' | 'collapsing';
export type WidgetSection = 'today' | 'rain' | 'week' | 'radar' | 'settings';
export type WindowBounds = { x: number; y: number; width: number; height: number };
export type WidgetState = {
  mode: WidgetMode; activeCityId: string; activeSection: WidgetSection;
  compactBounds: WindowBounds | null; expandedBounds: WindowBounds | null; error: string | null;
};

// One serialized transition loop also coalesces rapid clicks into the last requested state.
export function createWidgetController(resize: (expanded: boolean) => Promise<WindowBounds | null>) {
  let state: WidgetState = { mode: 'compact', activeCityId: '', activeSection: 'today', compactBounds: null, expandedBounds: null, error: null };
  let desired = false, expanded = false, dirty = true, running: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (value: Partial<WidgetState>) => { state = { ...state, ...value }; listeners.forEach(fn => fn()); };
  function request(value: boolean): Promise<void> {
    desired = value;
    if (!running) {
      running = Promise.resolve().then(async () => {
        while (dirty || desired !== expanded) {
          dirty = false;
          const target = desired;
          update({ mode: target ? 'expanding' : 'collapsing', error: null });
          try {
            const bounds = await resize(target);
            expanded = target;
            update({ mode: target ? 'expanded' : 'compact', ...(target ? { expandedBounds: bounds } : { compactBounds: bounds }) });
          } catch {
            desired = expanded;
            update({ mode: expanded ? 'expanded' : 'compact', error: 'La fenêtre ne peut pas changer de taille. Réessayez.' });
          }
        }
      }).finally(() => { running = null; });
    }
    return running;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    request,
    toggle: () => request(!desired),
    configure: () => { dirty = true; return request(desired); },
    navigate: (activeSection: WidgetSection) => update({ activeSection }),
    setCity: (activeCityId: string) => update({ activeCityId }),
  };
}
