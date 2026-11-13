import type { Task } from '../model';
import { fitsWindow, type TaskStats } from '../stats/stats';

export type SortKey = 'name' | 'lastDone';
export interface Sort {
  key: SortKey;
  asc: boolean;
}

/** Default: last done, oldest first, so never-done and neglected tasks come up top. */
export const DEFAULT_SORT: Sort = { key: 'lastDone', asc: true };

/**
 * Task-selection rows: non-archived tasks that pass the window filter (W = null is ∞: no filtering), sorted.
 * Never-done tasks count as oldest. Ties fall back to name.
 */
export function buildTaskList(tasks: Task[], stats: Map<string, TaskStats>, W: number | null, sort: Sort): Task[] {
  const done = (t: Task) => stats.get(t.id)?.lastDoneAt ?? -Infinity;
  const byName = (a: Task, b: Task) => a.name.localeCompare(b.name);
  const dir = sort.asc ? 1 : -1;
  return tasks
    .filter((t) => !t.archived && fitsWindow(t, stats.get(t.id), W))
    .sort((a, b) =>
      sort.key === 'name' ? dir * byName(a, b) : dir * Math.sign(done(a) - done(b)) || byName(a, b),
    );
}
