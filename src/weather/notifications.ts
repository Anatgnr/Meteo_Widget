import type { RainEvent } from '../types';

export function nextNotification(events: RainEvent[], raining: boolean, now: number, lastSentAt: number): RainEvent | undefined {
  if (now - lastSentAt < 3_600_000) return;
  return events.find(e => e.kind === (raining ? 'end' : 'start') && Date.parse(e.to) > now && Date.parse(e.from) <= now + 3_600_000);
}
