import { describe, expect, it, vi } from 'vitest';
import { createWidgetController } from '../src/widget/controller';
import { daysFrom, lineSegments } from '../src/weather/series';
import { point, NOW } from './fixtures';

describe('contrôleur du widget', () => {
  it('sérialise les transitions et conserve la navigation sous des clics rapides', async () => {
    const releases: Array<() => void> = [];
    const resize = vi.fn((_expanded: boolean) => new Promise<null>(resolve => releases.push(() => resolve(null))));
    const controller = createWidgetController(resize);
    const init = controller.request(false); await Promise.resolve(); releases.shift()!(); await init;
    controller.navigate('week'); controller.setCity('bordeaux');
    const flight = controller.request(true); await Promise.resolve();
    expect(controller.getSnapshot().mode).toBe('expanding');
    controller.request(false); controller.request(true); controller.request(false);
    expect(resize).toHaveBeenCalledTimes(2);
    releases.shift()!(); await Promise.resolve(); await Promise.resolve();
    expect(controller.getSnapshot().mode).toBe('collapsing');
    releases.shift()!(); await flight;
    expect(resize.mock.calls.map(call => call[0])).toEqual([false, true, false]);
    expect(controller.getSnapshot()).toMatchObject({ mode: 'compact', activeSection: 'week', activeCityId: 'bordeaux' });
  });
  it('revient à l’état stable après une erreur native et permet de réessayer', async () => {
    const resize = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error()).mockResolvedValue(null);
    const controller = createWidgetController(resize); await controller.request(false); await controller.request(true);
    expect(controller.getSnapshot().mode).toBe('compact'); expect(controller.getSnapshot().error).toBeTruthy();
    await controller.request(true); expect(controller.getSnapshot()).toMatchObject({ mode: 'expanded', error: null });
  });
});

describe('séries horaires réelles', () => {
  it('laisse les valeurs absentes et les trous de temps sans ligne inventée', () => {
    const points = [point(), point({ validAt: '2026-11-12T11:00:00Z', temperatureC: null }), point({ validAt: '2026-11-12T12:00:00Z' }), point({ validAt: '2026-11-12T15:00:00Z' })];
    expect(lineSegments(points, 'temperatureC').map(s => s.length)).toEqual([1, 1, 1]);
  });
  it('regroupe selon la ville et attribue le cumul de minuit à l’heure précédente', () => {
    const points = [point({ validAt: '2026-11-12T22:00:00Z', precipitationMm: 2 }), point({ validAt: '2026-11-12T23:00:00Z', precipitationMm: 3 })];
    const days = daysFrom(points, 'Europe/Paris', NOW);
    expect(days.map(d => d.date)).toEqual(['2026-11-12', '2026-11-13']);
    expect(days[0].precipitation).toBe(5); expect(days[1].precipitation).toBeNull(); expect(days[0].partial).toBe(true);
  });
  it('gère les journées de 25 heures au changement d’heure', () => {
    const points = Array.from({ length: 26 }, (_, i) => point({ validAt: new Date(Date.parse('2026-10-24T22:00:00Z') + i * 3_600_000).toISOString(), precipitationMm: null }));
    const days = daysFrom(points, 'Europe/Paris', Date.parse('2026-10-25T00:00:00Z'));
    expect(days[0].hourly).toHaveLength(25); expect(days[0].precipitation).toBeNull();
  });
});
