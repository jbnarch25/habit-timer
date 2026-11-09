import { describe, expect, it } from 'vitest';
import { coalesceThresholdMs, computeRawPoints, medianPointId, planAlerts, WINDOW_POINT_ID } from '../src/lib/alerts/points';

const min = (m: number) => m * 60_000;

describe('alert points', () => {
  const base = { lapStartedAt: 123, lapStartSessionMs: 0, taskName: 'Dishes', medianAlert: true };

  it('coalesces window and median within threshold, firing at the earlier time', () => {
    const raw = computeRawPoints({ ...base, windowMin: 20, expectedSec: 22 * 60 });
    const thr = coalesceThresholdMs(20, 2, 15); // max(2 min, 3 min) = 3 min
    expect(thr).toBe(min(3));
    const plan = planAlerts(raw, [], 0, thr);
    expect(plan.upcoming).toHaveLength(1);
    expect(plan.upcoming[0].atSessionMs).toBe(min(20));
    expect(plan.upcoming[0].ids).toEqual([WINDOW_POINT_ID, medianPointId(123)]);
    expect(plan.upcoming[0].text).toBe('20 minutes. Dishes usually takes 22 minutes.');
  });

  it('keeps points apart when beyond threshold', () => {
    const raw = computeRawPoints({ ...base, windowMin: 20, expectedSec: 10 * 60 });
    expect(planAlerts(raw, [], 0, coalesceThresholdMs(20, 2, 15)).upcoming).toHaveLength(2);
  });

  it('median is measured from the lap start and skipped when disabled or unknown', () => {
    const raw = computeRawPoints({ ...base, lapStartSessionMs: min(5), expectedSec: 300 });
    expect(raw[0].atSessionMs).toBe(min(10));
    expect(computeRawPoints({ ...base, medianAlert: false, expectedSec: 300 })).toHaveLength(0);
    expect(computeRawPoints({ ...base, expectedSec: null })).toHaveLength(0);
  });

  it('does not let an already-fired point swallow a new one', () => {
    const raw = computeRawPoints({ ...base, windowMin: 20, lapStartSessionMs: min(19), expectedSec: 60 });
    const plan = planAlerts(raw, [WINDOW_POINT_ID], min(19.5), coalesceThresholdMs(20, 2, 15));
    expect(plan.upcoming.map((p) => p.ids)).toEqual([[medianPointId(123)]]);
  });

  it('points passed while away are stale, not scheduled', () => {
    const raw = computeRawPoints({ ...base, windowMin: 10, expectedSec: 30 * 60 });
    const plan = planAlerts(raw, [], min(12), min(2));
    expect(plan.stale.map((p) => p.ids)).toEqual([[WINDOW_POINT_ID]]);
    expect(plan.upcoming.map((p) => p.ids)).toEqual([[medianPointId(123)]]);
  });
});
