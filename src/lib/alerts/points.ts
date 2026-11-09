// Pure alert-point computation. Times are session "active ms" (paused time excluded).

export interface AlertPoint {
  /** Raw point ids merged into this one. Recorded in ActiveSession.alertsFired once handled. */
  ids: string[];
  /** Session active ms at which the point fires. */
  atSessionMs: number;
  text: string;
}

export interface AlertInputs {
  windowMin?: number;
  /** Session active ms at which the current lap started. */
  lapStartSessionMs: number;
  lapStartedAt: number;
  taskName?: string;
  /** Expected duration for the current task (median or estimate), seconds. Null = no median alert. */
  expectedSec: number | null;
  medianAlert: boolean;
}

export const WINDOW_POINT_ID = 'window';
export const medianPointId = (lapStartedAt: number) => `median:${lapStartedAt}`;

/** A point this close in the past is still played rather than shown as a stale banner. */
export const LATE_GRACE_MS = 3000;

export const minutesText = (min: number) => {
  const m = Math.round(min);
  return `${m} minute${m === 1 ? '' : 's'}`;
};

export function coalesceThresholdMs(windowMin: number | undefined, minMin: number, pct: number): number {
  const base = minMin * 60_000;
  return windowMin ? Math.max(base, (windowMin * 60_000 * pct) / 100) : base;
}

/** Raw (uncoalesced) points for the current session/lap. */
export function computeRawPoints(input: AlertInputs): AlertPoint[] {
  const raw: AlertPoint[] = [];
  if (input.windowMin) {
    raw.push({ ids: [WINDOW_POINT_ID], atSessionMs: input.windowMin * 60_000, text: `${minutesText(input.windowMin)}.` });
  }
  if (input.medianAlert && input.expectedSec != null && input.taskName) {
    raw.push({
      ids: [medianPointId(input.lapStartedAt)],
      atSessionMs: input.lapStartSessionMs + input.expectedSec * 1000,
      text: `${input.taskName} usually takes ${minutesText(Math.max(1, input.expectedSec / 60))}.`,
    });
  }
  return raw;
}

/** Merge points within `thresholdMs` of each other into one that fires at the earliest time. */
export function coalesce(points: AlertPoint[], thresholdMs: number): AlertPoint[] {
  const sorted = [...points].sort((a, b) => a.atSessionMs - b.atSessionMs);
  const out: AlertPoint[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p.atSessionMs - last.atSessionMs <= thresholdMs) {
      last.ids.push(...p.ids);
      last.text = `${last.text} ${p.text}`;
    } else {
      out.push({ ...p, ids: [...p.ids] });
    }
  }
  return out;
}

export interface AlertPlan {
  /** Passed without being announced (app was backgrounded/killed): show a banner, don't play. */
  stale: AlertPoint[];
  /** Still ahead (or just now): schedule, coalesced. */
  upcoming: AlertPoint[];
}

export function planAlerts(raw: AlertPoint[], fired: string[], nowSessionMs: number, thresholdMs: number): AlertPlan {
  const unfired = raw.filter((p) => !p.ids.some((id) => fired.includes(id)));
  const stale = unfired.filter((p) => p.atSessionMs < nowSessionMs - LATE_GRACE_MS);
  const future = unfired.filter((p) => p.atSessionMs >= nowSessionMs - LATE_GRACE_MS);
  return { stale, upcoming: coalesce(future, thresholdMs) };
}
