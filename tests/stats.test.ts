import { describe, expect, it } from 'vitest';
import type { Session, Task } from '../src/lib/model';
import { buildTaskList, DEFAULT_SORT } from '../src/lib/start/taskList';
import { computeAllStats, fitsWindow, median, typicalSec } from '../src/lib/stats/stats';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  name: id,
  taskAlert: false,
  archived: false,
  createdAt: 0,
  ...extra,
});
let n = 0;
const sess = (taskId: string, startedAt: number, durationSec: number): Session => ({
  id: `s${n++}`,
  taskId,
  startedAt,
  endedAt: startedAt + durationSec * 1000,
  durationSec,
  pauses: [],
});

describe('stats', () => {
  it('median of the last 10 sessions of at least 30s', () => {
    const t = task('a');
    const sessions = [
      sess('a', 1, 10), // too short
      ...Array.from({ length: 12 }, (_, i) => sess('a', 100 + i, 60 * (i + 1))), // 1..12 min
    ];
    const st = computeAllStats([t], sessions).get('a')!;
    // last 10 qualifying: 3..12 min → median 7.5 min
    expect(st.medianSec).toBe(450);
    expect(st.sampleSize).toBe(10);
    expect(st.sessionCount).toBe(13);
    expect(st.lastDoneAt).toBe(111);
  });

  it('median helper', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });

  it('typical time: goal, else median', () => {
    const st = { medianSec: 300, sampleSize: 3, lastDoneAt: 1, sessionCount: 3 };
    expect(typicalSec(task('a', { goalMin: 10 }), st)).toBe(600);
    expect(typicalSec(task('a'), st)).toBe(300);
    expect(typicalSec(task('a'), undefined)).toBeNull();
  });
});

describe('window filter: first property set decides', () => {
  const med = (m: number) => ({ medianSec: m * 60, sampleSize: 1, lastDoneAt: 1, sessionCount: 1 });
  it('min chunk wins over everything', () => {
    expect(fitsWindow(task('a', { minChunkMin: 10, maxMin: 60, goalMin: 60 }), med(60), 15)).toBe(true);
    expect(fitsWindow(task('a', { minChunkMin: 20 }), undefined, 15)).toBe(false);
  });
  it('then max, then goal, then median', () => {
    expect(fitsWindow(task('a', { maxMin: 30, goalMin: 5 }), undefined, 15)).toBe(false);
    expect(fitsWindow(task('a', { goalMin: 10 }), med(60), 15)).toBe(true);
    expect(fitsWindow(task('a', { goalMin: 20 }), med(5), 15)).toBe(false);
    expect(fitsWindow(task('a'), med(20), 15)).toBe(false);
    expect(fitsWindow(task('a'), med(15), 15)).toBe(true);
  });
  it('nothing set: always shows; infinite window: no filtering', () => {
    expect(fitsWindow(task('a'), undefined, 1)).toBe(true);
    expect(fitsWindow(task('a', { maxMin: 600 }), undefined, null)).toBe(true);
  });
});

describe('task list', () => {
  it('drops archived and non-fitting; default sort is last done, oldest (never) first', () => {
    const tasks = [task('recent'), task('old'), task('never'), task('gone', { archived: true }), task('big', { maxMin: 99 })];
    const stats = computeAllStats(tasks, [sess('recent', 500, 60), sess('old', 100, 60)]);
    expect(buildTaskList(tasks, stats, 30, DEFAULT_SORT).map((t) => t.id)).toEqual(['never', 'old', 'recent']);
    expect(buildTaskList(tasks, stats, 30, { key: 'lastDone', asc: false }).map((t) => t.id)).toEqual([
      'recent',
      'old',
      'never',
    ]);
    expect(buildTaskList(tasks, stats, null, { key: 'name', asc: true }).map((t) => t.id)).toEqual([
      'big',
      'never',
      'old',
      'recent',
    ]);
  });
});
