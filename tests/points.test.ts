import { describe, expect, it } from 'vitest';
import { computePoints, planAlerts } from '../src/lib/alerts/points';

const min = (m: number) => m * 60_000;

describe('alert points', () => {
  it('window alert only when a window is set', () => {
    expect(computePoints({ typicalSec: null, taskAlert: false })).toEqual([]);
    expect(computePoints({ windowMin: 20, typicalSec: null, taskAlert: false }).map((p) => [p.id, p.atSessionMs])).toEqual([
      ['window', min(20)],
    ]);
  });

  it('task alert needs the toggle, a typical time and a task', () => {
    expect(computePoints({ typicalSec: 600, taskAlert: false, taskName: 'Dishes' })).toEqual([]);
    expect(computePoints({ typicalSec: null, taskAlert: true, taskName: 'Dishes' })).toEqual([]);
    expect(computePoints({ typicalSec: 600, taskAlert: true })).toEqual([]);
    const [p] = computePoints({ typicalSec: 600, taskAlert: true, taskName: 'Dishes' });
    expect(p.id).toBe('task');
    expect(p.atSessionMs).toBe(min(10));
  });

  it('skips the task alert within 1 minute of the window alert; window wins', () => {
    const at = (typicalSec: number) =>
      computePoints({ windowMin: 20, typicalSec, taskAlert: true, taskName: 'Dishes' }).map((p) => p.id);
    expect(at(20 * 60 + 60)).toEqual(['window']);
    expect(at(20 * 60 - 60)).toEqual(['window']);
    expect(at(20 * 60 + 61)).toEqual(['window', 'task']);
    expect(at(10 * 60)).toEqual(['task', 'window']);
  });

  it('plans stale vs upcoming and skips fired', () => {
    const pts = computePoints({ windowMin: 20, typicalSec: 600, taskAlert: true, taskName: 'Dishes' });
    const plan = planAlerts(pts, [], min(15));
    expect(plan.stale.map((p) => p.id)).toEqual(['task']);
    expect(plan.upcoming.map((p) => p.id)).toEqual(['window']);
    expect(planAlerts(pts, ['task'], min(15)).stale).toEqual([]);
  });
});
