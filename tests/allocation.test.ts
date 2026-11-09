import { describe, expect, it } from 'vitest';
import type { Segment } from '../src/lib/model';
import {
  assign,
  barLengthSec,
  canSplit,
  deleteSegment,
  isVirtual,
  maxExactSec,
  moveDivider,
  reorder,
  setCompleted,
  setDurationExact,
  setExcluded,
  snapStep,
  splitSegment,
  sumSec,
  withRemainder,
} from '../src/lib/services/editorService';

const NOW = 5_000;
let n = 0;
const ids = () => `new${n++}`;
const seg = (id: string, durationSec: number, over: Partial<Segment> = {}): Segment => ({
  id,
  sessionId: 's',
  order: 0,
  taskId: null,
  durationSec,
  startedAt: 1000,
  completed: true,
  source: 'live',
  excluded: false,
  ...over,
});
const list = (...segs: Segment[]) => segs.map((s, i) => ({ ...s, order: i }));
const durs = (segs: Segment[]) => segs.map((s) => s.durationSec);

describe('snap step', () => {
  it('1 min, or 5 s under 5 minutes', () => {
    expect(snapStep(19 * 60)).toBe(60);
    expect(snapStep(299)).toBe(5);
    expect(snapStep(300)).toBe(60);
  });
});

describe('moveDivider', () => {
  const pair = list(seg('a', 9 * 60 + 37, { taskId: 'dishes' }), seg('b', 9 * 60 + 23));

  it('snaps the left duration to a step; the right keeps odd seconds', () => {
    const up = moveDivider(pair, 0, 9 * 60 + 45, 60, NOW);
    expect(durs(up)).toEqual([600, 540 + 0]);
    expect(up[1].durationSec + up[0].durationSec).toBe(19 * 60);
    const down = moveDivider(pair, 0, 9 * 60 + 20, 60, NOW);
    expect(durs(down)).toEqual([540, 600]);
  });

  it('keeps odd seconds on the right', () => {
    const odd = list(seg('a', 9 * 60 + 37), seg('b', 9 * 60 + 40));
    const r = moveDivider(odd, 0, 600, 60, NOW);
    expect(durs(r)).toEqual([600, 9 * 60 + 17]);
  });

  it('stamps both neighbors as edited and keeps startedAt', () => {
    const r = moveDivider(pair, 0, 600, 60, NOW);
    for (const s of r) expect(s).toMatchObject({ source: 'edited', editedAt: NOW, startedAt: 1000 });
  });

  it('never shrinks a segment below one step, nor a sub-step one below its size', () => {
    expect(durs(moveDivider(pair, 0, 0, 60, NOW))).toEqual([60, 19 * 60 - 60]);
    expect(durs(moveDivider(pair, 0, 99_999, 60, NOW))).toEqual([19 * 60 - 60, 60]);
    const tiny = list(seg('a', 20), seg('b', 3600));
    expect(moveDivider(tiny, 0, 0, 60, NOW)).toBe(tiny); // can't shrink
    expect(durs(moveDivider(tiny, 0, 50, 60, NOW))).toEqual([60, 3560]); // grows, snapping up to a step
  });

  it('returns the same array when nothing changes', () => {
    const even = list(seg('a', 600), seg('b', 600));
    expect(moveDivider(even, 0, 610, 60, NOW)).toBe(even);
  });
});

describe('setDurationExact', () => {
  it('takes from the next segment, or the previous one when last', () => {
    const s3 = list(seg('a', 600), seg('b', 600), seg('c', 600));
    expect(durs(setDurationExact(s3, 'a', 630, 60, NOW))).toEqual([630, 570, 600]);
    expect(durs(setDurationExact(s3, 'c', 545, 60, NOW))).toEqual([600, 655, 545]);
  });

  it('clamps the neighbor at min(its size, one step) and never goes below 1 s', () => {
    const s = list(seg('a', 600), seg('b', 600));
    expect(maxExactSec(s, 'a', 60)).toBe(1140);
    expect(durs(setDurationExact(s, 'a', 99_999, 60, NOW))).toEqual([1140, 60]);
    expect(durs(setDurationExact(s, 'a', 0, 60, NOW))).toEqual([1, 1199]);
    const tinyNeighbor = list(seg('a', 600), seg('b', 20));
    expect(setDurationExact(tinyNeighbor, 'a', 700, 60, NOW)).toBe(tinyNeighbor);
  });

  it('a 30 s segment in a 60 min session stays editable', () => {
    const s = list(seg('big', 3570), seg('tiny', 30));
    expect(durs(setDurationExact(s, 'tiny', 45, 60, NOW))).toEqual([3555, 45]);
    expect(durs(setDurationExact(s, 'tiny', 10, 60, NOW))).toEqual([3590, 10]);
  });

  it('the only segment cannot change (total is fixed)', () => {
    const one = list(seg('a', 600));
    expect(setDurationExact(one, 'a', 300, 60, NOW)).toBe(one);
  });
});

