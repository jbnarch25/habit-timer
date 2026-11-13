import type { Session, Task } from '../model';

export const MEDIAN_SAMPLE = 10;
export const MIN_QUALIFYING_SEC = 30;

export interface TaskStats {
  /** Median durationSec of the last MEDIAN_SAMPLE sessions of at least MIN_QUALIFYING_SEC. */
  medianSec: number | null;
  sampleSize: number;
  /** startedAt of the most recent session. */
  lastDoneAt: number | null;
  sessionCount: number;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Stats for every task in one pass. */
export function computeAllStats(tasks: Task[], sessions: Session[]): Map<string, TaskStats> {
  const byTask = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byTask.get(s.taskId);
    if (list) list.push(s);
    else byTask.set(s.taskId, [s]);
  }
  const result = new Map<string, TaskStats>();
  for (const task of tasks) {
    const list = (byTask.get(task.id) ?? []).sort((a, b) => a.startedAt - b.startedAt);
    const qualifying = list.filter((s) => s.durationSec >= MIN_QUALIFYING_SEC).slice(-MEDIAN_SAMPLE);
    result.set(task.id, {
      medianSec: median(qualifying.map((s) => s.durationSec)),
      sampleSize: qualifying.length,
      lastDoneAt: list.length ? list[list.length - 1].startedAt : null,
      sessionCount: list.length,
    });
  }
  return result;
}

/** Typical time in seconds: goal if set, otherwise median. Null if neither exists. */
export function typicalSec(task: Task, stats: TaskStats | undefined): number | null {
  if (task.goalMin != null) return task.goalMin * 60;
  return stats?.medianSec ?? null;
}

/**
 * Window filter: the first property set decides (min chunk, max, goal, median); none → always shows.
 * W = null is an infinite window: everything shows.
 */
export function fitsWindow(task: Task, stats: TaskStats | undefined, W: number | null): boolean {
  if (W == null) return true;
  if (task.minChunkMin != null) return task.minChunkMin <= W;
  if (task.maxMin != null) return task.maxMin <= W;
  if (task.goalMin != null) return task.goalMin <= W;
  if (stats?.medianSec != null) return stats.medianSec / 60 <= W;
  return true;
}
