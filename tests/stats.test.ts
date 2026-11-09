import { describe, expect, it } from 'vitest';
import type { Segment, Session, Task } from '../src/lib/model';
import { computeAllStats, durationLabel, expectedSec } from '../src/lib/stats/stats';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Dishes',
  durationMode: 'fixed',
  medianAlert: true,
  archived: false,
  createdAt: 0,
  ...over,
});
const session = (id: string, startedAt: number, discarded = false): Session => ({
  id,
  startedAt,
  endedAt: startedAt + 1,
  startSource: 'quick',
  pauses: [],
  discarded,
});
let n = 0;
const seg = (sessionId: string, durationSec: number, over: Partial<Segment> = {}): Segment => ({
  id: `g${n++}`,
  sessionId,
  order: 0,
  taskId: 't1',
  durationSec,
  completed: true,
  source: 'live',
  excluded: false,
  ...over,
});

describe('median', () => {
  it('ignores excluded, short, unfinished-fixed and discarded segments', () => {
    const sessions = [session('a', 1), session('b', 2), session('c', 3, true)];
    const segments = [
      seg('a', 600),
      seg('a', 700, { order: 1 }),
      seg('a', 900, { order: 2 }),
      seg('b', 5000, { excluded: true }),
      seg('b', 20, { order: 1 }), // < 30s
      seg('b', 4000, { order: 2, completed: false }), // unfinished fixed
      seg('c', 9000), // discarded session
    ];
    const st = computeAllStats([task()], sessions, segments).get('t1')!;
    expect(st.medianSec).toBe(700);
    expect(st.sampleSize).toBe(3);
  });

  it('counts unfinished segments for flexible tasks', () => {
    const t = task({ durationMode: 'flexible' });
    const st = computeAllStats([t], [session('a', 1)], [seg('a', 100), seg('a', 300, { order: 1, completed: false })]).get('t1')!;
    expect(st.medianSec).toBe(200);
  });

  it('uses only the last 10 qualifying segments', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => session(`s${i}`, i));
    // First two are huge outliers; they fall out of the window of 10.
    const segments = sessions.map((s, i) => seg(s.id, i < 2 ? 99_999 : 60 + i));
    const st = computeAllStats([task()], sessions, segments).get('t1')!;
    expect(st.sampleSize).toBe(10);
    expect(st.medianSec).toBe((60 + 6 + 60 + 7) / 2);
  });

  it('last done and counts skip discarded sessions', () => {
    const sessions = [session('a', 100), session('b', 200), session('c', 300, true)];
    const segments = [seg('a', 60), seg('b', 60, { completed: false }), seg('c', 60)];
    const st = computeAllStats([task()], sessions, segments).get('t1')!;
    expect(st.lastDoneAt).toBe(100);
    expect(st.sessionCount).toBe(2);
    expect(st.segmentCount).toBe(2);
  });

  it('falls back to estimate (fixed) or range (flexible)', () => {
    const empty = computeAllStats([task({ estimateMin: 7 })], [], []).get('t1');
    expect(expectedSec(task({ estimateMin: 7 }), empty)).toBe(420);
    expect(durationLabel(task({ estimateMin: 7 }), empty)).toBe('est. 7 min');
    const flex = task({ durationMode: 'flexible', minMin: 10, maxMin: null });
    expect(expectedSec(flex, empty)).toBeNull();
    expect(durationLabel(flex, empty)).toBe('10 min+ · open-ended');
    expect(durationLabel(task({ durationMode: 'flexible', minMin: 5, maxMin: 30 }), empty)).toBe('5–30 min');
  });
});
