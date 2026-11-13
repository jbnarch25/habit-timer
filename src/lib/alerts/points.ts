// Pure alert-point computation. Times are session "active ms" (paused time excluded).

export type AlertKind = 'window' | 'task';

export interface AlertPoint {
  id: AlertKind;
  /** Session active ms at which the point fires. */
  atSessionMs: number;
  /** Spoken text (voice is off by default) and banner text if it passed while away. */
  text: string;
}

export interface AlertInputs {
  windowMin?: number;
  taskName?: string;
  /** Typical time (goal, else median) in seconds; null = none. */
  typicalSec: number | null;
  /** task.taskAlert */
  taskAlert: boolean;
}

/** A point this close in the past is still played rather than shown as a stale banner. */
export const LATE_GRACE_MS = 3000;

/** The task alert is skipped when it falls within this distance of the window alert. */
export const COLLISION_MS = 60_000;

export const minutesText = (min: number) => {
  const m = Math.round(min);
  return `${m} minute${m === 1 ? '' : 's'}`;
};

/** Window alert at windowMin; one task alert at the typical time, unless it collides with the window alert. */
export function computePoints(input: AlertInputs): AlertPoint[] {
  const points: AlertPoint[] = [];
  const windowMs = input.windowMin ? input.windowMin * 60_000 : null;
  if (windowMs != null) {
    points.push({ id: 'window', atSessionMs: windowMs, text: `${minutesText(input.windowMin!)}.` });
  }
  if (input.taskAlert && input.typicalSec != null && input.taskName) {
    const at = input.typicalSec * 1000;
    if (windowMs == null || Math.abs(at - windowMs) > COLLISION_MS) {
      points.push({
        id: 'task',
        atSessionMs: at,
        text: `${input.taskName} usually takes ${minutesText(Math.max(1, input.typicalSec / 60))}.`,
      });
    }
  }
  return points.sort((a, b) => a.atSessionMs - b.atSessionMs);
}

export interface AlertPlan {
  /** Passed without being announced (app was backgrounded/killed): show a banner, don't play. */
  stale: AlertPoint[];
  /** Still ahead (or just now): schedule. */
  upcoming: AlertPoint[];
}

export function planAlerts(points: AlertPoint[], fired: string[], nowSessionMs: number): AlertPlan {
  const unfired = points.filter((p) => !fired.includes(p.id));
  return {
    stale: unfired.filter((p) => p.atSessionMs < nowSessionMs - LATE_GRACE_MS),
    upcoming: unfired.filter((p) => p.atSessionMs >= nowSessionMs - LATE_GRACE_MS),
  };
}
