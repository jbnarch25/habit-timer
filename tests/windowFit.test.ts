import { describe, expect, it } from 'vitest';
import type { Task } from '../src/lib/model';
import { buildTaskList, queueTotals, remainingWindow } from '../src/lib/start/taskList';
import { fillMin, fitsWindow, typicalMin, type TaskStats } from '../src/lib/stats/stats';

let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${n++}`,
  name: `Task ${n}`,
  durationMode: 'fixed',
  medianAlert: true,
  archived: false,
  createdAt: 0,
  ...over,
});
const st = (over: Partial<TaskStats> = {}): TaskStats => ({
  medianSec: null,
  sampleSize: 0,
  lastDoneAt: null,
  lastUsedAt: null,
  segmentCount: 0,
  sessionCount: 0,
  ...over,
});

describe('window fit', () => {
  it('typicalMin: median, else estimate, else unknown', () => {
    expect(typicalMin(task({ estimateMin: 7 }), st({ medianSec: 600 }))).toBe(10);
    expect(typicalMin(task({ estimateMin: 7 }), st())).toBe(7);
    expect(typicalMin(task(), undefined)).toBeNull();
  });

  it('fitsWindow and fillMin for fixed / flexible / unknown', () => {
    const fixed = task({ estimateMin: 15 });
    expect(fitsWindow(fixed, undefined, 20)).toBe('fits');
    expect(fitsWindow(fixed, undefined, 10)).toBe('no');
    expect(fillMin(fixed, undefined, 20)).toBe(15);
    expect(fitsWindow(task(), undefined, 20)).toBe('unknown');

    const capped = task({ durationMode: 'flexible', minMin: 5, maxMin: 12 });
    const open = task({ durationMode: 'flexible' });
    expect(fitsWindow(capped, undefined, 20)).toBe('fits');
    expect(fitsWindow(capped, undefined, 4)).toBe('no');
    expect(fillMin(capped, undefined, 20)).toBe(12);
    expect(fillMin(capped, undefined, 8)).toBe(8);
    expect(fillMin(open, undefined, 20)).toBe(20);
  });

  it('a full window fits nothing', () => {
    expect(fitsWindow(task({ durationMode: 'flexible' }), undefined, 0)).toBe('no');
    expect(fitsWindow(task({ estimateMin: 0 }), undefined, -5)).toBe('no');
  });
});

describe('step 2 task list', () => {
  const big = task({ name: 'Big', estimateMin: 18 });
  const small = task({ name: 'Small', estimateMin: 3 });
  const tooBig = task({ name: 'Too big', estimateMin: 25 });
  const flexOpen = task({ name: 'Flex open', durationMode: 'flexible', minMin: 5 });
  const flexCapped = task({ name: 'Flex capped', durationMode: 'flexible', maxMin: 10 });
  const noEst = task({ name: 'No estimate' });
  const archived = task({ name: 'Archived', estimateMin: 5, archived: true });
  const all = [small, tooBig, noEst, big, flexCapped, archived, flexOpen];
  const stats = new Map<string, TaskStats>();

  it('W = 20: fitting tasks by fill descending, no-estimate grouped, archived hidden', () => {
    const list = buildTaskList(all, stats, 20, []);
    expect(list.fits.map((t) => t.name)).toEqual(['Flex open', 'Big', 'Flex capped', 'Small']);
    expect(list.noEstimate.map((t) => t.name)).toEqual(['No estimate']);
  });

  it('ties: never done first, then least recently done', () => {
    const a = task({ name: 'A', estimateMin: 5 });
    const b = task({ name: 'B', estimateMin: 5 });
    const c = task({ name: 'C', estimateMin: 5 });
    const s = new Map([
      [a.id, st({ lastDoneAt: 200 })],
      [b.id, st({ lastDoneAt: 100 })],
    ]);
    expect(buildTaskList([a, b, c], s, 20, []).fits.map((t) => t.name)).toEqual(['C', 'B', 'A']);
  });

  it('∞: everything non-archived, most recently used first', () => {
    const s = new Map([
      [small.id, st({ lastUsedAt: 300 })],
      [noEst.id, st({ lastUsedAt: 500 })],
    ]);
    const list = buildTaskList(all, s, null, []);
    expect(list.fits.map((t) => t.name).slice(0, 2)).toEqual(['No estimate', 'Small']);
    expect(list.fits).toHaveLength(6);
    expect(list.noEstimate).toHaveLength(0);
  });

  it('queued tasks leave the list; remaining window is applied in queue order', () => {
    expect(remainingWindow(20, [big], stats)).toBe(2);
    expect(remainingWindow(20, [flexCapped, small], stats)).toBe(7);
    expect(remainingWindow(20, [small, flexOpen], stats)).toBe(0); // open-ended fills what's left
    const W = remainingWindow(20, [big], stats);
    const list = buildTaskList(all, stats, W, [big.id]);
    // 2 min left: capped flexible (min 0) fits; open one needs 5; Small needs 3
    expect(list.fits.map((t) => t.name)).toEqual(['Flex capped']);
    expect(list.fits.some((t) => t.id === big.id)).toBe(false);
  });

  it('bar totals count unestimated tasks separately', () => {
    expect(queueTotals([big, noEst, small], stats, 30)).toEqual({ min: 21, unknown: 1 });
  });
});