describe('splitSegment', () => {
  it('exact halves, new untitled half inserted after, orders renumbered', () => {
    const s = list(seg('a', 601, { taskId: 'x', completed: false }), seg('b', 300));
    const r = splitSegment(s, 'a', 60, NOW, ids);
    expect(r.map((g) => [g.taskId, g.durationSec, g.order])).toEqual([
      ['x', 301, 0],
      [null, 300, 1],
      [null, 300, 2],
    ]);
    expect(r[1]).toMatchObject({ completed: true, excluded: false, source: 'edited', editedAt: NOW });
    expect(r[1].startedAt).toBeUndefined();
    expect(r[0]).toMatchObject({ source: 'edited', startedAt: 1000, completed: false });
    expect(r[2].editedAt).toBe(NOW); // order changed
    expect(sumSec(r)).toBe(sumSec(s));
  });

  it('is refused under 2 steps', () => {
    const s = list(seg('a', 119));
    expect(canSplit(s[0], 60)).toBe(false);
    expect(splitSegment(s, 'a', 60, NOW, ids)).toBe(s);
  });
});

describe('deleteSegment', () => {
  it('named → unassigned in place, time stays (also as the only segment)', () => {
    const s = list(seg('a', 300, { taskId: 'x' }));
    const r = deleteSegment(s, 'a', NOW);
    expect(r[0]).toMatchObject({ taskId: null, durationSec: 300, source: 'live', editedAt: NOW });
  });

  it('untitled → merged into the one above, or below when first', () => {
    const s = list(seg('a', 100, { taskId: 'x' }), seg('b', 50), seg('c', 30, { taskId: 'y' }));
    expect(deleteSegment(s, 'b', NOW).map((g) => [g.id, g.durationSec, g.order])).toEqual([
      ['a', 150, 0],
      ['c', 30, 1],
    ]);
    const first = list(seg('a', 50), seg('b', 100, { taskId: 'x' }));
    expect(deleteSegment(first, 'a', NOW).map((g) => [g.id, g.durationSec])).toEqual([['b', 150]]);
  });

  it('the only untitled segment cannot be deleted', () => {
    const s = list(seg('a', 300));
    expect(deleteSegment(s, 'a', NOW)).toBe(s);
  });
});

describe('order, assignment and toggles', () => {
  it('reorder renumbers and stamps editedAt but not source; startedAt kept', () => {
    const s = list(seg('a', 1), seg('b', 2), seg('c', 3));
    const r = reorder(s, 2, 0, NOW);
    expect(r.map((g) => [g.id, g.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    for (const g of r) expect(g).toMatchObject({ source: 'live', editedAt: NOW, startedAt: 1000 });
  });

  it('assign / completed / excluded stamp editedAt only', () => {
    let s = list(seg('a', 60));
    s = assign(s, 'a', 'dishes', NOW);
    s = setCompleted(s, 'a', false, NOW + 1);
    s = setExcluded(s, 'a', true, NOW + 2);
    expect(s[0]).toMatchObject({ taskId: 'dishes', completed: false, excluded: true, source: 'live', editedAt: NOW + 2 });
    expect(assign(s, 'a', 'dishes', NOW)).toBe(s); // no-op
  });
});

describe('remainder and legacy sessions', () => {
  it('a short session gets a virtual untitled remainder; complete ones do not', () => {
    const s = list(seg('a', 600));
    const r = withRemainder(s, 's', 900);
    expect(r).toHaveLength(2);
    expect(isVirtual(r[1])).toBe(true);
    expect(r[1]).toMatchObject({ taskId: null, durationSec: 300, order: 1 });
    expect(withRemainder(s, 's', 600)).toBe(s);
  });

  it('over-allocated sessions use the segment sum as bar length', () => {
    expect(barLengthSec(list(seg('a', 700), seg('b', 400)), 1000)).toBe(1100);
    expect(barLengthSec(list(seg('a', 600)), 1000)).toBe(1000);
  });
});

describe('zero-sum invariant', () => {
  it('19:00 untitled → dishes 9 / laundry 7 / stretching 3 with + and drags only', () => {
    const step = 60;
    let s = list(seg('only', 19 * 60));
    s = splitSegment(s, s[s.length - 1].id, step, NOW, ids); // +
    s = splitSegment(s, s[s.length - 1].id, step, NOW, ids); // +
    expect(durs(s)).toEqual([570, 285, 285]);
    s = moveDivider(s, 0, 9 * 60, step, NOW);
    s = moveDivider(s, 1, 7 * 60, step, NOW);
    s = assign(s, s[0].id, 'dishes', NOW);
    s = assign(s, s[1].id, 'laundry', NOW);
    s = assign(s, s[2].id, 'stretching', NOW);
    expect(s.map((g) => [g.taskId, g.durationSec])).toEqual([
      ['dishes', 540],
      ['laundry', 420],
      ['stretching', 180],
    ]);
  });

  it('200 random edits never change the total or produce empty segments', () => {
    let seed = 42;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % k;
    };
    let s = list(seg('a', 1800), seg('b', 900, { taskId: 'x' }), seg('c', 37));
    const total = sumSec(s);
    for (let k = 0; k < 200; k++) {
      const i = rnd(s.length);
      const op = rnd(6);
      if (op === 0) s = moveDivider(s, Math.min(i, s.length - 2), rnd(total), 60, NOW);
      else if (op === 1) s = setDurationExact(s, s[i].id, rnd(total), 60, NOW);
      else if (op === 2) s = splitSegment(s, s[i].id, 60, NOW, ids);
      else if (op === 3) s = deleteSegment(s, s[i].id, NOW);
      else if (op === 4) s = reorder(s, i, rnd(s.length), NOW);
      else s = assign(s, s[i].id, rnd(2) ? 'x' : null, NOW);
      expect(sumSec(s)).toBe(total);
      expect(s.every((g) => g.durationSec > 0)).toBe(true);
      expect(s.map((g) => g.order)).toEqual(s.map((_, j) => j));
    }
  });
});
