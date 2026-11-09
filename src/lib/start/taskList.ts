import type { Task } from '../model';
import { fillMin, fitsWindow, typicalMin, type TaskStats } from '../stats/stats';

type StatsMap = Map<string, TaskStats>;

/**
 * Window left after the queue, applied in queue order: each task fills against what remains.
 * Unknown-estimate fixed tasks contribute 0.
 */
export function remainingWindow(W: number, queued: Task[], stats: StatsMap): number {
  let rem = W;
  for (const t of queued) rem -= fillMin(t, stats.get(t.id), Math.max(0, rem));
  return rem;
}

/** Bottom-bar totals for a set window: minutes the queue fills, and how many fixed tasks have no estimate. */
export function queueTotals(queued: Task[], stats: StatsMap, W: number) {
  const unknown = queued.filter((t) => t.durationMode === 'fixed' && typicalMin(t, stats.get(t.id)) == null).length;
  return { min: W - remainingWindow(W, queued, stats), unknown };
}

export interface TaskList {
  fits: Task[];
  noEstimate: Task[];
}

/**
 * Step 2 list. W = null means ∞: no filtering, most recently used first.
 * Otherwise: fitting tasks by fill descending (ties: never done first, then least recently done),
 * then fixed tasks without any estimate. Archived and already-queued tasks never appear.
 */
export function buildTaskList(tasks: Task[], stats: StatsMap, W: number | null, queuedIds: string[]): TaskList {
  const pool = tasks.filter((t) => !t.archived && !queuedIds.includes(t.id));
  if (W == null) {
    const used = (t: Task) => stats.get(t.id)?.lastUsedAt ?? null;
    const fits = [...pool].sort((a, b) => {
      const ua = used(a), ub = used(b);
      if (ua != null && ub != null) return ub - ua;
      if (ua != null) return -1;
      if (ub != null) return 1;
      return a.name.localeCompare(b.name);
    });
    return { fits, noEstimate: [] };
  }
  const fits: Task[] = [];
  const noEstimate: Task[] = [];
  for (const t of pool) {
    const f = fitsWindow(t, stats.get(t.id), W);
    if (f === 'fits') fits.push(t);
    else if (f === 'unknown') noEstimate.push(t);
  }
  const done = (t: Task) => stats.get(t.id)?.lastDoneAt ?? -Infinity; // never done sorts first
  fits.sort((a, b) => fillMin(b, stats.get(b.id), W) - fillMin(a, stats.get(a.id), W) || done(a) - done(b));
  noEstimate.sort((a, b) => a.name.localeCompare(b.name));
  return { fits, noEstimate };
}
